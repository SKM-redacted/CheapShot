import { createClient, LiveTTSEvents } from '@deepgram/sdk';
import { createAudioResource, StreamType, AudioPlayerStatus, createAudioPlayer } from '@discordjs/voice';
import { Readable } from 'stream';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Text-to-Speech Client using Deepgram Aura
 * Handles real-time text to speech conversion for Discord voice channels
 * Optimized for low-latency streaming playback
 */
export class TTSClient {
    constructor() {
        this.deepgram = null;
        this.activeSpeakers = new Map(); // guildId -> { connection, player, queue }
    }

    /**
     * Initialize the Deepgram client
     */
    initialize() {
        if (!config.deepgramApiKey) {
            logger.warn('TTS', 'No Deepgram API key configured - TTS disabled');
            return false;
        }

        try {
            this.deepgram = createClient(config.deepgramApiKey);
            logger.info('TTS', 'Deepgram TTS client initialized');
            return true;
        } catch (error) {
            logger.error('TTS', 'Failed to initialize Deepgram TTS client', error);
            return false;
        }
    }

    /**
     * Speak text in a voice channel using streaming TTS
     * @param {string} guildId - Guild ID
     * @param {Object} voiceConnection - Discord voice connection
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options
     * @returns {Promise<boolean>} Success
     */
    async speak(guildId, voiceConnection, text, options = {}) {
        if (!this.deepgram) {
            if (!this.initialize()) {
                return false;
            }
        }

        if (!text || !text.trim()) {
            return false;
        }

        // Get or create speaker for this guild
        let speaker = this.activeSpeakers.get(guildId);
        if (!speaker) {
            speaker = {
                player: createAudioPlayer(),
                queue: [],
                isSpeaking: false
            };

            // Subscribe the player to the voice connection
            voiceConnection.subscribe(speaker.player);

            // Handle player state changes
            speaker.player.on(AudioPlayerStatus.Idle, () => {
                speaker.isSpeaking = false;
                this.processQueue(guildId);
            });

            speaker.player.on('error', (error) => {
                logger.error('TTS', `Audio player error: ${error.message}`);
                speaker.isSpeaking = false;
                this.processQueue(guildId);
            });

            this.activeSpeakers.set(guildId, speaker);
        }

        // Add to queue
        speaker.queue.push({ text, options });

        // Process if not currently speaking
        if (!speaker.isSpeaking) {
            await this.processQueue(guildId);
        }

        return true;
    }

    /**
     * Process the speech queue for a guild
     * @param {string} guildId - Guild ID
     */
    async processQueue(guildId) {
        const speaker = this.activeSpeakers.get(guildId);
        if (!speaker || speaker.queue.length === 0) {
            return;
        }

        if (speaker.isSpeaking) {
            return; // Already speaking
        }

        const { text, options } = speaker.queue.shift();
        speaker.isSpeaking = true;

        try {
            await this.streamTTS(speaker, text, options);
        } catch (error) {
            logger.error('TTS', `Failed to speak: ${error.message}`);
            speaker.isSpeaking = false;
            this.processQueue(guildId);
        }
    }

    /**
     * Stream TTS audio to the player with real-time chunked playback
     * @param {Object} speaker - Speaker object with player
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options
     */
    async streamTTS(speaker, text, options = {}) {
        return new Promise((resolve, reject) => {
            // Use a slower, clearer voice - Helena is known for being clear and measured
            const model = options.voice || 'aura-2-helena-en';
            const audioChunks = [];
            let isFirstChunk = true;

            try {
                const dgConnection = this.deepgram.speak.live({
                    model: model,
                    encoding: 'linear16',
                    sample_rate: 24000, // Lower sample rate for Discord compatibility
                });

                dgConnection.on(LiveTTSEvents.Open, () => {
                    logger.debug('TTS', `Streaming TTS: "${text.substring(0, 50)}..."`);

                    // Send the text
                    dgConnection.sendText(text);

                    // Flush to get the audio
                    dgConnection.flush();
                });

                dgConnection.on(LiveTTSEvents.Audio, (data) => {
                    const chunk = Buffer.from(data);
                    audioChunks.push(chunk);

                    // Start playing after first chunk for lower latency
                    if (isFirstChunk && audioChunks.length >= 1) {
                        isFirstChunk = false;
                        // We'll wait for flush to play for consistency
                    }
                });

                dgConnection.on(LiveTTSEvents.Flushed, () => {
                    // Combine all chunks and play
                    if (audioChunks.length > 0) {
                        const fullAudio = Buffer.concat(audioChunks);
                        this.playAudio(speaker.player, fullAudio);
                        logger.debug('TTS', `Playing ${fullAudio.length} bytes of audio`);
                    }

                    // Close the connection
                    dgConnection.requestClose();
                });

                dgConnection.on(LiveTTSEvents.Close, () => {
                    resolve();
                });

                dgConnection.on(LiveTTSEvents.Error, (error) => {
                    logger.error('TTS', `Deepgram TTS error: ${error.message}`);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Play audio buffer through the player
     * Uses lower sample rate for clearer playback
     * @param {Object} player - Audio player
     * @param {Buffer} audioBuffer - PCM audio buffer (24kHz, 16-bit, mono)
     */
    playAudio(player, audioBuffer) {
        try {
            // Create a readable stream from the buffer
            const stream = Readable.from(audioBuffer);

            // Create an audio resource - specify raw input for PCM
            const resource = createAudioResource(stream, {
                inputType: StreamType.Raw,
                inlineVolume: true
            });

            // Set volume slightly higher for clarity
            if (resource.volume) {
                resource.volume.setVolume(1.2);
            }

            // Play the audio
            player.play(resource);

            logger.debug('TTS', 'Audio playback started');
        } catch (error) {
            logger.error('TTS', `Failed to play audio: ${error.message}`);
        }
    }

    /**
     * Stop speaking in a guild
     * @param {string} guildId - Guild ID
     */
    stop(guildId) {
        const speaker = this.activeSpeakers.get(guildId);
        if (speaker) {
            speaker.queue = [];
            speaker.player.stop();
            speaker.isSpeaking = false;
        }
    }

    /**
     * Check if currently speaking in a guild
     * @param {string} guildId - Guild ID
     * @returns {boolean}
     */
    isSpeaking(guildId) {
        const speaker = this.activeSpeakers.get(guildId);
        return speaker?.isSpeaking || false;
    }

    /**
     * Cleanup speaker for a guild
     * @param {string} guildId - Guild ID
     */
    cleanup(guildId) {
        const speaker = this.activeSpeakers.get(guildId);
        if (speaker) {
            speaker.player.stop();
            this.activeSpeakers.delete(guildId);
        }
    }

    /**
     * Cleanup all speakers
     */
    cleanupAll() {
        for (const guildId of this.activeSpeakers.keys()) {
            this.cleanup(guildId);
        }
        logger.info('TTS', 'All TTS speakers cleaned up');
    }
}

// Export singleton
export const ttsClient = new TTSClient();
