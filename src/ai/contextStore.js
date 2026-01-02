import { logger } from './logger.js';
import { query, testConnection, getGuildSettings } from '../shared/database.js';

/**
 * Context Store - Manages conversation history per person (per guild-channel-user triple)
 * Features: Token counting, FIFO trimming, mutex locks, pending request tracking,
 *           Database persistence with in-memory caching
 */
class ContextStore {
    constructor() {
        // Person contexts: contextKey (guildId-channelId-userId) -> { messages, tokenCount, pendingRequests }
        this.personContexts = new Map();

        // Track which contexts have been loaded from DB
        this.loadedFromDb = new Set();

        // Cache for guild persistence settings (guildId -> { enabled, timestamp })
        this.guildPersistenceCache = new Map();
        this.persistenceCacheTTL = 60000; // 1 minute cache

        // Mutex locks per context key
        this.locks = new Map();

        // Max tokens before trimming (20k - keeps context focused)
        this.maxTokens = 20000;

        // Max messages before trimming (keep last 25 messages)
        this.maxMessages = 25;

        // Lock timeout (5 seconds)
        this.lockTimeout = 5000;

        // Save debounce delay (500ms)
        this.saveDebounceDelay = 500;

        // Pending save operations
        this.pendingSaves = new Map();

        // Database ready flag
        this.dbReady = false;

        // Initialize database connection
        this.initDb();
    }

    /**
     * Initialize database connection
     */
    async initDb() {
        try {
            const connected = await testConnection();
            if (connected) {
                this.dbReady = true;
                logger.info('CONTEXT', 'Database connection established for context persistence');

                // Ensure the table exists (in case init-db.sql hasn't run)
                await this.ensureTable();
            } else {
                logger.warn('CONTEXT', 'Database not available, running in memory-only mode');
            }
        } catch (err) {
            logger.warn('CONTEXT', `Database init failed, running in memory-only mode: ${err.message}`);
        }
    }

