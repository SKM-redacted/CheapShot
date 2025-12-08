import { logger } from './logger.js';

/**
 * Context Store - Manages conversation history per channel
 * Features: Token counting, FIFO trimming, mutex locks, pending request tracking
 */
class ContextStore {
    constructor() {
        // Channel contexts: channelId -> { messages, tokenCount, pendingRequests }
        this.channelContexts = new Map();
        
        // Mutex locks per channel
        this.locks = new Map();
        
        // Max tokens before trimming (150k)
        this.maxTokens = 150000;
        
        // Lock timeout (5 seconds)
        this.lockTimeout = 5000;
    }

    /**
     * Acquire mutex lock for a channel
     * @param {string} channelId 
     * @returns {Promise<Function>} Release function
     */
    async acquireLock(channelId) {
        while (this.locks.get(channelId)) {
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Timeout check
            const lockInfo = this.locks.get(channelId);
            if (lockInfo && Date.now() - lockInfo.timestamp > this.lockTimeout) {
                logger.warn('CONTEXT', `Lock timeout for channel ${channelId}, forcing release`);
                this.locks.delete(channelId);
            }
        }
        
        this.locks.set(channelId, { timestamp: Date.now() });
        
        return () => {
            this.locks.delete(channelId);
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
     * Get or create channel context
     * @param {string} channelId 
     * @returns {Object}
     */
    getContext(channelId) {
        if (!this.channelContexts.has(channelId)) {
            this.channelContexts.set(channelId, {
                messages: [],
                tokenCount: 0,
                pendingRequests: []
            });
        }
        return this.channelContexts.get(channelId);
    }

    /**
     * Add a user message to channel context
     * @param {string} channelId 
     * @param {string} userId 
     * @param {string} username 
     * @param {string} content 
     * @returns {Promise<Object>} The added message
     */
    async addUserMessage(channelId, userId, username, content) {
        const release = await this.acquireLock(channelId);
        
        try {
            const context = this.getContext(channelId);
            
            const message = {
                timestamp: Date.now(),
                userId,
                username,
                role: 'user',
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
     * Add an assistant response to channel context
     * @param {string} channelId 
     * @param {string} content 
     * @returns {Promise<Object>} The added message
     */
    async addAssistantMessage(channelId, content) {
        const release = await this.acquireLock(channelId);
        
        try {
            const context = this.getContext(channelId);
            
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
        const release = await this.acquireLock(channelId);
        
        try {
            const context = this.getContext(channelId);
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
     * @param {string} requestId 
     */
    async removePendingRequest(channelId, requestId) {
        const release = await this.acquireLock(channelId);
        
        try {
            const context = this.getContext(channelId);
            context.pendingRequests = context.pendingRequests.filter(
                req => req.requestId !== requestId
            );
        } finally {
            release();
        }
    }

    /**
     * Get a snapshot of channel context for AI request
     * @param {string} channelId 
     * @param {string} systemPrompt 
     * @param {Object} currentRequest - { userId, username, content }
     * @returns {Promise<Array>} Messages array for AI
     */
    async getContextSnapshot(channelId, systemPrompt, currentRequest) {
        const context = this.getContext(channelId);
        const messages = [];
        
        // System prompt
        messages.push({
            role: 'system',
            content: systemPrompt
        });
        
        // Historical messages with timestamps and usernames
        for (const msg of context.messages) {
            const timestamp = new Date(msg.timestamp).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            
            if (msg.role === 'user') {
                messages.push({
                    role: 'user',
                    content: `[${timestamp}] [${msg.username}]: ${msg.content}`
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
        
        // Current request (highlighted)
        const currentTimestamp = new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        messages.push({
            role: 'user',
            content: `[${currentTimestamp}] [${currentRequest.username}]: ${currentRequest.content}\n\n[You are responding to this message]`
        });
        
        return messages;
    }

    /**
     * Trim oldest messages when approaching token limit
     * @param {Object} context 
     */
    trimContextIfNeeded(context) {
        while (context.tokenCount > this.maxTokens && context.messages.length > 1) {
            const removed = context.messages.shift();
            context.tokenCount -= this.estimateTokens(removed.content);
            logger.debug('CONTEXT', `Trimmed message, new token count: ${context.tokenCount}`);
        }
    }

    /**
     * Get context stats for a channel
     * @param {string} channelId 
     * @returns {Object}
     */
    getStats(channelId) {
        const context = this.getContext(channelId);
        return {
            messageCount: context.messages.length,
            tokenCount: context.tokenCount,
            pendingCount: context.pendingRequests.length
        };
    }

    /**
     * Clear context for a channel
     * @param {string} channelId 
     */
    async clearContext(channelId) {
        const release = await this.acquireLock(channelId);
        
        try {
            this.channelContexts.delete(channelId);
            logger.info('CONTEXT', `Cleared context for channel ${channelId}`);
        } finally {
            release();
        }
    }
}

// Singleton instance
export const contextStore = new ContextStore();
