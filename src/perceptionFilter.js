import { logger } from './logger.js';

/**
 * Perception Filter - Smart yes/no gate for responses
 * Prevents spam/bombardment when errors occur or responses go haywire
 * NO AI involved - just pattern matching, rate limiting, and session tracking
 * 
 * KEY CONCEPT: Tracks "response sessions" - multiple sentences from one AI response
 * are allowed to flow rapidly. Burst protection only triggers for multiple SEPARATE
 * AI invocations happening in rapid succession.
 */
class PerceptionFilter {
    constructor() {
        // Rate limiting - track recent responses per guild
        this.recentResponses = new Map(); // guildId -> { lastMessages: string[], lastTime: number }

        // Response sessions - tracks ongoing responses to avoid false burst detection
        this.activeSessions = new Map(); // guildId -> { sessionId: number, sentenceCount: number, startTime: number, lastSentenceTime: number }

        // Global settings
        this.enabled = true;
        this.settings = {
            // Minimum characters for a response to be valid
            minLength: 2,

            // Maximum characters (prevent runaway responses)
            maxLength: 2000,

            // Minimum words for a fragment to be speakable (avoid "I need a..." style cutoffs)
            minWords: 2,

            // Rate limiting (for SEPARATE responses, not sentences within a response)
            duplicateThreshold: 0.85, // How similar messages must be to count as duplicate
            recentHistorySize: 10,    // How many recent messages to track

            // Cooldown after a burst of SEPARATE responses (ms)
            burstCooldownMs: 5000,
            burstThreshold: 4,        // Trigger cooldown after this many SEPARATE responses

            // Time window for burst detection (ms) - only counts new response sessions
            burstWindowMs: 10000,

            // Max sentences allowed per single response session
            maxSentencesPerSession: 15,

            // Session timeout - if no sentence for this long, session is considered ended (ms)
            sessionTimeoutMs: 10000
        };

        // Blocked patterns (regex) - things that indicate errors or garbage
        this.blockedPatterns = [
            /^error:/i,
            /^exception:/i,
            /^undefined$/i,
            /^null$/i,
            /^\[object Object\]$/i,
            /^NaN$/i,
            /^API (request|call) failed/i,
            /^failed to/i,
            /^cannot read propert/i,
            /^\s*$/,                 // Empty or whitespace only
        ];

        // Fragment patterns - incomplete sentences that shouldn't be spoken alone
        this.fragmentPatterns = [
            /^(I|we|you|he|she|it|they)\s+(need|want|have|am|is|are|was|were)\s+(a|an|the)?\s*$/i,  // "I need a..."
            /^(and|but|or|so|because|if|when|while|although)\s*$/i,  // Trailing conjunctions
            /^(the|a|an)\s*$/i,  // Just an article
            /^\w+\s*$/i,  // Single word (might be ok sometimes, but risky)
        ];

        // Track burst timing - only for NEW response sessions
        this.burstTracking = new Map(); // guildId -> { sessionTimestamps: number[], coolingDown: boolean }
    }

    /**
     * Start a new response session - call this before streaming a new AI response
     * @param {string} guildId - Guild ID
     * @returns {number} Session ID
     */
    startSession(guildId) {
        const sessionId = Date.now();
        this.activeSessions.set(guildId, {
            sessionId,
            sentenceCount: 0,
            startTime: Date.now(),
            lastSentenceTime: Date.now()
        });

        // Track this session start for burst detection
        this.trackSessionStart(guildId);

        logger.debug('FILTER', `Started response session ${sessionId} for guild ${guildId}`);
        return sessionId;
    }

    /**
     * End a response session
     * @param {string} guildId - Guild ID
     */
    endSession(guildId) {
        const session = this.activeSessions.get(guildId);
        if (session) {
            logger.debug('FILTER', `Ended session ${session.sessionId} with ${session.sentenceCount} sentences`);
            this.activeSessions.delete(guildId);
        }
    }

    /**
     * Track a new session start for burst detection
     * @param {string} guildId - Guild ID
     */
    trackSessionStart(guildId) {
        const now = Date.now();
        let burst = this.burstTracking.get(guildId);

        if (!burst) {
            burst = { sessionTimestamps: [], coolingDown: false, cooldownEnd: 0 };
            this.burstTracking.set(guildId, burst);
        }

        // Clean old session timestamps
        burst.sessionTimestamps = burst.sessionTimestamps.filter(t => now - t < this.settings.burstWindowMs);

        // Add this session
        burst.sessionTimestamps.push(now);
    }

