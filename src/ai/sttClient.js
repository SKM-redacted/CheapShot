//renamed the file name
import { LiveTranscriptionEvents } from '@deepgram/sdk';
import { config } from './config.js';
import { logger } from './logger.js';
import { deepgramKeyPool } from './deepgramKeyPool.js';

/**
 * Speech-to-Text Client using Deepgram with Multi-Key Pool Support
 * Handles real-time audio transcription from Discord voice channels
 * Automatically load balances across multiple API keys
 */
export class STTClient {
    constructor() {
        this.connections = new Map(); // guildId -> { connection, keyIndex, connectionId }
        this.transcriptCallbacks = new Map(); // guildId -> callback function
        this.initialized = false;
    }

    /**
     * Initialize the Deepgram key pool
     * @returns {boolean} Whether initialization was successful
     */
    initialize() {
        if (config.deepgramApiKeys.length === 0) {
            logger.warn('STT', 'No Deepgram API keys configured - voice transcription disabled');
            return false;
        }

        try {
            // Initialize the key pool with all available keys
            if (!deepgramKeyPool.isReady()) {
                deepgramKeyPool.initialize(config.deepgramApiKeys);
            }

            this.initialized = true;
            logger.info('STT', `Deepgram STT initialized with ${config.deepgramApiKeys.length} API key(s)`);
            logger.info('STT', `Total STT WSS capacity: ${deepgramKeyPool.getTotalCapacity('sttWss')} concurrent connections`);
            return true;
        } catch (error) {
            logger.error('STT', 'Failed to initialize Deepgram key pool', error);
            return false;
        }
    }

    /**
     * Check if the client is ready (for compatibility with existing code)
     * @returns {Object|null} Returns the pool if ready, null otherwise
     */
    get deepgram() {
        if (!this.initialized && config.deepgramApiKeys.length > 0) {
            this.initialize();
        }
        return this.initialized ? deepgramKeyPool : null;
    }

    /**
     * Create a new live transcription connection for a guild
     * @param {string} guildId - The guild ID
     * @param {Function} onTranscript - Callback when transcript is received (userId, transcript, isFinal)
     * @returns {Object|null} The transcription connection or null if failed
     */
    async createConnection(guildId, onTranscript) {
        if (!this.initialized && !this.initialize()) {
            logger.error('STT', 'Deepgram key pool not initialized');
            return null;
        }

        // Close existing connection if any
        if (this.connections.has(guildId)) {
            await this.closeConnection(guildId);
        }

        // Acquire a key from the pool
        const acquired = deepgramKeyPool.acquire('sttWss');
        if (!acquired) {
            logger.error('STT', `No Deepgram capacity available for STT WSS (guild: ${guildId})`);
            return null;
        }

        const { client, connectionId, keyIndex } = acquired;

        try {
            const connection = client.listen.live({
                model: 'nova-3',           // Deepgram's latest & most accurate model
                // language removed - Nova 3 will auto-detect language (multilingual mode)
                smart_format: false,        // OFF - gives verbatim transcription, no AI rephrasing
                interim_results: true,      // Get partial results for real-time feel
                utterance_end_ms: 1000,     // Detect end of utterance
                vad_events: true,           // Voice Activity Detection
                punctuate: true,            // Add punctuation
                encoding: 'opus',           // Discord uses Opus
                sample_rate: 48000,         // Discord's sample rate
                channels: 2,                // Stereo - Discord audio format
                // Audio Intelligence features for emotional context
                sentiment: true,            // Analyze emotional tone (-1 to +1 score)
                // Privacy - opt out of model improvement program
                mip_opt_out: true,
            });

            // Store callback
            this.transcriptCallbacks.set(guildId, onTranscript);

            // Setup event handlers
            connection.on(LiveTranscriptionEvents.Open, () => {
                logger.debug('STT', `Connection opened for guild ${guildId} (key: ${keyIndex})`);
            });

            connection.on(LiveTranscriptionEvents.Transcript, (data) => {
                const callback = this.transcriptCallbacks.get(guildId);
                if (callback && data.channel?.alternatives?.[0]) {
                    const transcript = data.channel.alternatives[0].transcript;
                    const isFinal = data.is_final || false;
                    const confidence = data.channel.alternatives[0].confidence || 0;

                    // Extract sentiment analysis data if available
                    // sentiment_info contains: { sentiment, sentiment_score }
                    // sentiment: 'positive', 'negative', or 'neutral'
                    // sentiment_score: -1.0 (most negative) to +1.0 (most positive)
                    let sentimentData = null;
                    const sentimentInfo = data.channel?.alternatives?.[0]?.sentiment_info;
                    if (sentimentInfo) {
                        sentimentData = {
                            sentiment: sentimentInfo.sentiment || 'neutral',
                            score: sentimentInfo.sentiment_score || 0,
                            // Calculate intensity (how strong the emotion is)
                            intensity: Math.abs(sentimentInfo.sentiment_score || 0)
                        };
                    }

                    if (transcript && transcript.trim()) {
                        callback(null, transcript.trim(), isFinal, confidence, false, sentimentData);
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

                // Record error for the key
                deepgramKeyPool.recordError(keyIndex, error);

                const callback = this.transcriptCallbacks.get(guildId);
                if (callback) {
                    callback(error, null, false, 0);
                }
            });

            connection.on(LiveTranscriptionEvents.Close, () => {
                // Release the key back to the pool
                const connInfo = this.connections.get(guildId);
                if (connInfo) {
                    deepgramKeyPool.release(connInfo.keyIndex, connInfo.connectionId);
                    logger.debug('STT', `Connection closed for guild ${guildId}, released key ${connInfo.keyIndex}`);
                }
                this.connections.delete(guildId);
                this.transcriptCallbacks.delete(guildId);
            });

            // Store connection with pool info
            this.connections.set(guildId, {
                connection,
                keyIndex,
                connectionId
            });

            logger.info('STT', `Created transcription connection for guild ${guildId} using key ${keyIndex}`);
            return connection;
        } catch (error) {
            // Release the key on failure
            deepgramKeyPool.release(keyIndex, connectionId);
            deepgramKeyPool.recordError(keyIndex, error);
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
        const connInfo = this.connections.get(guildId);
        if (connInfo?.connection && audioData) {
            try {
                connInfo.connection.send(audioData);
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
        const connInfo = this.connections.get(guildId);
        if (connInfo) {
            try {
                connInfo.connection.finish();
            } catch (error) {
                logger.debug('STT', `Error closing connection for guild ${guildId}: ${error.message}`);
            }

            // Release the key back to the pool
            deepgramKeyPool.release(connInfo.keyIndex, connInfo.connectionId);
            logger.debug('STT', `Released STT key ${connInfo.keyIndex} for guild ${guildId}`);

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
     * Get pool statistics
     * @returns {Object}
     */
    getPoolStats() {
        return deepgramKeyPool.getStats();
    }

    /**
     * Get a simple status summary
     * @returns {string}
     */
    getStatusSummary() {
        return `Active: ${this.connections.size} | ${deepgramKeyPool.getStatusSummary()}`;
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
