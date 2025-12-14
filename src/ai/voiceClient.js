import {
    joinVoiceChannel,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    EndBehaviorType
} from '@discordjs/voice';
import { ChannelType } from 'discord.js';
import { sttClient } from './sttClient.js';
import { ttsClient } from './ttsClient.js';
import { perceptionFilter } from './perceptionFilter.js';
import { inputFilter } from './inputFilter.js';
import { responseGatekeeper } from './responseGatekeeper.js';
import { voiceMemory } from './voiceMemory.js';
import { logger } from './logger.js';

/**
 * Voice Client for Discord
 * Handles joining voice channels and receiving audio streams
 * Uses per-user audio streams to accurately identify speakers
 */
class VoiceClient {
    constructor() {
        this.activeConnections = new Map(); // guildId -> { connection, textChannel, userStreams, members }
        this.userTranscriptBuffers = new Map(); // guildId -> Map(userId -> { text, timer, memberInfo })
        this.aiResponseCallback = null; // Callback for generating AI responses
        this.TRANSCRIPT_DEBOUNCE_MS = 800; // Wait 0.8s after last transcript before triggering AI (faster response)

        // Response tracking - uses delay instead of queueing for natural pacing
        this.responseTracking = new Map(); // guildId -> { inProgress: boolean, lastResponseTime: number }
        this.RESPONSE_COOLDOWN_MS = 3000; // If within this time, add a pause before next response
        this.NATURAL_PAUSE_MIN_MS = 500; // Minimum pause between responses (faster)
        this.NATURAL_PAUSE_MAX_MS = 1500; // Maximum pause between responses (faster)
    }