    /**
     * Main filter function - returns true if response should be spoken, false to block
     * @param {string} guildId - Guild ID
     * @param {string} response - The response text to evaluate
     * @param {Object} context - Optional context (userId, etc.)
     * @returns {{allowed: boolean, reason: string}} Filter result
     */
    filter(guildId, response, context = {}) {
        if (!this.enabled) {
            return { allowed: true, reason: 'filter disabled' };
        }

        // Basic validation
        if (!response || typeof response !== 'string') {
            logger.debug('FILTER', 'Blocked: null/undefined response');
            return { allowed: false, reason: 'null response' };
        }

        const trimmed = response.trim();

        // Length checks
        if (trimmed.length < this.settings.minLength) {
            logger.debug('FILTER', `Blocked: too short (${trimmed.length} chars)`);
            return { allowed: false, reason: 'too short' };
        }

        if (trimmed.length > this.settings.maxLength) {
            logger.debug('FILTER', `Blocked: too long (${trimmed.length} chars)`);
            return { allowed: false, reason: 'too long' };
        }

        // Word count check - catch fragments
        const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount < this.settings.minWords) {
            logger.debug('FILTER', `Blocked: too few words (${wordCount})`);
            return { allowed: false, reason: 'too few words' };
        }

        // Check blocked patterns
        for (const pattern of this.blockedPatterns) {
            if (pattern.test(trimmed)) {
                logger.debug('FILTER', `Blocked: matched blocked pattern ${pattern}`);
                return { allowed: false, reason: 'blocked pattern' };
            }
        }

        // Check fragment patterns (incomplete sentences)
        for (const pattern of this.fragmentPatterns) {
            if (pattern.test(trimmed)) {
                logger.debug('FILTER', `Blocked: looks like fragment "${trimmed}"`);
                return { allowed: false, reason: 'incomplete fragment' };
            }
        }

        // Get or check session
        let session = this.activeSessions.get(guildId);

        // Auto-start session if none exists (fallback)
        if (!session) {
            this.startSession(guildId);
            session = this.activeSessions.get(guildId);
        }

        // Check if session timed out
        const now = Date.now();
        if (session && now - session.lastSentenceTime > this.settings.sessionTimeoutMs) {
            // Session timed out - this is effectively a new response
            this.endSession(guildId);
            this.startSession(guildId);
            session = this.activeSessions.get(guildId);
        }

        // Check burst protection (only triggers for multiple SESSIONS, not sentences)
        const burstResult = this.checkBurst(guildId);
        if (!burstResult.allowed) {
            logger.debug('FILTER', `Blocked: ${burstResult.reason}`);
            return burstResult;
        }

        // Check session sentence limit
        if (session.sentenceCount >= this.settings.maxSentencesPerSession) {
            logger.debug('FILTER', `Blocked: too many sentences in session (${session.sentenceCount})`);
            return { allowed: false, reason: 'session sentence limit reached' };
        }

        // Duplicate detection (across sessions)
        const duplicateResult = this.checkDuplicate(guildId, trimmed);
        if (!duplicateResult.allowed) {
            logger.debug('FILTER', `Blocked: ${duplicateResult.reason}`);
            return duplicateResult;
        }

        // Update session
        session.sentenceCount++;
        session.lastSentenceTime = now;

        // Track this response for duplicate detection
        this.trackResponse(guildId, trimmed);

