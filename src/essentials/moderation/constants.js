/**
 * Moderation Constants
 * 
 * Action types, severity levels, and configuration values.
 */

/**
 * Action types that can be recommended
 */
export const ACTION_TYPES = {
    NONE: 'none',
    WARN: 'warn',
    DELETE: 'delete',
    TIMEOUT_SHORT: 'timeout_short',
    TIMEOUT_MEDIUM: 'timeout_medium',
    TIMEOUT_LONG: 'timeout_long',
    DELETE_HISTORY: 'delete_history'
};

/**
 * Severity levels (0-4)
 */
export const SEVERITY = {
    NONE: 0,      // No violation
    LOW: 1,       // Minor issue
    MEDIUM: 2,    // Warning needed
    HIGH: 3,      // Warning + delete
    SEVERE: 4     // Warning + delete + timeout
};

/**
 * Moderation configuration
 */
export const MODERATION_CONFIG = {
    // Warning system
    WARNING_THRESHOLD: 3,
    WARNING_DECAY_HOURS: 24,

    // Message limits
    MAX_DELETE_COUNT: 100,

    // AI settings
    MAX_TOKENS: 200,

    // Cache settings
    RULES_CACHE_MINUTES: 30,

    // Mod log channel (leave blank to disable, set to channel ID to enable)
    MOD_LOG_CHANNEL_ID: ''
};

/**
 * Get timeout duration in milliseconds
 * @param {string} action - Timeout action type
 * @returns {number} Duration in ms
 */
export function getTimeoutDuration(action) {
    switch (action) {
        case ACTION_TYPES.TIMEOUT_SHORT:
            return 5 * 60 * 1000; // 5 min
        case ACTION_TYPES.TIMEOUT_MEDIUM:
            return 60 * 60 * 1000; // 1 hour
        case ACTION_TYPES.TIMEOUT_LONG:
            return 24 * 60 * 60 * 1000; // 24 hours
        default:
            return 0;
    }
}

/**
 * Get human-readable timeout string
 * @param {string} action - Timeout action type
 * @returns {string}
 */
export function getTimeoutDurationString(action) {
    switch (action) {
        case ACTION_TYPES.TIMEOUT_SHORT:
            return '5 minutes';
        case ACTION_TYPES.TIMEOUT_MEDIUM:
            return '1 hour';
        case ACTION_TYPES.TIMEOUT_LONG:
            return '24 hours';
        default:
            return 'unknown';
    }
}