    /**
     * Set the AI response callback
     * @param {Function} callback - async function(guildId, userId, username, transcript) => string
     */
    setAIResponseCallback(callback) {
        this.aiResponseCallback = callback;
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
                selfMute: false, // Bot can speak now!
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
                isListening: false,
                conversationMode: false,     // When true, triggers AI responses
                showTranscripts: false       // When true, sends transcripts to text channel
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

        // Only send message if showTranscripts is enabled
        if (connectionInfo.showTranscripts) {
            await connectionInfo.textChannel.send('🎤 **Now listening!** I\'ll transcribe what people say.');
        }

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
                    duration: 800, // 0.8s of silence - faster response time
                }
            });

            // Create a dedicated STT connection for this user
            const sttConnectionId = `${guildId}-${userId}`;
            const sttConnection = await sttClient.createConnection(
                sttConnectionId,
                async (error, transcript, isFinal, confidence, isUtteranceEnd, sentimentData) => {
                    if (error) {
                        logger.error('VOICE', `STT error for user ${userId}: ${error.message}`);
                        return;
                    }

                    if (transcript && transcript.trim()) {
                        await this.handleUserTranscript(guildId, userId, transcript, isFinal, confidence, memberInfo, sentimentData);
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
     * @param {Object} sentimentData - Sentiment analysis from Deepgram { sentiment, score, intensity }
     */
    async handleUserTranscript(guildId, userId, transcript, isFinal, confidence, memberInfo, sentimentData = null) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo) return;

        // Only process final transcripts
        if (isFinal && transcript.trim()) {
            try {
                // Get or create transcript buffer for this user
                const bufferKey = `${guildId}-${userId}`;
                let buffer = this.userTranscriptBuffers.get(bufferKey);

                if (!buffer) {
                    buffer = { text: '', timer: null, memberInfo, sentimentScores: [], sentimentLabels: [] };
                    this.userTranscriptBuffers.set(bufferKey, buffer);
                }

                // Clear any existing timer
                if (buffer.timer) {
                    clearTimeout(buffer.timer);
                }

                // Append transcript to buffer
                if (buffer.text) {
                    buffer.text += ' ' + transcript.trim();
                } else {
                    buffer.text = transcript.trim();
                }

                // Collect sentiment data for averaging later
                if (sentimentData && sentimentData.score !== undefined) {
                    buffer.sentimentScores.push(sentimentData.score);
                    buffer.sentimentLabels.push(sentimentData.sentiment);
                }


                // Set debounce timer - wait for user to finish speaking
                buffer.timer = setTimeout(async () => {
                    const fullTranscript = buffer.text.trim();
                    const sentimentScores = [...buffer.sentimentScores];
                    const sentimentLabels = [...buffer.sentimentLabels];
                    buffer.text = '';
                    buffer.timer = null;
                    buffer.sentimentScores = [];
                    buffer.sentimentLabels = [];

                    if (!fullTranscript) return;

                    // Calculate aggregated sentiment for the full utterance
                    let aggregatedSentiment = null;
                    if (sentimentScores.length > 0) {
                        const avgScore = sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length;
                        // Determine overall sentiment from average score
                        let overallSentiment = 'neutral';
                        if (avgScore > 0.25) overallSentiment = 'positive';
                        else if (avgScore < -0.25) overallSentiment = 'negative';

                        aggregatedSentiment = {
                            sentiment: overallSentiment,
                            score: Math.round(avgScore * 100) / 100, // Round to 2 decimal places
                            intensity: Math.round(Math.abs(avgScore) * 100) / 100,
                            // Provide human-readable description for AI
                            description: this.getSentimentDescription(avgScore)
                        };

                        logger.debug('VOICE', `[SENTIMENT] ${memberInfo.displayName}: ${aggregatedSentiment.description} (score: ${aggregatedSentiment.score})`);
                    }

                    // Only send to text channel if showTranscripts is enabled
                    if (connectionInfo.showTranscripts) {
                        const output = `🗣️ **${memberInfo.displayName}:** ${fullTranscript}`;
                        await connectionInfo.textChannel.send(output);
                    }

                    // If conversation mode is enabled and we have an AI callback, generate a response
                    // But first, pass through input filter to catch incomplete sentences
                    if (connectionInfo.conversationMode && this.aiResponseCallback) {
                        // Input filter will buffer incomplete transcripts and merge continuations
                        inputFilter.process(guildId, userId, fullTranscript, async (completeTranscript) => {
                            // Generate a unique message ID for this specific transcript
                            // This ensures each message response is independently trackable
                            const messageId = `${guildId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                            // Get recent conversation context so gatekeeper knows if bot just asked a question
                            const recentContext = voiceMemory.getFormattedContext(guildId);

                            // Get VC member info for smarter gatekeeper decisions
                            // Count humans only (exclude bots)
                            const vcMembers = connectionInfo.voiceChannel.members.filter(m => !m.user.bot);
                            const memberCount = vcMembers.size;
                            const memberNames = vcMembers.map(m => m.displayName);
                            const vcInfo = { memberCount, memberNames, sentiment: aggregatedSentiment };

                            // SPECULATIVE EXECUTION: Run gatekeeper and AI response generation in parallel
                            // This eliminates the 3-second gatekeeper delay!
                            const gatekeeperPromise = responseGatekeeper.shouldRespond(
                                completeTranscript,
                                memberInfo.displayName,
                                recentContext,
                                vcInfo
                            );

                            // Start generating response speculatively (pass messageId for cancellation tracking)
                            const responsePromise = this.queueOrRespond(guildId, userId, memberInfo.displayName, completeTranscript, true, messageId, aggregatedSentiment);

                            // Wait for gatekeeper decision
                            const shouldRespond = await gatekeeperPromise;

                            if (!shouldRespond) {
                                logger.info('VOICE', `[GATEKEEPER] Not responding to: "${completeTranscript}"`);
                                // Cancel THIS SPECIFIC message's response
                                this.cancelPendingResponse(guildId, messageId);
                                return;
                            }

                            // Gatekeeper approved - let the response complete
                            logger.info('VOICE', `[GATEKEEPER] Approved: "${completeTranscript}"`);
                            await responsePromise;
                        });
                    }
                }, this.TRANSCRIPT_DEBOUNCE_MS);

            } catch (error) {
                logger.error('VOICE', `Failed to process transcript: ${error.message}`);
            }
        }
    }

    /**
     * Get human-readable sentiment description for AI context
     * @param {number} score - Sentiment score from -1 to 1
     * @returns {string} Human-readable description
     */
    getSentimentDescription(score) {
        if (score >= 0.6) return 'very positive/excited';
        if (score >= 0.3) return 'positive/happy';
        if (score >= 0.1) return 'slightly positive';
        if (score <= -0.6) return 'very negative/upset';
        if (score <= -0.3) return 'negative/frustrated';
        if (score <= -0.1) return 'slightly negative';
        return 'neutral';
    }

    /**
     * Cancel a pending speculative response for a specific message
     * Also clears any TTS audio that was already generated for this message
     * @param {string} guildId - Guild ID
     * @param {string} messageId - Unique message ID to cancel
     */
    cancelPendingResponse(guildId, messageId = null) {
        let tracking = this.responseTracking.get(guildId);
        if (tracking) {
            tracking.cancelled = true;
            tracking.cancelledMessageId = messageId;

            // CRITICAL FIX: Reset inProgress to false so the next message doesn't get stuck waiting
            // The cancelled response's generateAndSpeak will exit early, but we need to unblock immediately
            tracking.inProgress = false;

            logger.debug('VOICE', `[SPECULATIVE] Cancelled response ${messageId ? messageId.slice(-12) : 'all'} for guild ${guildId}`);

            // CRITICAL: Also cancel any TTS audio that was already generated/queued for THIS message
            // This prevents the race condition where audio plays after cancel
            if (messageId) {
                ttsClient.cancelMessage(guildId, messageId);
            } else {
                ttsClient.stop(guildId);
            }
        }
    }

    /**
     * Queue transcript or respond immediately based on cooldown
     * Supports speculative execution - starts generating but waits for approval
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} username - User's display name
     * @param {string} transcript - The transcript to process
     * @param {boolean} speculative - If true, this is speculative and may be cancelled
     * @param {string} messageId - Unique ID for this specific message (for cancellation tracking)
     * @param {Object} sentimentData - Aggregated sentiment data { sentiment, score, intensity, description }
     */
    async queueOrRespond(guildId, userId, username, transcript, speculative = false, messageId = null, sentimentData = null) {
        // Get or create response tracking for this guild
        let tracking = this.responseTracking.get(guildId);
        if (!tracking) {
            tracking = {
                inProgress: false,
                lastResponseTime: 0,
                cancelled: false,
                cancelledMessageId: null  // Track which specific message got cancelled
            };
            this.responseTracking.set(guildId, tracking);
        }

        // Reset cancelled flag for new messages
        // A new message should start fresh, not inherit cancelled state from old messages
        if (messageId && tracking.cancelledMessageId !== messageId) {
            tracking.cancelled = false;
            tracking.cancelledMessageId = null;
        }

        const now = Date.now();
        const timeSinceLastResponse = now - tracking.lastResponseTime;

        // Helper to check if THIS SPECIFIC message was cancelled
        const isCancelledForMe = () => tracking.cancelled && tracking.cancelledMessageId === messageId;

        // If AI is currently responding, wait for it to finish
        if (tracking.inProgress) {
            logger.info('VOICE', `[WAIT] Waiting for current response to finish: "${transcript}"`);
            while (tracking.inProgress && !isCancelledForMe()) {
                await new Promise(r => setTimeout(r, 100));
            }
            if (isCancelledForMe()) {
                logger.debug('VOICE', `[SPECULATIVE] Response cancelled while waiting`);
                return;
            }
        }

        // Check if cancelled before proceeding
        if (isCancelledForMe()) {
            logger.debug('VOICE', `[SPECULATIVE] Response cancelled before processing`);
            return;
        }

        // Only add a pause if bot RECENTLY spoke (back-to-back responses need breathing room)
        // First response after silence = no delay, respond immediately!
        // (timeSinceLastResponse already calculated above)

        if (timeSinceLastResponse < this.RESPONSE_COOLDOWN_MS && tracking.lastResponseTime > 0) {
            const delay = Math.floor(Math.random() * (this.NATURAL_PAUSE_MAX_MS - this.NATURAL_PAUSE_MIN_MS)) + this.NATURAL_PAUSE_MIN_MS;
            logger.info('VOICE', `[PAUSE] Adding ${delay}ms pause (last response was ${timeSinceLastResponse}ms ago)`);
            await new Promise(r => setTimeout(r, delay));

            // Check if cancelled after pause
            if (isCancelledForMe()) {
                logger.debug('VOICE', `[SPECULATIVE] Response cancelled during pause`);
                return;
            }
        }

        // Now respond (pass messageId and sentiment for tracking within generateAndSpeak)
        logger.info('VOICE', `[RESPOND] Processing: "${transcript}"`);
        await this.generateAndSpeak(guildId, userId, username, transcript, messageId, sentimentData);
    }

    /**
     * Generate AI response and speak it
     * Now uses streaming - speaks sentences as they arrive for faster response!
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} username - User's display name
     * @param {string} transcript - User's spoken text
     * @param {string} messageId - Unique message ID for cancellation tracking
     * @param {Object} sentimentData - Aggregated sentiment data { sentiment, score, intensity, description }
     */
    async generateAndSpeak(guildId, userId, username, transcript, messageId = null, sentimentData = null) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo || !this.aiResponseCallback) return;

        // Mark response as in progress
        let tracking = this.responseTracking.get(guildId);
        if (!tracking) {
            tracking = {
                inProgress: false,
                lastResponseTime: 0
            };
            this.responseTracking.set(guildId, tracking);
        }
        tracking.inProgress = true;

        try {
            logger.info('VOICE', `Generating streaming AI response to: "${transcript}"`);

            // Start a new filter session for this response
            perceptionFilter.startSession(guildId);

            let sentenceCount = 0;
            let fullResponse = '';

            // The callback now accepts an onSentence function for streaming
            // Also pass isCancelled callback so AI client can skip saving cancelled responses
            // sentimentData provides emotional context: { sentiment, score, intensity, description }
            const aiResponse = await this.aiResponseCallback(
                guildId,
                userId,
                username,
                transcript,
                // onSentence callback - called for each sentence as it's generated
                async (sentence) => {
                    // Check if THIS SPECIFIC message was cancelled by gatekeeper
                    if (tracking.cancelled && tracking.cancelledMessageId === messageId) {
                        logger.debug('VOICE', `[SPECULATIVE] Skipping sentence - response cancelled`);
                        return;
                    }

                    // Run through perception filter first
                    const filterResult = perceptionFilter.filter(guildId, sentence, { userId, username });

                    if (!filterResult.allowed) {
                        logger.debug('VOICE', `Filtered out sentence: ${filterResult.reason}`);
                        return; // Skip this sentence
                    }

                    sentenceCount++;
                    fullResponse += sentence + ' ';

                    // Strip code blocks and markdown for TTS - we don't want to speak "```json"
                    let speakableSentence = sentence
                        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
                        .replace(/`[^`]+`/g, '')        // Remove inline code
                        .replace(/```\w*/g, '')         // Remove orphaned code block markers
                        .replace(/```/g, '')            // Remove any remaining backticks
                        .trim();

                    // Skip if nothing left to speak
                    if (!speakableSentence) {
                        logger.debug('VOICE', `Skipping empty/code-only sentence`);
                        return;
                    }

                    logger.info('VOICE', `Speaking sentence ${sentenceCount}: "${speakableSentence.substring(0, 50)}..."`);

                    // Speak immediately - don't wait for full response!
                    // Pass messageId so TTS can track which audio belongs to which message
                    await ttsClient.speak(guildId, connectionInfo.connection, speakableSentence, { messageId });
                },
                // isCancelled callback - AI client checks this before saving to memory
                () => tracking.cancelled && tracking.cancelledMessageId === messageId,
                // Sentiment data - emotional context for smarter AI responses
                sentimentData
            );

            // End the filter session
            perceptionFilter.endSession(guildId);

            // Mark response as complete
            tracking.inProgress = false;
            tracking.lastResponseTime = Date.now();

            // Only send full response to text channel if showTranscripts is enabled
            if (connectionInfo.showTranscripts && fullResponse.trim()) {
                await connectionInfo.textChannel.send(`🤖 **CheapShot:** ${fullResponse.trim()}`);
            }

            logger.info('VOICE', `AI responded with ${sentenceCount} sentences`);

        } catch (error) {
            // Make sure to end session and mark complete even on error
            tracking.inProgress = false;
            tracking.lastResponseTime = Date.now();
            perceptionFilter.endSession(guildId);
            logger.error('VOICE', `Failed to generate/speak AI response: ${error.message}`);
        }
    }

    /**
     * Enable or disable conversation mode
     * @param {string} guildId - Guild ID
     * @param {boolean} enabled - Whether to enable conversation mode
     */
    setConversationMode(guildId, enabled) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (connectionInfo) {
            connectionInfo.conversationMode = enabled;
            logger.info('VOICE', `Conversation mode ${enabled ? 'enabled' : 'disabled'} for guild ${guildId}`);
        }
    }

    /**
     * Check if conversation mode is enabled
     * @param {string} guildId - Guild ID
     * @returns {boolean}
     */
    isConversationMode(guildId) {
        const connectionInfo = this.activeConnections.get(guildId);
        return connectionInfo?.conversationMode || false;
    }

    /**
     * Enable or disable showing transcripts in text channel
     * @param {string} guildId - Guild ID
     * @param {boolean} enabled - Whether to show transcripts
     */
    setShowTranscripts(guildId, enabled) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (connectionInfo) {
            connectionInfo.showTranscripts = enabled;
            logger.info('VOICE', `Show transcripts ${enabled ? 'enabled' : 'disabled'} for guild ${guildId}`);
        }
    }

    /**
     * Check if showing transcripts is enabled
     * @param {string} guildId - Guild ID
     * @returns {boolean}
     */
    isShowingTranscripts(guildId) {
        const connectionInfo = this.activeConnections.get(guildId);
        return connectionInfo?.showTranscripts || false;
    }

    /**
     * Speak text in the voice channel
     * @param {string} guildId - Guild ID
     * @param {string} text - Text to speak
     */
    async speak(guildId, text) {
        const connectionInfo = this.activeConnections.get(guildId);
        if (!connectionInfo) {
            logger.error('VOICE', `Not connected to speak in guild ${guildId}`);
            return false;
        }

        return await ttsClient.speak(guildId, connectionInfo.connection, text);
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

        if (connectionInfo.showTranscripts) {
            await connectionInfo.textChannel.send('🔇 **Stopped listening.** Still in the voice channel.');
        }
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

        // Clean up TTS
        ttsClient.cleanup(guildId);

        // Clean up perception filter history
        perceptionFilter.clearHistory(guildId);

        // Clean up input filter buffers
        inputFilter.clearGuild(guildId);

        // Clean up response tracking
        const tracking = this.responseTracking.get(guildId);
        if (tracking && tracking.pendingTimer) {
            clearTimeout(tracking.pendingTimer);
        }
        this.responseTracking.delete(guildId);

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
