import { LiveTTSEvents } from '@deepgram/sdk';
import { createAudioResource, StreamType, AudioPlayerStatus, createAudioPlayer } from '@discordjs/voice';
import { Readable } from 'stream';
import { config } from './config.js';
import { logger } from './logger.js';
import { deepgramKeyPool } from './deepgramKeyPool.js';

/**
 * Text-to-Speech Client using Deepgram Aura with Multi-Key Pool Support
 * Handles real-time text to speech conversion for Discord voice channels
 * Optimized for low-latency streaming playback with PARALLEL PRE-GENERATION
 * Automatically load balances across multiple API keys
 */
export class TTSClient {
    constructor() {
        this.activeSpeakers = new Map(); // guildId -> { connection, player, audioQueue, isPlaying, pendingGenerations }
        this.speedFactor = 0.28; // 0.28 = slower for clarity, 1.0 = normal speed
        this.initialized = false;

        // Multilingual voice mapping (Deepgram Aura-2 voices)
        // https://developers.deepgram.com/docs/tts-models
        this.voiceMap = {
            'en': 'aura-2-thalia-en',      // English (default)
            'en-US': 'aura-2-thalia-en',
            'en-GB': 'aura-2-thalia-en',
            'es': 'aura-2-lucia-es',       // Spanish
            'es-ES': 'aura-2-lucia-es',
            'es-MX': 'aura-2-lucia-es',
            'fr': 'aura-2-marie-fr',       // French
            'fr-FR': 'aura-2-marie-fr',
            'de': 'aura-2-helena-de',      // German
            'de-DE': 'aura-2-helena-de',
            'it': 'aura-2-giulia-it',      // Italian
            'it-IT': 'aura-2-giulia-it',
            'pt': 'aura-2-lucia-es',       // Portuguese (fallback to Spanish)
            'pt-BR': 'aura-2-lucia-es',
            'nl': 'aura-2-thalia-en',      // Dutch (fallback to English)
            'ja': 'aura-2-thalia-en',      // Japanese (fallback to English for now)
        };
        this.defaultVoice = 'aura-2-thalia-en';
    }