    /**
     * Ensure the conversation_context table exists
     */
    async ensureTable() {
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS "conversation_context" (
                    "guild_id" VARCHAR(20) NOT NULL,
                    "channel_id" VARCHAR(20) NOT NULL,
                    "user_id" VARCHAR(20) NOT NULL,
                    "messages" JSONB NOT NULL DEFAULT '[]',
                    "token_count" INTEGER NOT NULL DEFAULT 0,
                    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    PRIMARY KEY ("guild_id", "channel_id", "user_id")
                )
            `);
            logger.debug('CONTEXT', 'Conversation context table verified');
        } catch (err) {
            logger.error('CONTEXT', `Failed to ensure table exists: ${err.message}`);
        }
    }

    /**
     * Check if context persistence is enabled for a guild
     * Context is enabled by default if no setting exists
     * @param {string} guildId 
     * @returns {Promise<boolean>}
     */
    async isPersistenceEnabled(guildId) {
        // DMs always use memory only (no guild settings)
        if (guildId === 'DM') {
            return false;
        }

        // Check cache first (reduced TTL for faster toggle response)
        const cached = this.guildPersistenceCache.get(guildId);
        if (cached && Date.now() - cached.timestamp < 10000) { // 10 second cache
            return cached.enabled;
        }

        try {
            const settings = await getGuildSettings(guildId);
            // Default to true if not set (context enabled by default)
            const enabled = settings?.modules?.context?.enabled ?? true;

            // Cache the result
            this.guildPersistenceCache.set(guildId, {
                enabled,
                timestamp: Date.now()
            });

            return enabled;
        } catch (err) {
            logger.warn('CONTEXT', `Failed to check guild settings, defaulting to enabled: ${err.message}`);
            return true;
        }
    }

    /**
     * Clear specific context from both memory and database
     * @param {string} guildId 
     * @param {string} channelId 
     * @param {string} userId 
     * @returns {Promise<boolean>} Whether context was cleared
     */
    async clearSpecificContext(guildId, channelId, userId) {
        const contextKey = this.getContextKey(guildId, channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            // Clear from memory
            this.personContexts.delete(contextKey);
            this.loadedFromDb.delete(contextKey);

            // Clear any pending saves
            if (this.pendingSaves.has(contextKey)) {
                clearTimeout(this.pendingSaves.get(contextKey));
                this.pendingSaves.delete(contextKey);
            }

            // Clear from database
            if (this.dbReady) {
                try {
                    await query(
                        `DELETE FROM conversation_context 
                         WHERE guild_id = $1 AND channel_id = $2 AND user_id = $3`,
                        [guildId, channelId, userId]
                    );
                    logger.info('CONTEXT', `Cleared context for ${contextKey} from memory and DB`);
                } catch (err) {
                    logger.error('CONTEXT', `Failed to clear context from DB: ${err.message}`);
                }
            } else {
                logger.info('CONTEXT', `Cleared context for ${contextKey} from memory`);
            }

            return true;
        } finally {
            release();
        }
    }

    /**
     * Generate a unique context key for a guild-channel-user triple
     * @param {string} guildId 
     * @param {string} channelId 
     * @param {string} userId 
     * @returns {string}
     */
    getContextKey(guildId, channelId, userId) {
        return `${guildId}-${channelId}-${userId}`;
    }

    /**
     * Parse a context key back into components
     * @param {string} contextKey 
     * @returns {{ guildId: string, channelId: string, userId: string }}
     */
    parseContextKey(contextKey) {
        const parts = contextKey.split('-');
        return {
            guildId: parts[0],
            channelId: parts[1],
            userId: parts[2]
        };
    }

    /**
     * Acquire mutex lock for a context
     * @param {string} contextKey 
     * @returns {Promise<Function>} Release function
     */
    async acquireLock(contextKey) {
        while (this.locks.get(contextKey)) {
            await new Promise(resolve => setTimeout(resolve, 10));

            // Timeout check
            const lockInfo = this.locks.get(contextKey);
            if (lockInfo && Date.now() - lockInfo.timestamp > this.lockTimeout) {
                logger.warn('CONTEXT', `Lock timeout for context ${contextKey}, forcing release`);
                this.locks.delete(contextKey);
            }
        }

        this.locks.set(contextKey, { timestamp: Date.now() });

        return () => {
            this.locks.delete(contextKey);
        };
    }

    /**
     * Estimate token count from text (rough: chars / 4)
     * @param {string} text 
     * @returns {number}
     */
    estimateTokens(text) {
        return Math.ceil((text || '').length / 4);
    }

    /**
     * Load context from database
     * @param {string} guildId 
     * @param {string} channelId 
     * @param {string} userId 
     * @returns {Promise<Object|null>}
     */
    async loadFromDb(guildId, channelId, userId) {
        if (!this.dbReady) return null;

        // Check if persistence is enabled for this guild
        const persistenceEnabled = await this.isPersistenceEnabled(guildId);
        if (!persistenceEnabled) return null;

        try {
            const result = await query(
                `SELECT messages, token_count FROM conversation_context 
                 WHERE guild_id = $1 AND channel_id = $2 AND user_id = $3`,
                [guildId, channelId, userId]
            );

            if (result.rows.length > 0) {
                const row = result.rows[0];
                return {
                    messages: row.messages || [],
                    tokenCount: row.token_count || 0,
                    pendingRequests: []
                };
            }
        } catch (err) {
            logger.error('CONTEXT', `Failed to load context from DB: ${err.message}`);
        }

        return null;
    }

    /**
     * Save context to database (debounced)
     * @param {string} guildId 
     * @param {string} channelId 
     * @param {string} userId 
     * @param {Object} context 
     */
    async scheduleSave(guildId, channelId, userId, context) {
        if (!this.dbReady) return;

        // Check if persistence is enabled for this guild
        const persistenceEnabled = await this.isPersistenceEnabled(guildId);
        if (!persistenceEnabled) {
            logger.debug('CONTEXT', `Persistence disabled for guild ${guildId}, skipping DB save`);
            return;
        }

        const contextKey = this.getContextKey(guildId, channelId, userId);

        // Clear existing timer for this key
        if (this.pendingSaves.has(contextKey)) {
            clearTimeout(this.pendingSaves.get(contextKey));
        }

        // Schedule new save
        const timer = setTimeout(async () => {
            this.pendingSaves.delete(contextKey);
            await this.saveToDb(guildId, channelId, userId, context);
        }, this.saveDebounceDelay);

        this.pendingSaves.set(contextKey, timer);
    }

    /**
     * Save context to database immediately
     * @param {string} guildId 
     * @param {string} channelId 
     * @param {string} userId 
     * @param {Object} context 
     */
    async saveToDb(guildId, channelId, userId, context) {
        if (!this.dbReady) return;

        try {
            await query(
                `INSERT INTO conversation_context (guild_id, channel_id, user_id, messages, token_count, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (guild_id, channel_id, user_id) 
                 DO UPDATE SET messages = $4, token_count = $5, updated_at = NOW()`,
                [guildId, channelId, userId, JSON.stringify(context.messages), context.tokenCount]
            );
            logger.debug('CONTEXT', `Saved context for ${guildId}-${channelId}-${userId} to database`);
        } catch (err) {
            logger.error('CONTEXT', `Failed to save context to DB: ${err.message}`);
        }
    }

    /**
     * Get or create person context (with database loading and sync)
     * @param {string} guildId - The guild/server ID
     * @param {string} channelId - The channel ID
     * @param {string} userId - The user ID
     * @returns {Promise<Object>}
     */
    async getContext(guildId, channelId, userId) {
        const contextKey = this.getContextKey(guildId, channelId, userId);

        // If not in memory, try to load from database
        if (!this.personContexts.has(contextKey) && !this.loadedFromDb.has(contextKey)) {
            this.loadedFromDb.add(contextKey);
            const dbContext = await this.loadFromDb(guildId, channelId, userId);
            if (dbContext) {
                this.personContexts.set(contextKey, dbContext);
                // Track when we last synced with DB
                dbContext.lastDbSync = Date.now();
                logger.debug('CONTEXT', `Loaded context from DB for ${contextKey}`);
            }
        }

        // If we have a cached context, periodically check if it was deleted from DB
        const existingContext = this.personContexts.get(contextKey);
        if (existingContext && this.dbReady && this.loadedFromDb.has(contextKey)) {
            const lastSync = existingContext.lastDbSync || 0;
            // Re-sync with DB every 30 seconds to catch external deletes
            if (Date.now() - lastSync > 30000) {
                existingContext.lastDbSync = Date.now();
                const persistenceEnabled = await this.isPersistenceEnabled(guildId);
                if (persistenceEnabled) {
                    try {
                        const result = await query(
                            `SELECT 1 FROM conversation_context WHERE guild_id = $1 AND channel_id = $2 AND user_id = $3`,
                            [guildId, channelId, userId]
                        );
                        // If not in DB but we have it in memory with messages, clear it (was deleted externally)
                        if (result.rows.length === 0 && existingContext.messages && existingContext.messages.length > 0) {
                            logger.info('CONTEXT', `Context ${contextKey} was deleted externally, clearing memory`);
                            this.personContexts.delete(contextKey);
                            this.loadedFromDb.delete(contextKey);
                        }
                    } catch (err) {
                        logger.warn('CONTEXT', `Failed to sync context with DB: ${err.message}`);
                    }
                }
            }
        }

        // Create if still doesn't exist
        if (!this.personContexts.has(contextKey)) {
            this.personContexts.set(contextKey, {
                messages: [],
                tokenCount: 0,
                pendingRequests: [],
                lastDbSync: Date.now()
            });
        }

        return this.personContexts.get(contextKey);
    }

    /**
     * Add a user message to person context
     * @param {string} guildId - The guild/server ID
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} username 
     * @param {string} content 
     * @param {Array} images - Optional array of image data from extractImagesFromMessage
     * @returns {Promise<Object>} The added message
     */
    async addUserMessage(guildId, channelId, userId, username, content, images = null) {
        const contextKey = this.getContextKey(guildId, channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            const context = await this.getContext(guildId, channelId, userId);

            const message = {
                timestamp: Date.now(),
                userId,
                username,
                role: 'user',
                content
            };

            // Store images if provided (for vision API support)
            if (images && images.length > 0) {
                message.images = images;
            }

            context.messages.push(message);
            context.tokenCount += this.estimateTokens(content);

            // Images add significantly to context size (estimate ~1000 tokens per image)
            if (images && images.length > 0) {
                context.tokenCount += images.length * 1000;
            }

            // Trim if over limit
            this.trimContextIfNeeded(context);

            // Schedule database save
            await this.scheduleSave(guildId, channelId, userId, context);

            return message;
        } finally {
            release();
        }
    }

    /**
     * Add an assistant response to person context
     * @param {string} guildId - The guild/server ID
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} content 
     * @returns {Promise<Object>} The added message
     */
    async addAssistantMessage(guildId, channelId, userId, content) {
        const contextKey = this.getContextKey(guildId, channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            const context = await this.getContext(guildId, channelId, userId);

            const message = {
                timestamp: Date.now(),
                role: 'assistant',
                content
            };

            context.messages.push(message);
            context.tokenCount += this.estimateTokens(content);

            // Trim if over limit
            this.trimContextIfNeeded(context);

            // Schedule database save
            await this.scheduleSave(guildId, channelId, userId, context);

            return message;
        } finally {
            release();
        }
    }

    /**
     * Add a pending request to track
     * @param {string} guildId - The guild/server ID
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} username 
     * @param {string} content 
     * @returns {Promise<string>} Request ID
     */
    async addPendingRequest(guildId, channelId, userId, username, content) {
        const contextKey = this.getContextKey(guildId, channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            const context = await this.getContext(guildId, channelId, userId);
            const requestId = `${userId}-${Date.now()}`;

            context.pendingRequests.push({
                requestId,
                userId,
                username,
                content: content.substring(0, 100), // Short preview
                timestamp: Date.now()
            });

            return requestId;
        } finally {
            release();
        }
    }

    /**
     * Remove a pending request
     * @param {string} guildId - The guild/server ID
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} requestId 
     */
    async removePendingRequest(guildId, channelId, userId, requestId) {
        const contextKey = this.getContextKey(guildId, channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            const context = await this.getContext(guildId, channelId, userId);
            context.pendingRequests = context.pendingRequests.filter(
                req => req.requestId !== requestId
            );
        } finally {
            release();
        }
    }

    /**
     * Get a snapshot of person context for AI request
     * @param {string} guildId - The guild/server ID
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} systemPrompt 
     * @param {Object} currentRequest - { userId, username, content, images? }
     * @returns {Promise<Array>} Messages array for AI
     */
    async getContextSnapshot(guildId, channelId, userId, systemPrompt, currentRequest) {
        const context = await this.getContext(guildId, channelId, userId);
        const messages = [];

        // System prompt
        messages.push({
            role: 'system',
            content: systemPrompt
        });

        // Historical messages with timestamps and usernames
        // Note: We don't include historical images to avoid context bloat
        // Only the current request's images are sent
        for (const msg of context.messages) {
            const timestamp = new Date(msg.timestamp).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });

            if (msg.role === 'user') {
                // For historical messages, just include text (no images to save context)
                const textContent = `[${timestamp}] [${msg.username}]: ${msg.content}`;

                // Add a note if the message had images
                const imageNote = msg.images?.length > 0 ? ` [${msg.images.length} image(s) attached]` : '';

                messages.push({
                    role: 'user',
                    content: textContent + imageNote
                });
            } else {
                messages.push({
                    role: 'assistant',
                    content: `[${timestamp}] [CheapShot]: ${msg.content}`
                });
            }
        }

        // Add pending requests note if any (excluding current)
        const otherPending = context.pendingRequests.filter(
            req => req.userId !== currentRequest.userId || req.content !== currentRequest.content.substring(0, 100)
        );

        if (otherPending.length > 0) {
            const pendingList = otherPending.map(
                req => `${req.username} (asking: "${req.content}...")`
            ).join(', ');

            messages.push({
                role: 'system',
                content: `Currently processing requests from: ${pendingList}`
            });
        }

        // Current request (highlighted) - with images if present
        const currentTimestamp = new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });

        const currentText = `[${currentTimestamp}] [${currentRequest.username}]: ${currentRequest.content}\n\n[You are responding to this message]`;

        // If current request has images, use multi-part content format (Vision API)
        if (currentRequest.images && currentRequest.images.length > 0) {
            const content = [
                { type: 'text', text: currentText }
            ];

            // Add images in Vision API format
            for (const img of currentRequest.images) {
                if (img.base64 && img.mimeType) {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${img.mimeType};base64,${img.base64}`
                        }
                    });
                }
            }

            messages.push({
                role: 'user',
                content: content
            });
        } else {
            messages.push({
                role: 'user',
                content: currentText
            });
        }

        return messages;
    }

    /**
     * Trim oldest messages when exceeding limits
     * Enforces both token limit AND message count limit
     * @param {Object} context 
     */
    trimContextIfNeeded(context) {
        // First, enforce message count limit (keep last 25 messages)
        while (context.messages.length > this.maxMessages) {
            const removed = context.messages.shift();
            context.tokenCount -= this.estimateTokens(removed.content);
            logger.debug('CONTEXT', `Trimmed old message (count limit), ${context.messages.length} messages remaining`);
        }

        // Then, enforce token limit
        while (context.tokenCount > this.maxTokens && context.messages.length > 1) {
            const removed = context.messages.shift();
            context.tokenCount -= this.estimateTokens(removed.content);
            logger.debug('CONTEXT', `Trimmed message (token limit), new token count: ${context.tokenCount}`);
        }
    }

    /**
     * Get context stats for a person
     * @param {string} guildId - The guild/server ID
     * @param {string} channelId 
     * @param {string} userId 
     * @returns {Promise<Object>}
     */
    async getStats(guildId, channelId, userId) {
        const context = await this.getContext(guildId, channelId, userId);
        return {
            messageCount: context.messages.length,
            tokenCount: context.tokenCount,
            pendingCount: context.pendingRequests.length
        };
    }

    /**
     * Clear context for a person
     * @param {string} guildId - The guild/server ID
     * @param {string} channelId 
     * @param {string} userId 
     */
    async clearContext(guildId, channelId, userId) {
        const contextKey = this.getContextKey(guildId, channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            this.personContexts.delete(contextKey);
            this.loadedFromDb.delete(contextKey);

            // Also clear from database
            if (this.dbReady) {
                try {
                    await query(
                        `DELETE FROM conversation_context 
                         WHERE guild_id = $1 AND channel_id = $2 AND user_id = $3`,
                        [guildId, channelId, userId]
                    );
                    logger.info('CONTEXT', `Cleared context from DB for ${contextKey}`);
                } catch (err) {
                    logger.error('CONTEXT', `Failed to clear context from DB: ${err.message}`);
                }
            }

            logger.info('CONTEXT', `Cleared context for ${contextKey}`);
        } finally {
            release();
        }
    }

    /**
     * Clear all contexts for a specific user (across all channels and guilds)
     * @param {string} userId - The user ID to clear contexts for
     * @returns {Promise<number>} Number of contexts cleared
     */
    async clearUserContext(userId) {
        let cleared = 0;
        for (const [key] of this.personContexts) {
            // contextKey format is "guildId-channelId-userId"
            if (key.endsWith(`-${userId}`)) {
                this.personContexts.delete(key);
                this.loadedFromDb.delete(key);
                cleared++;
            }
        }

        // Also clear from database
        if (this.dbReady) {
            try {
                const result = await query(
                    `DELETE FROM conversation_context WHERE user_id = $1`,
                    [userId]
                );
                cleared = Math.max(cleared, result.rowCount || 0);
            } catch (err) {
                logger.error('CONTEXT', `Failed to clear user context from DB: ${err.message}`);
            }
        }

        logger.info('CONTEXT', `Cleared ${cleared} context(s) for user ${userId}`);
        return cleared;
    }

    /**
     * Clear all contexts for a specific guild (server)
     * @param {string} guildId - The guild ID
     * @returns {Promise<number>} Number of contexts cleared
     */
    async clearGuildContext(guildId) {
        let cleared = 0;

        for (const [key] of this.personContexts) {
            // contextKey format is "guildId-channelId-userId"
            if (key.startsWith(`${guildId}-`)) {
                this.personContexts.delete(key);
                this.loadedFromDb.delete(key);
                cleared++;
            }
        }

        // Also clear from database
        if (this.dbReady) {
            try {
                const result = await query(
                    `DELETE FROM conversation_context WHERE guild_id = $1`,
                    [guildId]
                );
                cleared = Math.max(cleared, result.rowCount || 0);
            } catch (err) {
                logger.error('CONTEXT', `Failed to clear guild context from DB: ${err.message}`);
            }
        }

        logger.info('CONTEXT', `Cleared ${cleared} context(s) for guild ${guildId}`);
        return cleared;
    }

    /**
     * Clear all contexts globally (admin/owner only)
     * @returns {Promise<number>} Number of contexts cleared
     */
    async clearAllContexts() {
        const memoryCount = this.personContexts.size;
        this.personContexts.clear();
        this.loadedFromDb.clear();

        let dbCount = 0;

        // Also clear from database
        if (this.dbReady) {
            try {
                const result = await query(`DELETE FROM conversation_context`);
                dbCount = result.rowCount || 0;
            } catch (err) {
                logger.error('CONTEXT', `Failed to clear all contexts from DB: ${err.message}`);
            }
        }

        const total = Math.max(memoryCount, dbCount);
        logger.info('CONTEXT', `Cleared all ${total} context(s) globally`);
        return total;
    }

    /**
     * Flush all pending saves to database (useful before shutdown)
     */
    async flushPendingSaves() {
        const promises = [];
        for (const [contextKey, timer] of this.pendingSaves) {
            clearTimeout(timer);
            const { guildId, channelId, userId } = this.parseContextKey(contextKey);
            const context = this.personContexts.get(contextKey);
            if (context) {
                promises.push(this.saveToDb(guildId, channelId, userId, context));
            }
        }
        this.pendingSaves.clear();

        if (promises.length > 0) {
            await Promise.all(promises);
            logger.info('CONTEXT', `Flushed ${promises.length} pending save(s) to database`);
        }
    }
}

// Singleton instance
export const contextStore = new ContextStore();
