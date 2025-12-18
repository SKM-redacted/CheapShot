/**
 * Warning Tracker
 * 
 * Tracks warnings per user per guild with unique IDs.
 * Each warning has a unique ID so it can be pardoned individually.
 * Auto-escalates to timeout after threshold.
 */

import { logger } from '../../ai/logger.js';
import { MODERATION_CONFIG } from './constants.js';

// Warning storage: Map<guildId, Map<warningId, WarningData>>
// WarningData: { id, guildId visually, userId, reason, timestamp, messageId, channelId }
const warningStore = new Map();

// Counter for generating unique warning IDs per guild
const warningIdCounter = new Map();

/**
 * Generate a unique warning ID for a guild
 * Format: WRN-{timestamp}-{counter}
 */
function generateWarningId(guildId) {
    const counter = (warningIdCounter.get(guildId) || 0) + 1;
    warningIdCounter.set(guildId, counter);
    return `WRN-${Date.now().toString(36)}-${counter}`;
}

/**
 * Get or create guild warning map
 */
function getGuildWarnings(guildId) {
    if (!warningStore.has(guildId)) {
        warningStore.set(guildId, new Map());
    }
    return warningStore.get(guildId);
}

/**
 * Get all active (non-expired) warnings for a user in a guild
 */
function getActiveWarningsForUser(guildId, userId) {
    const guildWarnings = getGuildWarnings(guildId);
    const cutoff = Date.now() - (MODERATION_CONFIG.WARNING_DECAY_HOURS * 60 * 60 * 1000);

    const activeWarnings = [];
    for (const [id, warning] of guildWarnings) {
        if (warning.userId === userId && warning.timestamp > cutoff) {
            activeWarnings.push(warning);
        }
    }

    return activeWarnings;
}

/**
 * Clean up expired warnings for all users in a guild
 */
function cleanOldWarnings(guildId) {
    const guildWarnings = getGuildWarnings(guildId);
    const cutoff = Date.now() - (MODERATION_CONFIG.WARNING_DECAY_HOURS * 60 * 60 * 1000);

    for (const [id, warning] of guildWarnings) {
        if (warning.timestamp < cutoff) {
            guildWarnings.delete(id);
        }
    }
}

/**
 * Add a warning for a user
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} reason - Reason for the warning
 * @param {string} messageId - Optional: ID of the offending message
 * @param {string} channelId - Optional: ID of the channel
 * @returns {{id, count, shouldTimeout, isFirst, threshold}}
 */
export function addWarning(guildId, userId, reason = '', messageId = null, channelId = null) {
    const guildWarnings = getGuildWarnings(guildId);

    // Clean old warnings first
    cleanOldWarnings(guildId);

    // Generate unique ID for this warning
    const warningId = generateWarningId(guildId);

    // Create warning record
    const warning = {
        id: warningId,
        guildId,
        userId,
        reason,
        timestamp: Date.now(),
        messageId,
        channelId
    };

    // Store the warning
    guildWarnings.set(warningId, warning);

    // Get current count for user
    const activeWarnings = getActiveWarningsForUser(guildId, userId);
    const count = activeWarnings.length;

    logger.debug('MODERATION', `Warning ${warningId}: user ${userId}, count: ${count}/${MODERATION_CONFIG.WARNING_THRESHOLD}`);

    return {
        id: warningId,
        count,
        shouldTimeout: count >= MODERATION_CONFIG.WARNING_THRESHOLD,
        isFirst: count === 1,
        threshold: MODERATION_CONFIG.WARNING_THRESHOLD
    };
}

/**
 * Remove a specific warning by ID
 * @param {string} guildId - Guild ID
 * @param {string} warningId - Warning ID to remove
 * @returns {boolean} True if warning was found and removed
 */
export function removeWarning(guildId, warningId) {
    const guildWarnings = getGuildWarnings(guildId);

    if (guildWarnings.has(warningId)) {
        const warning = guildWarnings.get(warningId);
        guildWarnings.delete(warningId);
        logger.debug('MODERATION', `Warning ${warningId} removed for user ${warning.userId}`);
        return true;
    }

    logger.debug('MODERATION', `Warning ${warningId} not found in guild ${guildId}`);
    return false;
}

/**
 * Get a specific warning by ID
 * @param {string} guildId - Guild ID
 * @param {string} warningId - Warning ID
 * @returns {Object|null} Warning data or null if not found
 */
export function getWarning(guildId, warningId) {
    const guildWarnings = getGuildWarnings(guildId);
    return guildWarnings.get(warningId) || null;
}

/**
 * Get warning count for a user
 */
export function getWarningCount(guildId, userId) {
    cleanOldWarnings(guildId);
    const activeWarnings = getActiveWarningsForUser(guildId, userId);
    return activeWarnings.length;
}

/**
 * Clear ALL warnings for a user (use sparingly)
 */
export function clearWarnings(guildId, userId) {
    const guildWarnings = getGuildWarnings(guildId);

    let cleared = 0;
    for (const [id, warning] of guildWarnings) {
        if (warning.userId === userId) {
            guildWarnings.delete(id);
            cleared++;
        }
    }

    logger.debug('MODERATION', `Cleared ${cleared} warnings for user ${userId}`);
    return cleared;
}

/**
 * Get all warning info for a user
 */
export function getUserWarnings(guildId, userId) {
    cleanOldWarnings(guildId);
    const activeWarnings = getActiveWarningsForUser(guildId, userId);

    // Sort by timestamp (newest first)
    activeWarnings.sort((a, b) => b.timestamp - a.timestamp);

    return {
        count: activeWarnings.length,
        warnings: activeWarnings,
        reasons: activeWarnings.map(w => w.reason),
        timestamps: activeWarnings.map(w => w.timestamp)
    };
}

/**
 * Get threshold value
 */
export function getWarningThreshold() {
    return MODERATION_CONFIG.WARNING_THRESHOLD;
}

/**
 * Get decay hours value
 */
export function getWarningDecayHours() {
    return MODERATION_CONFIG.WARNING_DECAY_HOURS;
}
