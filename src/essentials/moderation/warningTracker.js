/**
 * Warning Tracker
 * 
 * Tracks warnings per user per guild.
 * Auto-escalates to timeout after threshold.
 */

import { logger } from '../../ai/logger.js';
import { MODERATION_CONFIG } from './constants.js';

// Warning storage: Map<guildId, Map<userId, {count, timestamps[], reasons[]}>>
const warningStore = new Map();

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
 * Clean up expired warnings
 */
function cleanOldWarnings(userData) {
    const cutoff = Date.now() - (MODERATION_CONFIG.WARNING_DECAY_HOURS * 60 * 60 * 1000);
    userData.timestamps = userData.timestamps.filter(t => t > cutoff);
    userData.count = userData.timestamps.length;
    return userData;
}

/**
 * Add a warning for a user
 * @returns {{count, shouldTimeout, isFirst, threshold}}
 */
export function addWarning(guildId, userId, reason = '') {
    const guildWarnings = getGuildWarnings(guildId);

    let userData = guildWarnings.get(userId) || { count: 0, timestamps: [], reasons: [] };
    userData = cleanOldWarnings(userData);

    userData.timestamps.push(Date.now());
    userData.reasons.push(reason);
    userData.count = userData.timestamps.length;

    guildWarnings.set(userId, userData);

    logger.debug('MODERATION', `Warning: user ${userId}, count: ${userData.count}/${MODERATION_CONFIG.WARNING_THRESHOLD}`);

    return {
        count: userData.count,
        shouldTimeout: userData.count >= MODERATION_CONFIG.WARNING_THRESHOLD,
        isFirst: userData.count === 1,
        threshold: MODERATION_CONFIG.WARNING_THRESHOLD
    };
}

/**
 * Get warning count for a user
 */
export function getWarningCount(guildId, userId) {
    const guildWarnings = getGuildWarnings(guildId);
    let userData = guildWarnings.get(userId);

    if (!userData) return 0;

    userData = cleanOldWarnings(userData);
    guildWarnings.set(userId, userData);

    return userData.count;
}

/**
 * Clear warnings for a user
 */
export function clearWarnings(guildId, userId) {
    const guildWarnings = getGuildWarnings(guildId);
    guildWarnings.delete(userId);
    logger.debug('MODERATION', `Warnings cleared: user ${userId}`);
}

/**
 * Get all warning info for a user
 */
export function getUserWarnings(guildId, userId) {
    const guildWarnings = getGuildWarnings(guildId);
    let userData = guildWarnings.get(userId);

    if (!userData) {
        return { count: 0, reasons: [], timestamps: [] };
    }

    userData = cleanOldWarnings(userData);
    guildWarnings.set(userId, userData);

    return {
        count: userData.count,
        reasons: userData.reasons.slice(-MODERATION_CONFIG.WARNING_THRESHOLD),
        timestamps: userData.timestamps
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
