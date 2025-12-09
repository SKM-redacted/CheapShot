//renamed the file name
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Speech-to-Text Client using Deepgram
 * Handles real-time audio transcription from Discord voice channels
 */
export class STTClient {
    constructor() {
        this.deepgram = null;
        this.connections = new Map(); // guildId -> connection
        this.transcriptCallbacks = new Map(); // guildId -> callback function
    }

    /**
     * Initialize the Deepgram client
     */
    initialize() {
        if (!config.deepgramApiKey) {
            logger.warn('STT', 'No Deepgram API key configured - voice transcription disabled');
            return false;
        }

        try {
            this.deepgram = createClient(config.deepgramApiKey);
            logger.info('STT', 'Deepgram client initialized');
            return true;
        } catch (error) {
            logger.error('STT', 'Failed to initialize Deepgram client', error);
            return false;
        }
    }

    /**
     * Create a new live transcription connection for a guild
     * @param {string} guildId - The guild ID
     * @param {Function} onTranscript - Callback when transcript is received (userId, transcript, isFinal)
     * @returns {Object|null} The transcription connection or null if failed
     */
    async createConnection(guildId, onTranscript) {
        if (!this.deepgram) {
            logger.error('STT', 'Deepgram client not initialized');
            return null;
        }

        // Close existing connection if any
        if (this.connections.has(guildId)) {
            await this.closeConnection(guildId);
        }

        try {
            const connection = this.deepgram.listen.live({
                model: 'nova-3',           // Deepgram's latest & most accurate model
                language: 'en-US',
                smart_format: false,        // OFF - gives verbatim transcription, no AI rephrasing
                interim_results: true,      // Get partial results for real-time feel
                utterance_end_ms: 1000,     // Detect end of utterance (faster response)
                vad_events: true,           // Voice Activity Detection
                punctuate: true,            // Add punctuation
                encoding: 'opus',           // Discord uses Opus
                sample_rate: 48000,         // Discord's sample rate
                channels: 2,                // Stereo - Discord audio format
            });

            // Store callback
            this.transcriptCallbacks.set(guildId, onTranscript);

            // Setup event handlers
            connection.on(LiveTranscriptionEvents.Open, () => {
                // Connection opened - no logging needed
            });

            connection.on(LiveTranscriptionEvents.Transcript, (data) => {
                const callback = this.transcriptCallbacks.get(guildId);
                if (callback && data.channel?.alternatives?.[0]) {
                    const transcript = data.channel.alternatives[0].transcript;
                    const isFinal = data.is_final || false;
                    const confidence = data.channel.alternatives[0].confidence || 0;

                    if (transcript && transcript.trim()) {
                        callback(null, transcript.trim(), isFinal, confidence);
                    }
                }
            });

            connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
                const callback = this.transcriptCallbacks.get(guildId);
                if (callback) {
                    callback(null, null, true, 0, true); // Signal utterance end
                }
            });

            connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
                logger.debug('STT', `Speech started in guild ${guildId}`);
            });

            connection.on(LiveTranscriptionEvents.Error, (error) => {
                logger.error('STT', `Transcription error in guild ${guildId}`, error);
                const callback = this.transcriptCallbacks.get(guildId);
                if (callback) {
                    callback(error, null, false, 0);
                }
            });

            connection.on(LiveTranscriptionEvents.Close, () => {
                this.connections.delete(guildId);
                this.transcriptCallbacks.delete(guildId);
            });

            this.connections.set(guildId, connection);
            return connection;
        } catch (error) {
            logger.error('STT', `Failed to create transcription connection for guild ${guildId}`, error);
            return null;
        }
    }

    /**
     * Send audio data to be transcribed
     * @param {string} guildId - The guild ID
     * @param {Buffer} audioData - Raw audio data (Opus packets)
     */
    sendAudio(guildId, audioData) {
        const connection = this.connections.get(guildId);
        if (connection && audioData) {
            try {
                connection.send(audioData);
            } catch (error) {
                // Connection might be closed
                logger.debug('STT', `Failed to send audio for guild ${guildId}: ${error.message}`);
            }
        }
    }

    /**
     * Close transcription connection for a guild
     * @param {string} guildId - The guild ID
     */
    async closeConnection(guildId) {
        const connection = this.connections.get(guildId);
        if (connection) {
            try {
                connection.finish();
            } catch (error) {
                logger.debug('STT', `Error closing connection for guild ${guildId}: ${error.message}`);
            }
            this.connections.delete(guildId);
            this.transcriptCallbacks.delete(guildId);
        }
    }

    /**
     * Check if a guild has an active transcription connection
     * @param {string} guildId - The guild ID
     * @returns {boolean}
     */
    hasConnection(guildId) {
        return this.connections.has(guildId);
    }

    /**
     * Get connection count
     * @returns {number}
     */
    getConnectionCount() {
        return this.connections.size;
    }

    /**
     * Close all connections
     */
    async closeAll() {
        for (const guildId of this.connections.keys()) {
            await this.closeConnection(guildId);
        }
        logger.info('STT', 'All transcription connections closed');
    }
}

// Export singleton
export const sttClient = new STTClient();
