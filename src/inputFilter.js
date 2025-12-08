import { logger } from './logger.js';

/**
 * Input Perception Filter - Catches incomplete transcripts and merges them
 * 
 * Problem: STT sometimes splits one sentence into multiple transcripts
 * Example: "Honestly, this is a pretty cool project, and I'm" + "pretty happy with how it is."
 * 
 * Solution: Detect incomplete endings and buffer until we get a complete thought
 * BUT: Be smart about sentence length - longer sentences are likely complete even with trailing words
 */
class InputFilter {
    constructor() {
        // Buffers for incomplete transcripts: guildId-userId -> { text, timer, timestamp }
        this.pendingTranscripts = new Map();

        this.settings = {
            // How long to wait for continuation after an incomplete transcript (ms)
            // 3 seconds is a good balance between catching continuations and responsiveness
            continuationTimeoutMs: 3000,

            // Minimum time gap to consider transcripts as separate (ms)
            // If a new transcript arrives within this window, consider merging
            mergeWindowMs: 4000,

            // If a sentence has this many words or more, don't flag it as incomplete
            // (even if it ends with a conjunction - it's probably a complete thought)
            minWordsForComplete: 6
        };

        // STRONG incomplete patterns - these almost always mean incomplete regardless of length
        this.strongIncompleteEndings = [
            // Trailing "I'm", "you're", etc. - very clearly incomplete
            /\b(I'm|I am|you're|you are|we're|we are|they're|they are|he's|she's|it's)\s*$/i,

            // Ends with just an article - definitely incomplete
            /\b(a|an|the)\s*$/i,

            // Ends with comma - mid-sentence
            /,\s*$/,

            // Ends with "didn't", "couldn't", etc without completing the thought
            /\b(didn't|couldn't|wouldn't|shouldn't|can't|won't|isn't|aren't|wasn't|weren't)\s*$/i,
        ];

        // WEAK incomplete patterns - only flag if sentence is SHORT (< minWordsForComplete)
        this.weakIncompleteEndings = [
            // Trailing conjunctions
            /\b(and|but|or|so|because|since|while|when|if|although|though|unless|until|as|that)\\s*$/i,

            // Trailing prepositions
            /\b(to|for|with|at|by|from|in|on|of|about|into|through|during|before|after)\s*$/i,

            // Trailing verbs that expect an object
            /\b(is|are|was|were|have|has|had|do|does|did|will|would|could|should|might|may)\s*$/i,
        ];

        // Patterns that indicate a standalone continuation (less strict now)
        this.continuationStarts = [
            // Lowercase start (likely continuation)
            /^[a-z]/,

            // Starts with common continuation words
            /^(pretty|really|very|so|quite|just|also|too|still|already|even|only|going|trying|getting|making|doing)\b/i,

            // Starts with pronouns that might continue a thought
            /^(it|that|this|which|who|what)\b/i,
        ];
    }

    /**
     * Get a unique key for a user's transcript buffer
     */
    getKey(guildId, userId) {
        return `${guildId}-${userId}`;
    }

    /**
     * Count words in a string
     */
    countWords(text) {
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    }

    /**
     * Check if a transcript looks incomplete
     * @param {string} text - The transcript text
     * @returns {boolean} True if it looks incomplete
     */
    looksIncomplete(text) {
        const trimmed = text.trim();
        const wordCount = this.countWords(trimmed);

        // Very short responses (1-2 words) are always complete
        // This allows "you", "yes", "no", "what", "really", etc. to go through
        if (wordCount <= 2) {
            return false;
        }

        // Check STRONG patterns first - these apply regardless of length
        for (const pattern of this.strongIncompleteEndings) {
            if (pattern.test(trimmed)) {
                logger.debug('INPUT_FILTER', `Strong incomplete pattern matched: "${trimmed}"`);
                return true;
            }
        }

        // Check WEAK patterns - only if sentence is short
        if (wordCount < this.settings.minWordsForComplete) {
            for (const pattern of this.weakIncompleteEndings) {
                if (pattern.test(trimmed)) {
                    logger.debug('INPUT_FILTER', `Weak incomplete pattern matched (${wordCount} words): "${trimmed}"`);
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if a transcript looks like a continuation of a previous one
     * @param {string} text - The new transcript text
     * @returns {boolean} True if it looks like a continuation
     */
    looksContinuation(text) {
        const trimmed = text.trim();

        for (const pattern of this.continuationStarts) {
            if (pattern.test(trimmed)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Process an incoming transcript - may buffer incomplete ones
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} transcript - The transcribed text
     * @param {Function} onComplete - Callback when we have a complete transcript
     * @returns {boolean} True if transcript was processed immediately, false if buffered
     */
    process(guildId, userId, transcript, onComplete) {
        const key = this.getKey(guildId, userId);
        const now = Date.now();
        const pending = this.pendingTranscripts.get(key);
        const trimmed = transcript.trim();

        // Check if we have a pending incomplete transcript
        if (pending) {
            // Clear the timeout
            if (pending.timer) {
                clearTimeout(pending.timer);
            }

            // Check if this looks like a continuation
            const timeSincePending = now - pending.timestamp;

            // ALWAYS merge if:
            // 1. Within merge window AND
            // 2. Previous was incomplete OR new one looks like a continuation
            // This is intentionally aggressive - better to merge too much than split too much
            const shouldMerge = timeSincePending < this.settings.mergeWindowMs &&
                (pending.wasIncomplete || this.looksContinuation(trimmed));

            if (shouldMerge) {
                // Merge the transcripts
                const merged = pending.text + ' ' + trimmed;
                logger.info('INPUT_FILTER', `Merged split transcripts: "${pending.text}" + "${trimmed}" = "${merged}"`);

                // Check if the merged result is STILL incomplete
                if (this.looksIncomplete(merged)) {
                    // Still incomplete - keep buffering
                    pending.text = merged;
                    pending.timestamp = now;
                    pending.wasIncomplete = true;
                    pending.timer = setTimeout(() => {
                        this.flushPending(key, onComplete);
                    }, this.settings.continuationTimeoutMs);

                    logger.debug('INPUT_FILTER', `Merged but still incomplete, waiting for more...`);
                    return false;
                }

                // Merged and complete - flush it
                this.pendingTranscripts.delete(key);
                onComplete(merged);
                return true;
            } else {
                // Not a continuation - flush the old one first, then process new
                logger.debug('INPUT_FILTER', `Not a continuation (${timeSincePending}ms gap), flushing old and processing new`);
                this.pendingTranscripts.delete(key);
                onComplete(pending.text);

                // Fall through to process the new transcript
            }
        }

        // Check if this new transcript is incomplete
        if (this.looksIncomplete(trimmed)) {
            logger.info('INPUT_FILTER', `Incomplete transcript detected, buffering: "${trimmed}"`);

            const timer = setTimeout(() => {
                this.flushPending(key, onComplete);
            }, this.settings.continuationTimeoutMs);

            this.pendingTranscripts.set(key, {
                text: trimmed,
                timer: timer,
                timestamp: now,
                wasIncomplete: true
            });

            return false; // Buffered, not processed yet
        }

        // Complete transcript - process immediately
        onComplete(trimmed);
        return true;
    }

    /**
     * Flush a pending transcript (timeout expired or manual flush)
     * @param {string} key - Buffer key
     * @param {Function} onComplete - Callback
     */
    flushPending(key, onComplete) {
        const pending = this.pendingTranscripts.get(key);
        if (pending) {
            if (pending.timer) {
                clearTimeout(pending.timer);
            }
            this.pendingTranscripts.delete(key);

            logger.info('INPUT_FILTER', `Flushing incomplete transcript after timeout: "${pending.text}"`);
            onComplete(pending.text);
        }
    }

    /**
     * Flush all pending transcripts for a user
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {Function} onComplete - Callback
     */
    flushUser(guildId, userId, onComplete) {
        const key = this.getKey(guildId, userId);
        this.flushPending(key, onComplete);
    }

    /**
     * Clear buffer for a user without flushing
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     */
    clearUser(guildId, userId) {
        const key = this.getKey(guildId, userId);
        const pending = this.pendingTranscripts.get(key);
        if (pending) {
            if (pending.timer) {
                clearTimeout(pending.timer);
            }
            this.pendingTranscripts.delete(key);
        }
    }

    /**
     * Clear all buffers for a guild
     * @param {string} guildId - Guild ID
     */
    clearGuild(guildId) {
        for (const [key, pending] of this.pendingTranscripts) {
            if (key.startsWith(guildId + '-')) {
                if (pending.timer) {
                    clearTimeout(pending.timer);
                }
                this.pendingTranscripts.delete(key);
            }
        }
    }

    /**
     * Update settings
     * @param {string} key - Setting key
     * @param {*} value - Setting value
     */
    setSetting(key, value) {
        if (key in this.settings) {
            this.settings[key] = value;
            logger.info('INPUT_FILTER', `Updated setting ${key} = ${value}`);
        }
    }

    /**
     * Get current settings
     * @returns {Object}
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Get status
     * @returns {Object}
     */
    getStatus() {
        return {
            pendingCount: this.pendingTranscripts.size,
            pendingKeys: [...this.pendingTranscripts.keys()]
        };
    }
}

// Export singleton
export const inputFilter = new InputFilter();
