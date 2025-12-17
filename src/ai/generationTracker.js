import { logger } from './logger.js';

/**
 * Generation Tracker - Tracks active AI generations per user
 * Allows for cancellation of previous tool-calling generations when
 * a new tool-calling request comes from the same user.
 */
class GenerationTracker {
    constructor() {
        // Active generations: Map<userId, GenerationInfo>
        // GenerationInfo contains: { requestId, channelId, abortController, hasToolCalls, startTime }
        this.activeGenerations = new Map();

        // Generation timeout in milliseconds (5 minutes max per generation)
        this.generationTimeout = 5 * 60 * 1000;
    }

    /**
     * Start tracking a new generation
     * @param {string} userId - The user who initiated the request
     * @param {string} channelId - The channel the request is in
     * @param {string} requestId - Unique request identifier
     * @returns {AbortController} Controller to abort this generation
     */
    startGeneration(userId, channelId, requestId) {
        // Check if there's an existing generation for this user
        const existing = this.activeGenerations.get(userId);

        if (existing) {
            // Only cancel if the existing generation has tool calls
            // (we don't want to cancel simple text responses)
            if (existing.hasToolCalls) {
                logger.info('GENERATION_TRACKER', `User ${userId} sent new request, cancelling previous tool-calling generation`);
                this.cancelGeneration(userId, 'New request from same user');
            }
        }

        // Create a new AbortController for this generation
        const abortController = new AbortController();

        this.activeGenerations.set(userId, {
            requestId,
            channelId,
            abortController,
            hasToolCalls: false, // Will be set to true when tool calls are detected
            startTime: Date.now(),
        });

        // Set a timeout to auto-cleanup stale generations
        setTimeout(() => {
            const current = this.activeGenerations.get(userId);
            if (current && current.requestId === requestId) {
                logger.warn('GENERATION_TRACKER', `Generation ${requestId} for user ${userId} timed out`);
                this.endGeneration(userId, requestId);
            }
        }, this.generationTimeout);

        return abortController;
    }

    /**
     * Mark a generation as having tool calls
     * This makes it eligible for cancellation if a new request comes in
     * @param {string} userId - The user whose generation has tool calls
     */
    markHasToolCalls(userId) {
        const generation = this.activeGenerations.get(userId);
        if (generation) {
            generation.hasToolCalls = true;
            logger.debug('GENERATION_TRACKER', `Marked generation for user ${userId} as having tool calls`);
        }
    }

    /**
     * Check if a generation is cancelled
     * @param {string} userId - The user to check
     * @param {string} requestId - The request ID to verify
     * @returns {boolean} True if cancelled
     */
    isCancelled(userId, requestId) {
        const generation = this.activeGenerations.get(userId);
        if (!generation || generation.requestId !== requestId) {
            // Generation doesn't exist or is a different request (old one was replaced)
            return true;
        }
        return generation.abortController.signal.aborted;
    }

    /**
     * Get the abort signal for a generation
     * @param {string} userId - The user to check
     * @param {string} requestId - The request ID
     * @returns {AbortSignal|null} The abort signal or null
     */
    getAbortSignal(userId, requestId) {
        const generation = this.activeGenerations.get(userId);
        if (generation && generation.requestId === requestId) {
            return generation.abortController.signal;
        }
        return null;
    }

    /**
     * Cancel a user's active generation
     * @param {string} userId - The user whose generation to cancel
     * @param {string} reason - Reason for cancellation
     */
    cancelGeneration(userId, reason = 'Cancelled') {
        const generation = this.activeGenerations.get(userId);
        if (generation) {
            logger.info('GENERATION_TRACKER', `Cancelling generation ${generation.requestId} for user ${userId}: ${reason}`);
            generation.abortController.abort(reason);
            this.activeGenerations.delete(userId);
        }
    }

    /**
     * End a generation (normal completion)
     * @param {string} userId - The user whose generation completed
     * @param {string} requestId - The request ID that completed
     */
    endGeneration(userId, requestId) {
        const generation = this.activeGenerations.get(userId);
        if (generation && generation.requestId === requestId) {
            logger.debug('GENERATION_TRACKER', `Generation ${requestId} completed for user ${userId}`);
            this.activeGenerations.delete(userId);
        }
    }

    /**
     * Check if a user has an active generation with tool calls
     * @param {string} userId - The user to check
     * @returns {boolean} True if there's an active tool-calling generation
     */
    hasActiveToolGeneration(userId) {
        const generation = this.activeGenerations.get(userId);
        return generation?.hasToolCalls === true && !generation.abortController.signal.aborted;
    }

    /**
     * Get stats about active generations
     * @returns {Object} Stats object
     */
    getStats() {
        const stats = {
            total: this.activeGenerations.size,
            withToolCalls: 0,
            users: []
        };

        for (const [userId, gen] of this.activeGenerations) {
            if (gen.hasToolCalls) stats.withToolCalls++;
            stats.users.push({
                userId,
                channelId: gen.channelId,
                hasToolCalls: gen.hasToolCalls,
                elapsedMs: Date.now() - gen.startTime
            });
        }

        return stats;
    }
}

// Singleton instance
export const generationTracker = new GenerationTracker();
