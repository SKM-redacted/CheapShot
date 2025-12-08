import { createClient, LiveTTSEvents } from '@deepgram/sdk';
import { createAudioResource, StreamType, AudioPlayerStatus, createAudioPlayer } from '@discordjs/voice';
import { Readable } from 'stream';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Text-to-Speech Client using Deepgram Aura
 * Handles real-time text to speech conversion for Discord voice channels
 * Optimized for low-latency streaming playback with PARALLEL PRE-GENERATION
 */
export class TTSClient {
    constructor() {
        this.deepgram = null;
        this.activeSpeakers = new Map(); // guildId -> { connection, player, audioQueue, isPlaying, pendingGenerations }
        this.speedFactor = 0.28; // 0.7 = 70% speed (30% slower), 1.0 = normal speed
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
     * Speak text in a voice channel using streaming TTS with PARALLEL PRE-GENERATION
     * Audio is generated immediately in parallel - doesn't wait for previous sentence to finish!
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
                audioQueue: [],        // Queue of ready-to-play audio buffers
                isPlaying: false,      // Is the player currently playing audio?
                pendingOrder: [],      // Array of generation IDs in order
                pendingAudio: new Map(), // generationId -> audioBuffer (completed generations waiting for ordering)
                nextGenerationId: 0
            };

            // Subscribe the player to the voice connection
            voiceConnection.subscribe(speaker.player);

            // Handle player state changes - when audio finishes, play next
            speaker.player.on(AudioPlayerStatus.Idle, () => {
                speaker.isPlaying = false;
                this.playNextAudio(guildId);
            });

            speaker.player.on('error', (error) => {
                logger.error('TTS', `Audio player error: ${error.message}`);
                speaker.isPlaying = false;
                this.playNextAudio(guildId);
            });

            this.activeSpeakers.set(guildId, speaker);
        }

        // Assign a generation ID to maintain order
        const generationId = speaker.nextGenerationId++;
        speaker.pendingOrder.push(generationId);

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
            logger.debug('TTS', `Starting parallel generation #${generationId}: "${text.substring(0, 30)}..."`);

            const audioBuffer = await this.generateTTSBuffer(text, options);

            if (audioBuffer && speaker) {
                // Store the completed audio
                speaker.pendingAudio.set(generationId, audioBuffer);
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
                const audioBuffer = speaker.pendingAudio.get(nextId);
                speaker.pendingAudio.delete(nextId);
                speaker.pendingOrder.shift();
                speaker.audioQueue.push(audioBuffer);
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

        const audioBuffer = speaker.audioQueue.shift();
        speaker.isPlaying = true;

        this.playAudio(speaker.player, audioBuffer);
    }

    /**
     * Generate TTS audio buffer (doesn't play - just generates)
     * @param {string} text - Text to speak
     * @param {Object} options - TTS options
     * @returns {Promise<Buffer>} Audio buffer
     */
    async generateTTSBuffer(text, options = {}) {
        return new Promise((resolve, reject) => {
            const model = options.voice || 'aura-2-helena-en';
            const audioChunks = [];

            try {
                const dgConnection = this.deepgram.speak.live({
                    model: model,
                    encoding: 'linear16',
                    sample_rate: 24000,
                });

                dgConnection.on(LiveTTSEvents.Open, () => {
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
                        resolve(adjustedAudio);
                    } else {
                        dgConnection.requestClose();
                        resolve(null);
                    }
                });

                dgConnection.on(LiveTTSEvents.Close, () => {
                    // Connection closed - if we haven't resolved yet, resolve with what we have
                    if (audioChunks.length > 0) {
                        const fullAudio = Buffer.concat(audioChunks);
                        const adjustedAudio = this.stretchAudio(fullAudio, this.speedFactor);
                        resolve(adjustedAudio);
                    }
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
            speaker.audioQueue = [];
            speaker.pendingOrder = [];
            speaker.pendingAudio.clear();
            speaker.player.stop();
            speaker.isPlaying = false;
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