    /**
     * Initialize the Deepgram key pool for TTS
     * @returns {boolean} Whether initialization was successful
     */
    initialize() {
        if (config.deepgramApiKeys.length === 0) {
            logger.warn('TTS', 'No Deepgram API keys configured - TTS disabled');
            return false;
        }

        try {
            // Initialize the key pool with all available keys (if not already done by STT)
            if (!deepgramKeyPool.isReady()) {
                deepgramKeyPool.initialize(config.deepgramApiKeys);
            }

            this.initialized = true;
            logger.info('TTS', `Deepgram TTS initialized with ${config.deepgramApiKeys.length} API key(s)`);
            logger.info('TTS', `Total TTS capacity: ${deepgramKeyPool.getTotalCapacity('tts')} concurrent connections`);
            return true;
        } catch (error) {
            logger.error('TTS', 'Failed to initialize Deepgram TTS key pool', error);
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
     * Get the appropriate voice for a language
     * @param {string} language - Language code (e.g., 'en', 'es', 'fr')
     * @returns {string} Voice model name
     */
    getVoiceForLanguage(language) {
        if (!language) return this.defaultVoice;

        // Try exact match first
        if (this.voiceMap[language]) {
            return this.voiceMap[language];
        }

        // Try base language (e.g., 'en' from 'en-US')
        const baseLanguage = language.split('-')[0];
        if (this.voiceMap[baseLanguage]) {
            return this.voiceMap[baseLanguage];
        }

        return this.defaultVoice;
    }

    /**
     * Slow down audio by stretching samples (linear interpolation)
     * @param {Buffer} audioBuffer - PCM audio buffer (16-bit signed, little-endian)
     * @param {number} speedFactor - Speed factor (< 1.0 = slower, > 1.0 = faster)
     * @returns {Buffer} - Stretched audio buffer
     */
    stretchAudio(audioBuffer, speedFactor) {
        if (speedFactor === 1.0) return audioBuffer;

        // 16-bit samples = 2 bytes per sample
        const bytesPerSample = 2;
        const inputSamples = audioBuffer.length / bytesPerSample;
        const outputSamples = Math.floor(inputSamples / speedFactor);
        const outputBuffer = Buffer.alloc(outputSamples * bytesPerSample);

        for (let i = 0; i < outputSamples; i++) {
            // Calculate the position in the input buffer
            const inputPos = i * speedFactor;
            const inputIndex = Math.floor(inputPos);
            const fraction = inputPos - inputIndex;

            // Get surrounding samples for interpolation
            const sample1 = audioBuffer.readInt16LE(
                Math.min(inputIndex, inputSamples - 1) * bytesPerSample
            );
            const sample2 = audioBuffer.readInt16LE(
                Math.min(inputIndex + 1, inputSamples - 1) * bytesPerSample
            );

            // Linear interpolation between samples
            const interpolatedSample = Math.round(sample1 + fraction * (sample2 - sample1));

            // Clamp to valid 16-bit range
            const clampedSample = Math.max(-32768, Math.min(32767, interpolatedSample));
            outputBuffer.writeInt16LE(clampedSample, i * bytesPerSample);
        }

        return outputBuffer;
    }

    /**
     * Speak text in a voice channel using streaming TTS with PARALLEL PRE-GENERATION
     * Audio is generated immediately in parallel - doesn't wait for previous sentence to finish!
     * @param {string} guildId - Guild ID
     * @param {Object} voiceConnection - Discord voice connection
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options (can include messageId for cancellation tracking)
     * @returns {Promise<boolean>} Success
     */
    async speak(guildId, voiceConnection, text, options = {}) {
        if (!this.initialized && !this.initialize()) {
            return false;
        }

        if (!text || !text.trim()) {
            return false;
        }

        // Get or create speaker for this guild
        let speaker = this.activeSpeakers.get(guildId);
        if (!speaker) {
            speaker = {
                player: createAudioPlayer(),
                audioQueue: [],        // Queue of { audioBuffer, messageId } objects
                isPlaying: false,      // Is the player currently playing audio?
                currentMessageId: null, // messageId of currently playing audio
                pendingOrder: [],      // Array of generation IDs in order
                pendingAudio: new Map(), // generationId -> { audioBuffer, messageId }
                pendingMessageIds: new Map(), // generationId -> messageId
                nextGenerationId: 0
            };

            // Subscribe the player to the voice connection
            voiceConnection.subscribe(speaker.player);

            // Handle player state changes - when audio finishes, play next
            speaker.player.on(AudioPlayerStatus.Idle, () => {
                speaker.isPlaying = false;
                speaker.currentMessageId = null;
                this.playNextAudio(guildId);
            });

            speaker.player.on('error', (error) => {
                logger.error('TTS', `Audio player error: ${error.message}`);
                speaker.isPlaying = false;
                speaker.currentMessageId = null;
                this.playNextAudio(guildId);
            });

            this.activeSpeakers.set(guildId, speaker);
        }

        // Assign a generation ID to maintain order
        const generationId = speaker.nextGenerationId++;
        speaker.pendingOrder.push(generationId);

        // Track messageId for this generation (for cancellation)
        const messageId = options.messageId || null;
        speaker.pendingMessageIds.set(generationId, messageId);

        // Start generating audio IMMEDIATELY in parallel - don't wait!
        this.generateAudio(guildId, generationId, text, options);

        return true;
    }

    /**
     * Generate audio for text and add to queue when ready
     * This runs in parallel - multiple sentences can be generating at once!
     * @param {string} guildId - Guild ID
     * @param {number} generationId - Order ID for this generation
     * @param {string} text - Text to convert to audio
     * @param {Object} options - TTS options
     */
    async generateAudio(guildId, generationId, text, options = {}) {
        const speaker = this.activeSpeakers.get(guildId);
        if (!speaker) return;

        try {
            const ttsStartTime = Date.now();
            logger.debug('TTS', `Starting parallel generation #${generationId}: "${text.substring(0, 30)}..."`);

            const audioBuffer = await this.generateTTSBuffer(text, options);
            console.log(`[TIMING] TTS generation #${generationId}: ${Date.now() - ttsStartTime}ms`);

            if (audioBuffer && speaker) {
                // Store the completed audio with its messageId
                const messageId = speaker.pendingMessageIds.get(generationId) || null;
                speaker.pendingAudio.set(generationId, { audioBuffer, messageId });
                logger.debug('TTS', `Generation #${generationId} complete (${audioBuffer.length} bytes)`);

                // Check if we can move any audio to the playback queue
                this.flushPendingToQueue(guildId);
            }
        } catch (error) {
            logger.error('TTS', `Generation #${generationId} failed: ${error.message}`);
            // Remove from pending order on failure
            const speaker = this.activeSpeakers.get(guildId);
            if (speaker) {
                const idx = speaker.pendingOrder.indexOf(generationId);
                if (idx !== -1) speaker.pendingOrder.splice(idx, 1);
                speaker.pendingMessageIds.delete(generationId);
                this.flushPendingToQueue(guildId);
            }
        }
    }

    /**
     * Move completed audio to the playback queue in the correct order
     * @param {string} guildId - Guild ID
     */
    flushPendingToQueue(guildId) {
        const speaker = this.activeSpeakers.get(guildId);
        if (!speaker) return;

        // Move audio to queue in order
        while (speaker.pendingOrder.length > 0) {
            const nextId = speaker.pendingOrder[0];
            if (speaker.pendingAudio.has(nextId)) {
                // This one is ready - move to playback queue
                const { audioBuffer, messageId } = speaker.pendingAudio.get(nextId);
                speaker.pendingAudio.delete(nextId);
                speaker.pendingMessageIds.delete(nextId);
                speaker.pendingOrder.shift();
                speaker.audioQueue.push({ audioBuffer, messageId });
                logger.debug('TTS', `Queued audio #${nextId} for playback`);
            } else {
                // Not ready yet - stop here to maintain order
                break;
            }
        }

        // Start playback if not already playing
        if (!speaker.isPlaying) {
            this.playNextAudio(guildId);
        }
    }

    /**
     * Play the next audio buffer in the queue
     * @param {string} guildId - Guild ID
     */
    playNextAudio(guildId) {
        const speaker = this.activeSpeakers.get(guildId);
        if (!speaker || speaker.audioQueue.length === 0) {
            return;
        }

        if (speaker.isPlaying) {
            return; // Already playing
        }

        const { audioBuffer, messageId } = speaker.audioQueue.shift();
        speaker.isPlaying = true;
        speaker.currentMessageId = messageId;

        this.playAudio(speaker.player, audioBuffer);
    }

    /**
     * Generate TTS audio buffer (doesn't play - just generates)
     * Uses the key pool for load balancing
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options (voice, language)
     * @returns {Promise<Buffer>} Audio buffer
     */
    async generateTTSBuffer(text, options = {}) {
        return new Promise((resolve, reject) => {
            // Acquire a key from the pool
            const acquired = deepgramKeyPool.acquire('tts');
            if (!acquired) {
                reject(new Error('No Deepgram TTS capacity available'));
                return;
            }

            const { client, connectionId, keyIndex } = acquired;

            // Use explicit voice, or get voice for language, or default
            const model = options.voice || this.getVoiceForLanguage(options.language);
            const audioChunks = [];

            try {
                const dgConnection = client.speak.live({
                    model: model,
                    encoding: 'linear16',
                    sample_rate: 24000,
                    // Privacy - opt out of model improvement program
                    mip_opt_out: true,
                });

                // Track if we've resolved/rejected to avoid double calls
                let completed = false;
                const complete = (result, error = null) => {
                    if (completed) return;
                    completed = true;

                    // Release the key back to the pool
                    deepgramKeyPool.release(keyIndex, connectionId);

                    if (error) {
                        deepgramKeyPool.recordError(keyIndex, error);
                        reject(error);
                    } else {
                        resolve(result);
                    }
                };

                dgConnection.on(LiveTTSEvents.Open, () => {
                    logger.debug('TTS', `TTS connection opened (key: ${keyIndex})`);
                    dgConnection.sendText(text);
                    dgConnection.flush();
                });

                dgConnection.on(LiveTTSEvents.Audio, (data) => {
                    audioChunks.push(Buffer.from(data));
                });

                dgConnection.on(LiveTTSEvents.Flushed, () => {
                    if (audioChunks.length > 0) {
                        const fullAudio = Buffer.concat(audioChunks);
                        const adjustedAudio = this.stretchAudio(fullAudio, this.speedFactor);
                        dgConnection.requestClose();
                        complete(adjustedAudio);
                    } else {
                        dgConnection.requestClose();
                        complete(null);
                    }
                });

                dgConnection.on(LiveTTSEvents.Close, () => {
                    // Connection closed - if we haven't resolved yet, resolve with what we have
                    if (audioChunks.length > 0) {
                        const fullAudio = Buffer.concat(audioChunks);
                        const adjustedAudio = this.stretchAudio(fullAudio, this.speedFactor);
                        complete(adjustedAudio);
                    } else {
                        complete(null);
                    }
                });

                dgConnection.on(LiveTTSEvents.Error, (error) => {
                    logger.error('TTS', `Deepgram TTS error (key: ${keyIndex}): ${error.message}`);
                    complete(null, error);
                });

            } catch (error) {
                // Release the key on failure
                deepgramKeyPool.release(keyIndex, connectionId);
                deepgramKeyPool.recordError(keyIndex, error);
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
     * Cancel all audio for a specific message ID
     * Removes pending and queued audio, stops playback if it's playing this message
     * @param {string} guildId - Guild ID
     * @param {string} messageId - Message ID to cancel
     */
    cancelMessage(guildId, messageId) {
        const speaker = this.activeSpeakers.get(guildId);
        if (!speaker || !messageId) return;

        let cancelled = false;

        // Remove from pending generations
        for (const [genId, msgId] of speaker.pendingMessageIds.entries()) {
            if (msgId === messageId) {
                speaker.pendingMessageIds.delete(genId);
                speaker.pendingAudio.delete(genId);
                const idx = speaker.pendingOrder.indexOf(genId);
                if (idx !== -1) speaker.pendingOrder.splice(idx, 1);
                cancelled = true;
            }
        }

        // Remove from audio queue
        const originalLength = speaker.audioQueue.length;
        speaker.audioQueue = speaker.audioQueue.filter(item => item.messageId !== messageId);
        if (speaker.audioQueue.length < originalLength) {
            cancelled = true;
        }

        // Stop current playback if it's for this message
        if (speaker.currentMessageId === messageId) {
            speaker.player.stop();
            speaker.isPlaying = false;
            speaker.currentMessageId = null;
            cancelled = true;
        }

        if (cancelled) {
            logger.debug('TTS', `Cancelled audio for message ${messageId.slice(-12)}`);
        }
    }

    /**
     * Stop speaking in a guild (clears ALL audio)
     * @param {string} guildId - Guild ID
     */
    stop(guildId) {
        const speaker = this.activeSpeakers.get(guildId);
        if (speaker) {
            speaker.audioQueue = [];
            speaker.pendingOrder = [];
            speaker.pendingAudio.clear();
            speaker.pendingMessageIds.clear();
            speaker.player.stop();
            speaker.isPlaying = false;
            speaker.currentMessageId = null;
        }
    }

    /**
     * Check if currently speaking in a guild
     * @param {string} guildId - Guild ID
     * @returns {boolean}
     */
    isSpeaking(guildId) {
        const speaker = this.activeSpeakers.get(guildId);
        return speaker?.isPlaying || false;
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
        return `Active speakers: ${this.activeSpeakers.size} | ${deepgramKeyPool.getStatusSummary()}`;
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