        logger.debug('FILTER', `Allowed (session ${session.sessionId}, sentence ${session.sentenceCount}): "${trimmed.substring(0, 40)}..."`);
        return { allowed: true, reason: 'passed all checks' };
    }

    /**
     * Check for burst/spam behavior - only at SESSION level
     * @param {string} guildId - Guild ID
     * @returns {{allowed: boolean, reason: string}}
     */
    checkBurst(guildId) {
        const now = Date.now();
        let burst = this.burstTracking.get(guildId);

        if (!burst) {
            return { allowed: true, reason: 'no burst tracking' };
        }

        // Check if still in cooldown
        if (burst.coolingDown && now < burst.cooldownEnd) {
            const remaining = Math.ceil((burst.cooldownEnd - now) / 1000);
            return { allowed: false, reason: `response burst cooldown (${remaining}s remaining)` };
        } else if (burst.coolingDown) {
            // Cooldown ended
            burst.coolingDown = false;
            burst.sessionTimestamps = [];
        }

        // Check burst threshold (number of SESSIONS, not sentences)
        if (burst.sessionTimestamps.length >= this.settings.burstThreshold) {
            burst.coolingDown = true;
            burst.cooldownEnd = now + this.settings.burstCooldownMs;
            logger.warn('FILTER', `Response burst detected in guild ${guildId} (${burst.sessionTimestamps.length} responses in ${this.settings.burstWindowMs}ms), cooling down for ${this.settings.burstCooldownMs}ms`);
            return { allowed: false, reason: 'too many rapid responses' };
        }

        return { allowed: true, reason: 'no burst' };
    }

    /**
     * Check if response is a duplicate of recent responses
     * @param {string} guildId - Guild ID
     * @param {string} response - Response text
     * @returns {{allowed: boolean, reason: string}}
     */
    checkDuplicate(guildId, response) {
        const recent = this.recentResponses.get(guildId);
        if (!recent || recent.lastMessages.length === 0) {
            return { allowed: true, reason: 'no history' };
        }

        const normalized = response.toLowerCase().trim();

        for (const prev of recent.lastMessages) {
            const similarity = this.calculateSimilarity(normalized, prev.toLowerCase());
            if (similarity >= this.settings.duplicateThreshold) {
                return { allowed: false, reason: `duplicate (${Math.round(similarity * 100)}% similar)` };
            }
        }

        return { allowed: true, reason: 'not duplicate' };
    }

    /**
     * Calculate similarity between two strings (simple Jaccard similarity on words)
     * @param {string} a - First string
     * @param {string} b - Second string
     * @returns {number} Similarity from 0 to 1
     */
    calculateSimilarity(a, b) {
        if (a === b) return 1;
        if (!a || !b) return 0;

        const wordsA = new Set(a.split(/\s+/));
        const wordsB = new Set(b.split(/\s+/));

        const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
        const union = new Set([...wordsA, ...wordsB]);

        return intersection.size / union.size;
    }

    /**
     * Track a response for future duplicate detection
     * @param {string} guildId - Guild ID
     * @param {string} response - Response text
     */
    trackResponse(guildId, response) {
        let recent = this.recentResponses.get(guildId);
        if (!recent) {
            recent = { lastMessages: [], lastTime: Date.now() };
            this.recentResponses.set(guildId, recent);
        }

        recent.lastMessages.push(response);
        recent.lastTime = Date.now();

        // Keep only recent history
        if (recent.lastMessages.length > this.settings.recentHistorySize) {
            recent.lastMessages.shift();
        }
    }

    /**
     * Add a custom blocked pattern
     * @param {RegExp|string} pattern - Pattern to block
     */
    addBlockedPattern(pattern) {
        if (typeof pattern === 'string') {
            pattern = new RegExp(pattern, 'i');
        }
        this.blockedPatterns.push(pattern);
        logger.info('FILTER', `Added blocked pattern: ${pattern}`);
    }

    /**
     * Add a custom fragment pattern
     * @param {RegExp|string} pattern - Pattern to detect fragments
     */
    addFragmentPattern(pattern) {
        if (typeof pattern === 'string') {
            pattern = new RegExp(pattern, 'i');
        }
        this.fragmentPatterns.push(pattern);
        logger.info('FILTER', `Added fragment pattern: ${pattern}`);
    }

    /**
     * Remove a blocked pattern
     * @param {RegExp|string} pattern - Pattern to remove
     */
    removeBlockedPattern(pattern) {
        const patternStr = pattern.toString();
        this.blockedPatterns = this.blockedPatterns.filter(p => p.toString() !== patternStr);
    }

    /**
     * Clear history for a guild (call on disconnect, etc.)
     * @param {string} guildId - Guild ID
     */
    clearHistory(guildId) {
        this.recentResponses.delete(guildId);
        this.burstTracking.delete(guildId);
        this.activeSessions.delete(guildId);
        logger.debug('FILTER', `Cleared history for guild ${guildId}`);
    }

    /**
     * Reset cooldown for a guild (manual override)
     * @param {string} guildId - Guild ID
     */
    resetCooldown(guildId) {
        const burst = this.burstTracking.get(guildId);
        if (burst) {
            burst.coolingDown = false;
            burst.sessionTimestamps = [];
            logger.info('FILTER', `Reset cooldown for guild ${guildId}`);
        }
    }

    /**
     * Enable or disable the filter globally
     * @param {boolean} enabled - Whether filter is enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        logger.info('FILTER', `Filter ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Update a specific setting
     * @param {string} key - Setting key
     * @param {*} value - Setting value
     */
    setSetting(key, value) {
        if (key in this.settings) {
            this.settings[key] = value;
            logger.info('FILTER', `Updated setting ${key} = ${value}`);
        }
    }

    /**
     * Get current settings
     * @returns {Object}
     */
    getSettings() {
        return { ...this.settings, enabled: this.enabled };
    }

    /**
     * Get status for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object}
     */
    getStatus(guildId) {
        const recent = this.recentResponses.get(guildId);
        const burst = this.burstTracking.get(guildId);
        const session = this.activeSessions.get(guildId);

        return {
            enabled: this.enabled,
            recentMessageCount: recent?.lastMessages?.length || 0,
            coolingDown: burst?.coolingDown || false,
            cooldownRemaining: burst?.coolingDown ? Math.max(0, burst.cooldownEnd - Date.now()) : 0,
            recentSessionCount: burst?.sessionTimestamps?.length || 0,
            activeSession: session ? {
                id: session.sessionId,
                sentenceCount: session.sentenceCount,
                ageMs: Date.now() - session.startTime
            } : null
        };
    }
}

// Export singleton
export const perceptionFilter = new PerceptionFilter();
