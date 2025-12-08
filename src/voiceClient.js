import {
    joinVoiceChannel,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    EndBehaviorType
} from '@discordjs/voice';
import { ChannelType } from 'discord.js';
import { sttClient } from './sttClient.js';
import { logger } from './logger.js';
import prism from 'prism-media';

/**
 * Voice Client for Discord
 * Handles joining voice channels and receiving audio streams
 */
class VoiceClient {
    constructor() {
        this.activeConnections = new Map(); // guildId -> { connection, textChannel, audioStreams }
        this.userTranscripts = new Map(); // guildId -> Map(userId -> { interim, final[] })
    }

    /**
     * Join a voice channel
     * @param {Object} voiceChannel - Discord voice channel
     * @param {Object} textChannel - Text channel to output transcripts to
     * @returns {Object|null} Voice connection or null if failed
     */
    async join(voiceChannel, textChannel) {
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
            logger.error('VOICE', 'Invalid voice channel provided');
            return null;
        }

        const guildId = voiceChannel.guild.id;

        // Check if already connected to this guild
        if (this.activeConnections.has(guildId)) {
            const existing = this.activeConnections.get(guildId);
            if (existing.connection.joinConfig.channelId === voiceChannel.id) {
                return existing.connection;
            }
            // Leave existing channel before joining new one
            await this.leave(guildId);
        }

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false, // We need to hear audio
                selfMute: true,  // Bot doesn't speak (for now)
            });

            // Wait for connection to be ready
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

            logger.info('VOICE', `Joined voice channel "${voiceChannel.name}" in guild "${voiceChannel.guild.name}"`);

            // Store connection info
            this.activeConnections.set(guildId, {
                connection,
                textChannel,
                voiceChannel,
                audioStreams: new Map(),
                isListening: false
            });

            // Initialize user transcripts for this guild
            this.userTranscripts.set(guildId, new Map());

            // Setup connection event handlers
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                    // Seems to be reconnecting, don't destroy
                } catch (error) {
                    // Not reconnecting, clean up
                    connection.destroy();
                    this.cleanup(guildId);
                }
            });

            connection.on(VoiceConnectionStatus.Destroyed, () => {
                this.cleanup(guildId);
            });

            return connection;
        } catch (error) {
            logger.error('VOICE', `Failed to join voice channel: ${error.message}`);
            return null;
        }
    }

    /**
     * Start listening to voice and transcribing
     * @param {string} guildId - Guild ID
     * @returns {boolean} Success
     */
    async startListening(guildId) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo) {
            logger.error('VOICE', `Not connected to any voice channel in guild ${guildId}`);
            return false;
        }

        if (connectionInfo.isListening) {
            logger.warn('VOICE', `Already listening in guild ${guildId}`);
            return true;
        }

        // Initialize STT client if needed
        if (!sttClient.deepgram) {
            if (!sttClient.initialize()) {
                await connectionInfo.textChannel.send('❌ Voice transcription is not configured. Please set `DEEPGRAM_API_KEY` in the environment.');
                return false;
            }
        }

        // Create STT connection
        const sttConnection = await sttClient.createConnection(guildId, (error, transcript, isFinal, confidence, isUtteranceEnd) => {
            if (error) {
                logger.error('VOICE', `STT error: ${error.message}`);
                return;
            }

            // Handle transcripts - we'll aggregate them per-speaker
            if (transcript) {
                this.handleTranscript(guildId, transcript, isFinal, confidence);
            }
        });

        if (!sttConnection) {
            await connectionInfo.textChannel.send('❌ Failed to connect to transcription service.');
            return false;
        }

        // Get the receiver from the connection
        const receiver = connectionInfo.connection.receiver;

        // Listen for when users start speaking
        receiver.speaking.on('start', (userId) => {
            this.startUserStream(guildId, userId, receiver);
        });

        connectionInfo.isListening = true;
        logger.info('VOICE', `Started listening in guild ${guildId}`);

        await connectionInfo.textChannel.send('🎤 **Now listening!** I\'ll transcribe what people say in the voice channel.');

        return true;
    }

    /**
     * Start streaming audio from a specific user
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {Object} receiver - Voice receiver
     */
    startUserStream(guildId, userId, receiver) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo || connectionInfo.audioStreams.has(userId)) {
            return;
        }

        try {
            // Subscribe to the user's audio
            const audioStream = receiver.subscribe(userId, {
                end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: 1000, // 1 second of silence ends the stream
                }
            });

            // Create an Opus decoder to convert to PCM
            // Deepgram can handle raw Opus, so we'll send it directly
            const opusStream = audioStream;

            // Store the stream
            connectionInfo.audioStreams.set(userId, opusStream);

            // Forward audio to STT
            opusStream.on('data', (chunk) => {
                sttClient.sendAudio(guildId, chunk);
            });

            opusStream.on('end', () => {
                connectionInfo.audioStreams.delete(userId);
                logger.debug('VOICE', `Audio stream ended for user ${userId} in guild ${guildId}`);
            });

            opusStream.on('error', (error) => {
                logger.error('VOICE', `Audio stream error for user ${userId}: ${error.message}`);
                connectionInfo.audioStreams.delete(userId);
            });

            logger.debug('VOICE', `Started audio stream for user ${userId} in guild ${guildId}`);
        } catch (error) {
            logger.error('VOICE', `Failed to start user stream: ${error.message}`);
        }
    }

    /**
     * Handle incoming transcript
     * @param {string} guildId - Guild ID
     * @param {string} transcript - The transcribed text
     * @param {boolean} isFinal - Whether this is a final result
     * @param {number} confidence - Confidence score
     */
    async handleTranscript(guildId, transcript, isFinal, confidence) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo) return;

        // For now, just output final transcripts to the text channel
        if (isFinal && transcript.trim()) {
            try {
                // Format the output
                const output = `🗣️ **Transcript:** ${transcript}`;
                await connectionInfo.textChannel.send(output);
                logger.info('VOICE', `Transcript: "${transcript}" (confidence: ${(confidence * 100).toFixed(1)}%)`);
            } catch (error) {
                logger.error('VOICE', `Failed to send transcript: ${error.message}`);
            }
        }
    }

    /**
     * Stop listening but stay in voice channel
     * @param {string} guildId - Guild ID
     */
    async stopListening(guildId) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo) return;

        if (!connectionInfo.isListening) {
            logger.warn('VOICE', `Not currently listening in guild ${guildId}`);
            return;
        }

        // Close STT connection
        await sttClient.closeConnection(guildId);

        // Clear audio streams
        for (const [userId, stream] of connectionInfo.audioStreams) {
            stream.destroy();
        }
        connectionInfo.audioStreams.clear();

        connectionInfo.isListening = false;

        await connectionInfo.textChannel.send('🔇 **Stopped listening.** Still in the voice channel.');
        logger.info('VOICE', `Stopped listening in guild ${guildId}`);
    }

    /**
     * Leave voice channel
     * @param {string} guildId - Guild ID
     */
    async leave(guildId) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo) {
            // Try to get connection directly
            const connection = getVoiceConnection(guildId);
            if (connection) {
                connection.destroy();
            }
            return;
        }

        // Stop listening if active
        if (connectionInfo.isListening) {
            await this.stopListening(guildId);
        }

        // Destroy the connection
        connectionInfo.connection.destroy();
        this.cleanup(guildId);

        logger.info('VOICE', `Left voice channel in guild ${guildId}`);
    }

    /**
     * Cleanup after disconnection
     * @param {string} guildId - Guild ID
     */
    cleanup(guildId) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (connectionInfo) {
            // Clear audio streams
            for (const stream of connectionInfo.audioStreams.values()) {
                try {
                    stream.destroy();
                } catch (e) { }
            }
        }

        this.activeConnections.delete(guildId);
        this.userTranscripts.delete(guildId);
        sttClient.closeConnection(guildId);
    }

    /**
     * Check if connected to a voice channel in a guild
     * @param {string} guildId - Guild ID
     * @returns {boolean}
     */
    isConnected(guildId) {
        return this.activeConnections.has(guildId);
    }

    /**
     * Check if listening in a guild
     * @param {string} guildId - Guild ID
     * @returns {boolean}
     */
    isListening(guildId) {
        const connectionInfo = this.activeConnections.get(guildId);
        return connectionInfo?.isListening || false;
    }

    /**
     * Get the voice channel info for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object|null}
     */
    getConnectionInfo(guildId) {
        return this.activeConnections.get(guildId) || null;
    }

    /**
     * Get active connection count
     * @returns {number}
     */
    getConnectionCount() {
        return this.activeConnections.size;
    }

    /**
     * Leave all voice channels
     */
    async leaveAll() {
        for (const guildId of this.activeConnections.keys()) {
            await this.leave(guildId);
        }
        logger.info('VOICE', 'Left all voice channels');
    }
}

// Export singleton
export const voiceClient = new VoiceClient();
