import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Voice Memory - Short-term memory for voice conversations
 * Stores conversation history in JSON and auto-expires after 5 minutes
 */
class VoiceMemory {
    constructor() {
        // Path to the memory file
        this.memoryDir = path.join(__dirname, '..', '..', 'data');
        this.memoryFile = path.join(this.memoryDir, 'voice_memory.json');

        // Memory expiry time (10 minutes)
        this.EXPIRY_MS = 10 * 60 * 1000;

        // Max messages per guild (oldest non-permanent get deleted)
        this.MAX_MESSAGES = 100;

        // Cleanup interval (run every minute)
        this.CLEANUP_INTERVAL_MS = 60 * 1000;

        // In-memory cache: guildId -> { messages: [], lastUpdated: timestamp }
        this.cache = new Map();

        // Ensure data directory exists
        this.ensureDataDir();

        // Load existing memory from file
        this.loadFromFile();

        // Start cleanup interval
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpired();
        }, this.CLEANUP_INTERVAL_MS);

        logger.info('VOICE_MEMORY', 'Voice memory initialized with 5-minute expiry');
    }

    /**
     * Ensure the data directory exists
     */
    ensureDataDir() {
        if (!fs.existsSync(this.memoryDir)) {
            fs.mkdirSync(this.memoryDir, { recursive: true });
            logger.info('VOICE_MEMORY', `Created data directory: ${this.memoryDir}`);
        }
    }

    /**
     * Load memory from JSON file on startup
     */
    loadFromFile() {
        try {
            if (fs.existsSync(this.memoryFile)) {
                const data = fs.readFileSync(this.memoryFile, 'utf8');
                const parsed = JSON.parse(data);

                // Convert to Map and filter out expired entries
                const now = Date.now();
                let loadedCount = 0;
                let expiredCount = 0;

                for (const [guildId, guildData] of Object.entries(parsed)) {
                    // Filter messages that aren't expired OR are permanent
                    const validMessages = guildData.messages.filter(
                        msg => msg.permanent || (now - msg.timestamp) < this.EXPIRY_MS
                    );

                    if (validMessages.length > 0) {
                        this.cache.set(guildId, {
                            messages: validMessages,
                            lastUpdated: Math.max(...validMessages.map(m => m.timestamp))
                        });
                        loadedCount += validMessages.length;
                    }
                    expiredCount += guildData.messages.length - validMessages.length;
                }

                logger.info('VOICE_MEMORY', `Loaded ${loadedCount} messages from file, expired ${expiredCount}`);
            }
        } catch (error) {
            logger.error('VOICE_MEMORY', `Failed to load memory file: ${error.message}`);
        }
    }

    /**
     * Save memory to JSON file
     */
    saveToFile() {
        try {
            const data = {};
            for (const [guildId, guildData] of this.cache) {
                data[guildId] = guildData;
            }

            fs.writeFileSync(this.memoryFile, JSON.stringify(data, null, 2), 'utf8');
            logger.debug('VOICE_MEMORY', 'Saved memory to file');
        } catch (error) {
            logger.error('VOICE_MEMORY', `Failed to save memory file: ${error.message}`);
        }
    }

    /**
     * Add a user message to memory
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} username - User's display name
     * @param {string} content - What the user said
     */
    addUserMessage(guildId, userId, username, content) {
        const now = Date.now();

        if (!this.cache.has(guildId)) {
            this.cache.set(guildId, { messages: [], lastUpdated: now });
        }

        const guildData = this.cache.get(guildId);

        guildData.messages.push({
            timestamp: now,
            role: 'user',
            userId,
            username,
            content
        });

        guildData.lastUpdated = now;

        // Enforce message limit
        this.enforceMessageLimit(guildId);

        logger.debug('VOICE_MEMORY', `[${guildId}] Added user message from ${username}: "${content.substring(0, 50)}..."`);

        // Save to file
        this.saveToFile();
    }

    /**
     * Add a bot response to memory
     * @param {string} guildId - Guild ID
     * @param {string} content - What the bot said
     */
    addBotMessage(guildId, content) {
        const now = Date.now();

        if (!this.cache.has(guildId)) {
            this.cache.set(guildId, { messages: [], lastUpdated: now });
        }

        const guildData = this.cache.get(guildId);

        guildData.messages.push({
            timestamp: now,
            role: 'assistant',
            content
        });

        guildData.lastUpdated = now;

        // Enforce message limit
        this.enforceMessageLimit(guildId);

        logger.debug('VOICE_MEMORY', `[${guildId}] Added bot response: "${content.substring(0, 50)}..."`);

        // Save to file
        this.saveToFile();
    }

    /**
     * Get conversation history for a guild (filtered by expiry)
     * @param {string} guildId - Guild ID
     * @returns {Array} Array of messages still within expiry window
     */
    getHistory(guildId) {
        if (!this.cache.has(guildId)) {
            return [];
        }

        const now = Date.now();
        const guildData = this.cache.get(guildId);

        // Filter out expired messages (permanent messages never expire)
        const validMessages = guildData.messages.filter(
            msg => msg.permanent || (now - msg.timestamp) < this.EXPIRY_MS
        );

        // Update cache with filtered messages
        if (validMessages.length !== guildData.messages.length) {
            guildData.messages = validMessages;
            this.saveToFile();
        }

        return validMessages;
    }

    /**
     * Get formatted conversation context for AI prompt
     * @param {string} guildId - Guild ID
     * @returns {string} Formatted conversation history
     */
    getFormattedContext(guildId) {
        const history = this.getHistory(guildId);

        if (history.length === 0) {
            return '';
        }

        const lines = ['[Recent conversation (last 5 minutes):]\n'];

        for (const msg of history) {
            const timeAgo = this.formatTimeAgo(msg.timestamp);

            if (msg.role === 'user') {
                lines.push(`[${timeAgo}] ${msg.username}: "${msg.content}"`);
            } else {
                lines.push(`[${timeAgo}] You said: "${msg.content}"`);
            }
        }

        lines.push('\n[End of conversation history]');

        return lines.join('\n');
    }

    /**
     * Build messages array for AI with history included
     * @param {string} guildId - Guild ID
     * @param {string} systemPrompt - The system prompt to use
     * @param {string} username - Current user's name
     * @param {string} userMessage - Current user's message
     * @returns {Array} Messages array for AI API
     */
    buildMessagesWithHistory(guildId, systemPrompt, username, userMessage) {
        let history = this.getHistory(guildId);
        const messages = [];

        // Exclude the most recent message if it matches the current message
        // (since we just added it and will add it again at the end)
        if (history.length > 0) {
            const lastMsg = history[history.length - 1];
            if (lastMsg.role === 'user' && lastMsg.content === userMessage) {
                history = history.slice(0, -1);
            }
        }

        // Add system prompt with context note if we have history
        let enhancedSystemPrompt = systemPrompt;
        if (history.length > 0) {
            enhancedSystemPrompt += `\n\nYou have a short-term memory of the last 5 minutes of conversation. Use this context to provide relevant, continuous dialogue. Reference previous topics naturally when appropriate.`;
        }

        messages.push({
            role: 'system',
            content: enhancedSystemPrompt
        });

        // Add conversation history as alternating user/assistant messages
        for (const msg of history) {
            if (msg.role === 'user') {
                messages.push({
                    role: 'user',
                    content: `[${msg.username}]: "${msg.content}"`
                });
            } else {
                messages.push({
                    role: 'assistant',
                    content: msg.content
                });
            }
        }

        // Add current message
        messages.push({
            role: 'user',
            content: `${username}: "${userMessage}"`
        });

        return messages;
    }

    /**
     * Format timestamp as "Xm ago" or "Xs ago"
     * @param {number} timestamp - Unix timestamp
     * @returns {string} Formatted time ago
     */
    formatTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) {
            return `${seconds}s ago`;
        }

        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ago`;
    }

    /**
     * Clean up expired messages from all guilds
     */
    cleanupExpired() {
        const now = Date.now();
        let totalRemoved = 0;
        let guildsCleared = 0;

        for (const [guildId, guildData] of this.cache) {
            const originalCount = guildData.messages.length;

            // Filter out expired messages (permanent messages never expire)
            guildData.messages = guildData.messages.filter(
                msg => msg.permanent || (now - msg.timestamp) < this.EXPIRY_MS
            );

            const removed = originalCount - guildData.messages.length;
            totalRemoved += removed;

            // Remove guild from cache if no messages left
            if (guildData.messages.length === 0) {
                this.cache.delete(guildId);
                guildsCleared++;
            }
        }

        if (totalRemoved > 0 || guildsCleared > 0) {
            logger.info('VOICE_MEMORY', `Cleanup: removed ${totalRemoved} expired messages, cleared ${guildsCleared} guilds`);
            this.saveToFile();
        }
    }

    /**
     * Enforce max message limit per guild
     * Removes oldest non-permanent messages when limit exceeded
     * @param {string} guildId - Guild ID
     */
    enforceMessageLimit(guildId) {
        if (!this.cache.has(guildId)) return;

        const guildData = this.cache.get(guildId);

        if (guildData.messages.length <= this.MAX_MESSAGES) return;

        // Separate permanent and non-permanent messages
        const permanentMessages = guildData.messages.filter(msg => msg.permanent);
        const temporaryMessages = guildData.messages.filter(msg => !msg.permanent);

        // Calculate how many temporary messages we can keep
        const maxTemporary = this.MAX_MESSAGES - permanentMessages.length;

        if (maxTemporary <= 0) {
            // All slots taken by permanent messages, keep only permanent
            guildData.messages = permanentMessages;
            logger.warn('VOICE_MEMORY', `[${guildId}] All message slots used by permanent messages`);
        } else if (temporaryMessages.length > maxTemporary) {
            // Remove oldest temporary messages (they're already in order by timestamp)
            const removed = temporaryMessages.length - maxTemporary;
            const keptTemporary = temporaryMessages.slice(removed);

            // Merge and sort by timestamp
            guildData.messages = [...permanentMessages, ...keptTemporary].sort(
                (a, b) => a.timestamp - b.timestamp
            );

            logger.debug('VOICE_MEMORY', `[${guildId}] Removed ${removed} oldest messages (limit: ${this.MAX_MESSAGES})`);
        }
    }

    /**
     * Import recent text channel messages into voice memory
     * This gives the AI context from the text chat when joining voice
     * @param {string} guildId - Guild ID
     * @param {Object} textChannel - Discord text channel to fetch from
     * @param {number} messageCount - Number of messages to fetch (default 10)
     * @param {string} botId - Bot's user ID to identify assistant messages
     * @returns {Promise<number>} Number of messages imported
     */
    async importTextChannelContext(guildId, textChannel, messageCount = 10, botId = null) {
        if (!textChannel) {
            logger.warn('VOICE_MEMORY', 'No text channel provided for context import');
            return 0;
        }

        try {
            // Fetch recent messages
            const messages = await textChannel.messages.fetch({ limit: messageCount });

            // Sort by timestamp (oldest first)
            const sortedMessages = [...messages.values()].sort(
                (a, b) => a.createdTimestamp - b.createdTimestamp
            );

            if (sortedMessages.length === 0) {
                logger.debug('VOICE_MEMORY', 'No messages to import from text channel');
                return 0;
            }

            // Initialize cache for this guild if needed
            const now = Date.now();
            if (!this.cache.has(guildId)) {
                this.cache.set(guildId, { messages: [], lastUpdated: now });
            }

            const guildData = this.cache.get(guildId);
            let importedCount = 0;

            // Convert Discord messages to voice memory format
            // Use relative timestamps from now, preserving order
            // This makes them "fresh" so they don't expire immediately
            const oldestMsgTime = sortedMessages[0].createdTimestamp;
            const timeSpan = sortedMessages.length > 1
                ? sortedMessages[sortedMessages.length - 1].createdTimestamp - oldestMsgTime
                : 0;

            // Map the time span to the last 2 minutes (so messages don't expire for a bit)
            const targetSpanMs = 2 * 60 * 1000; // 2 minutes
            const baseTime = now - targetSpanMs;

            for (let i = 0; i < sortedMessages.length; i++) {
                const msg = sortedMessages[i];

                // Skip empty messages and bot commands
                if (!msg.content || msg.content.trim() === '') continue;
                if (msg.content.startsWith('/')) continue;

                // Calculate proportional timestamp within our target window
                const relativePos = timeSpan > 0
                    ? (msg.createdTimestamp - oldestMsgTime) / timeSpan
                    : i / Math.max(sortedMessages.length - 1, 1);
                const timestamp = Math.floor(baseTime + (relativePos * targetSpanMs));

                // Determine if this is a bot message or user message
                const isBot = botId && msg.author.id === botId;

                if (isBot) {
                    guildData.messages.push({
                        timestamp,
                        role: 'assistant',
                        content: msg.content,
                        source: 'text_channel'
                    });
                } else {
                    // Skip other bot messages
                    if (msg.author.bot) continue;

                    guildData.messages.push({
                        timestamp,
                        role: 'user',
                        userId: msg.author.id,
                        username: msg.member?.displayName || msg.author.username,
                        content: msg.content,
                        source: 'text_channel'
                    });
                }

                importedCount++;
            }

            // Sort all messages by timestamp
            guildData.messages.sort((a, b) => a.timestamp - b.timestamp);
            guildData.lastUpdated = now;

            // Enforce message limit
            this.enforceMessageLimit(guildId);

            // Save to file
            this.saveToFile();

            logger.info('VOICE_MEMORY', `[${guildId}] Imported ${importedCount} messages from text channel for context`);
            return importedCount;

        } catch (error) {
            logger.error('VOICE_MEMORY', `Failed to import text channel context: ${error.message}`);
            return 0;
        }
    }

    /**
     * Clear all memory for a guild
     * @param {string} guildId - Guild ID
     */
    clearGuild(guildId) {
        if (this.cache.has(guildId)) {
            this.cache.delete(guildId);
            this.saveToFile();
            logger.info('VOICE_MEMORY', `Cleared memory for guild ${guildId}`);
        }
    }

    /**
     * Get stats for debugging
     * @returns {Object} Memory stats
     */
    getStats() {
        let totalMessages = 0;
        const guildStats = {};

        for (const [guildId, guildData] of this.cache) {
            const validMessages = guildData.messages.filter(
                msg => (Date.now() - msg.timestamp) < this.EXPIRY_MS
            );

            guildStats[guildId] = {
                messageCount: validMessages.length,
                lastUpdated: guildData.lastUpdated ? this.formatTimeAgo(guildData.lastUpdated) : 'never'
            };

            totalMessages += validMessages.length;
        }

        return {
            totalGuilds: this.cache.size,
            totalMessages,
            expiryMinutes: this.EXPIRY_MS / 60000,
            guildStats
        };
    }

    /**
     * Shutdown - save and cleanup
     */
    shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.saveToFile();
        logger.info('VOICE_MEMORY', 'Voice memory shutdown complete');
    }
}

// Export singleton
export const voiceMemory = new VoiceMemory();
