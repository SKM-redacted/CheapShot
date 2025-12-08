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

/**
 * Voice Client for Discord
 * Handles joining voice channels and receiving audio streams
 * Uses per-user audio streams to accurately identify speakers
 */
class VoiceClient {
    constructor() {
        this.activeConnections = new Map(); // guildId -> { connection, textChannel, userStreams, members }
        this.userTranscriptBuffers = new Map(); // guildId -> Map(userId -> { words: [], lastUpdate })
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

            // Store connection info with per-user tracking
            this.activeConnections.set(guildId, {
                connection,
                textChannel,
                voiceChannel,
                userStreams: new Map(),     // userId -> { stream, sttConnection }
                members: new Map(),          // userId -> { username, displayName }
                isListening: false
            });

            // Initialize user transcript buffers for this guild
            this.userTranscriptBuffers.set(guildId, new Map());

            // Cache current voice channel members
            await this.cacheVoiceMembers(guildId, voiceChannel);

            // Setup connection event handlers
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
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
     * Cache voice channel members for user identification
     * @param {string} guildId - Guild ID
     * @param {Object} voiceChannel - Voice channel
     */
    async cacheVoiceMembers(guildId, voiceChannel) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo) return;

        try {
            // Get all members in the voice channel
            for (const [memberId, member] of voiceChannel.members) {
                if (!member.user.bot) { // Skip bots
                    connectionInfo.members.set(memberId, {
                        id: memberId,
                        username: member.user.username,
                        displayName: member.displayName || member.user.username,
                        discriminator: member.user.discriminator
                    });
                    logger.debug('VOICE', `Cached member: ${member.displayName} (${memberId})`);
                }
            }
        } catch (error) {
            logger.error('VOICE', `Failed to cache voice members: ${error.message}`);
        }
    }

    /**
     * Get member info from cache or fetch it
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @returns {Object} Member info
     */
    async getMemberInfo(guildId, userId) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo) return { displayName: 'Unknown User', username: 'unknown' };

        // Check cache first
        if (connectionInfo.members.has(userId)) {
            return connectionInfo.members.get(userId);
        }

        // Try to fetch from guild
        try {
            const guild = connectionInfo.voiceChannel.guild;
            const member = await guild.members.fetch(userId);
            const info = {
                id: userId,
                username: member.user.username,
                displayName: member.displayName || member.user.username,
                discriminator: member.user.discriminator
            };
            connectionInfo.members.set(userId, info);
            return info;
        } catch (e) {
            return { displayName: `User ${userId.slice(-4)}`, username: 'unknown' };
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

        // Get the receiver from the connection
        const receiver = connectionInfo.connection.receiver;

        // Listen for when users start speaking
        receiver.speaking.on('start', async (userId) => {
            await this.handleUserSpeaking(guildId, userId, receiver);
        });

        connectionInfo.isListening = true;
        logger.info('VOICE', `Started listening in guild ${guildId}`);

        await connectionInfo.textChannel.send('🎤 **Now listening!** I\'ll transcribe what people say and show who said it.');

        return true;
    }

    /**
     * Handle when a user starts speaking
     * Creates or reuses a per-user STT connection
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {Object} receiver - Voice receiver
     */
    async handleUserSpeaking(guildId, userId, receiver) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo || connectionInfo.userStreams.has(userId)) {
            return; // Already have a stream for this user
        }

        try {
            // Get member info for display
            const memberInfo = await this.getMemberInfo(guildId, userId);
            logger.debug('VOICE', `${memberInfo.displayName} started speaking`);

            // Subscribe to the user's audio
            const audioStream = receiver.subscribe(userId, {
                end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: 1500, // 1.5 seconds of silence ends the stream
                }
            });

            // Create a dedicated STT connection for this user
            const sttConnectionId = `${guildId}-${userId}`;
            const sttConnection = await sttClient.createConnection(
                sttConnectionId,
                async (error, transcript, isFinal, confidence) => {
                    if (error) {
                        logger.error('VOICE', `STT error for user ${userId}: ${error.message}`);
                        return;
                    }

                    if (transcript && transcript.trim()) {
                        await this.handleUserTranscript(guildId, userId, transcript, isFinal, confidence, memberInfo);
                    }
                }
            );

            if (!sttConnection) {
                logger.error('VOICE', `Failed to create STT connection for user ${userId}`);
                return;
            }

            // Store the stream info
            connectionInfo.userStreams.set(userId, {
                audioStream,
                sttConnectionId,
                memberInfo
            });

            // Forward audio to STT
            audioStream.on('data', (chunk) => {
                sttClient.sendAudio(sttConnectionId, chunk);
            });

            audioStream.on('end', async () => {
                // Clean up when user stops speaking
                await sttClient.closeConnection(sttConnectionId);
                connectionInfo.userStreams.delete(userId);
                logger.debug('VOICE', `${memberInfo.displayName} stopped speaking`);
            });

            audioStream.on('error', async (error) => {
                logger.error('VOICE', `Audio stream error for ${memberInfo.displayName}: ${error.message}`);
                await sttClient.closeConnection(sttConnectionId);
                connectionInfo.userStreams.delete(userId);
            });

        } catch (error) {
            logger.error('VOICE', `Failed to handle user speaking: ${error.message}`);
        }
    }

    /**
     * Handle incoming transcript for a specific user
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} transcript - The transcribed text
     * @param {boolean} isFinal - Whether this is a final result
     * @param {number} confidence - Confidence score
     * @param {Object} memberInfo - Member display info
     */
    async handleUserTranscript(guildId, userId, transcript, isFinal, confidence, memberInfo) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo) return;

        // Only output final transcripts
        if (isFinal && transcript.trim()) {
            try {
                // Format with user's display name and avatar-like prefix
                const output = `🗣️ **${memberInfo.displayName}:** ${transcript}`;
                await connectionInfo.textChannel.send(output);

                logger.info('VOICE', `[${memberInfo.displayName}] "${transcript}" (${(confidence * 100).toFixed(1)}%)`);
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

        // Clean up all user streams and STT connections
        for (const [userId, streamInfo] of connectionInfo.userStreams) {
            try {
                streamInfo.audioStream.destroy();
                await sttClient.closeConnection(streamInfo.sttConnectionId);
            } catch (e) { }
        }
        connectionInfo.userStreams.clear();

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
            // Clean up all user streams
            for (const [userId, streamInfo] of connectionInfo.userStreams) {
                try {
                    streamInfo.audioStream.destroy();
                    sttClient.closeConnection(streamInfo.sttConnectionId);
                } catch (e) { }
            }
        }

        this.activeConnections.delete(guildId);
        this.userTranscriptBuffers.delete(guildId);
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
     * Get count of users currently being transcribed
     * @param {string} guildId - Guild ID
     * @returns {number}
     */
    getActiveUserCount(guildId) {
        const connectionInfo = this.activeConnections.get(guildId);
        return connectionInfo?.userStreams?.size || 0;
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
