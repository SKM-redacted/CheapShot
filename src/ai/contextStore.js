import { logger } from './logger.js';

/**
 * Context Store - Manages conversation history per person (per channel-user pair)
 * Features: Token counting, FIFO trimming, mutex locks, pending request tracking
 */
class ContextStore {
    constructor() {
        // Person contexts: contextKey (channelId-userId) -> { messages, tokenCount, pendingRequests }
        this.personContexts = new Map();

        // Mutex locks per context key
        this.locks = new Map();

        // Max tokens before trimming (20k - keeps context focused)
        this.maxTokens = 20000;

        // Max messages before trimming (keep last 10 messages for focused responses)
        this.maxMessages = 10;

        // Lock timeout (5 seconds)
        this.lockTimeout = 5000;
    }

    /**
     * Generate a unique context key for a channel-user pair
     * @param {string} channelId 
     * @param {string} userId 
     * @returns {string}
     */
    getContextKey(channelId, userId) {
        return `${channelId}-${userId}`;
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
     * Get or create person context
     * @param {string} contextKey - The composite channelId-userId key
     * @returns {Object}
     */
    getContext(contextKey) {
        if (!this.personContexts.has(contextKey)) {
            this.personContexts.set(contextKey, {
                messages: [],
                tokenCount: 0,
                pendingRequests: []
            });
        }
        return this.personContexts.get(contextKey);
    }

    /**
     * Add a user message to person context
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} username 
     * @param {string} content 
     * @param {Array} images - Optional array of image data from extractImagesFromMessage
     * @returns {Promise<Object>} The added message
     */
    async addUserMessage(channelId, userId, username, content, images = null) {
        const contextKey = this.getContextKey(channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            const context = this.getContext(contextKey);

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

            return message;
        } finally {
            release();
        }
    }

    /**
     * Add an assistant response to person context
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} content 
     * @returns {Promise<Object>} The added message
     */
    async addAssistantMessage(channelId, userId, content) {
        const contextKey = this.getContextKey(channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            const context = this.getContext(contextKey);

            const message = {
                timestamp: Date.now(),
                role: 'assistant',
                content
            };

            context.messages.push(message);
            context.tokenCount += this.estimateTokens(content);

            // Trim if over limit
            this.trimContextIfNeeded(context);

            return message;
        } finally {
            release();
        }
    }

    /**
     * Add a pending request to track
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} username 
     * @param {string} content 
     * @returns {Promise<string>} Request ID
     */
    async addPendingRequest(channelId, userId, username, content) {
        const contextKey = this.getContextKey(channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            const context = this.getContext(contextKey);
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
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} requestId 
     */
    async removePendingRequest(channelId, userId, requestId) {
        const contextKey = this.getContextKey(channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            const context = this.getContext(contextKey);
            context.pendingRequests = context.pendingRequests.filter(
                req => req.requestId !== requestId
            );
        } finally {
            release();
        }
    }

    /**
     * Get a snapshot of person context for AI request
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} systemPrompt 
     * @param {Object} currentRequest - { userId, username, content, images? }
     * @returns {Promise<Array>} Messages array for AI
     */
    async getContextSnapshot(channelId, userId, systemPrompt, currentRequest) {
        const contextKey = this.getContextKey(channelId, userId);
        const context = this.getContext(contextKey);
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
     * @param {string} channelId 
     * @param {string} userId 
     * @returns {Object}
     */
    getStats(channelId, userId) {
        const contextKey = this.getContextKey(channelId, userId);
        const context = this.getContext(contextKey);
        return {
            messageCount: context.messages.length,
            tokenCount: context.tokenCount,
            pendingCount: context.pendingRequests.length
        };
    }

    /**
     * Clear context for a person
     * @param {string} channelId 
     * @param {string} userId 
     */
    async clearContext(channelId, userId) {
        const contextKey = this.getContextKey(channelId, userId);
        const release = await this.acquireLock(contextKey);

        try {
            this.personContexts.delete(contextKey);
            logger.info('CONTEXT', `Cleared context for ${contextKey}`);
        } finally {
            release();
        }
    }
}

// Singleton instance
export const contextStore = new ContextStore();
