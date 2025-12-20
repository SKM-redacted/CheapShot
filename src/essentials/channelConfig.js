/**
 * Channel Configuration Manager
 * 
 * Handles loading and caching channel configurations from PostgreSQL database.
 * All channel configs are managed via the Dashboard and stored in the database.
 */

import { logger } from '../ai/logger.js';
import db from '../shared/database.js';

// Cache for guild channel configs (reduces database reads)
const channelConfigCache = new Map();
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Channel types that the bot should respond in
 * Note: 'moderation' is intentionally excluded - bot doesn't respond there
 */
const ALLOWED_CHANNEL_TYPES = ['public', 'private'];

/**
 * Channel name to type mapping
 */
const CHANNEL_TYPE_MAP = {
    'cheapshot': 'public',
    'cheapshot-private': 'private',
    'cheapshot-moderation': 'moderation'
};

/**
 * Load channel configuration from database
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object|null>} Channel configuration or null if not found
 */
async function loadChannelConfigFromDatabase(guildId) {
    try {
        const config = await db.getChannelConfig(guildId);
        if (config) {
            logger.debug('CHANNEL_CONFIG', `Loaded config from database for guild ${guildId}`);
        }
        return config;
    } catch (error) {
        logger.error('CHANNEL_CONFIG', `DATABASE ERROR: Failed to load channel config for guild ${guildId}: ${error.message}`);
        // Return null - the caller will handle this as "no config"
        return null;
    }
}

/**
 * Get channel configuration for a guild (with caching)
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object|null>} Channel configuration or null if not found
 */
async function getChannelConfigAsync(guildId) {
    const cached = channelConfigCache.get(guildId);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        return cached.config;
    }

    // Load from database
    const config = await loadChannelConfigFromDatabase(guildId);

    // If database returned null, log error for visibility
    if (!config) {
        logger.warn('CHANNEL_CONFIG', `No channel config found for guild ${guildId} - use the Dashboard to sync channels`);
    }

    channelConfigCache.set(guildId, {
        config,
        timestamp: Date.now()
    });

    return config;
}

/**
 * Refresh the cache from database for a guild
 * Call this after database updates to ensure bot picks up changes
 * @param {string} guildId - Discord guild ID
 */
export async function refreshChannelConfig(guildId) {
    const config = await loadChannelConfigFromDatabase(guildId);
    channelConfigCache.set(guildId, {
        config,
        timestamp: Date.now()
    });
    logger.info('CHANNEL_CONFIG', `Refreshed config for guild ${guildId}`);
    return config;
}

/**
 * Get all allowed channel IDs for a guild (async - reads from database)
 * Returns channels where the bot should respond (public and private, NOT moderation)
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string[]>} Array of channel IDs where the bot should respond
 */
export async function getAllowedChannelIdsAsync(guildId) {
    const config = await getChannelConfigAsync(guildId);

    if (!config || !config.channels) {
        return [];
    }

    const allowedIds = [];

    for (const [channelName, channelData] of Object.entries(config.channels)) {
        let channelType = channelData.type || CHANNEL_TYPE_MAP[channelName] || 'unknown';

        if (ALLOWED_CHANNEL_TYPES.includes(channelType)) {
            if (channelData.id) {
                allowedIds.push(channelData.id);
            }
        }
    }

    logger.debug('CHANNEL_CONFIG', `Guild ${guildId}: Allowed channels: ${allowedIds.join(', ') || 'none'}`);
    return allowedIds;
}

/**
 * Check if a channel is allowed for bot responses in a specific guild (async)
 * If no channels are configured, auto-detect channels named "cheapshot"
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - Discord channel ID to check
 * @param {Object} channel - Optional Discord channel object (for auto-detection)
 * @returns {Promise<boolean>} True if the bot should respond in this channel
 */
export async function isChannelAllowedAsync(guildId, channelId, channel = null) {
    const allowedIds = await getAllowedChannelIdsAsync(guildId);

    // If channels are configured, check against the list
    if (allowedIds.length > 0) {
        return allowedIds.includes(channelId);
    }

    // No channels configured - fallback to auto-detect "cheapshot" channels
    // This is the default behavior for new servers with AI enabled
    if (channel && channel.name) {
        const channelName = channel.name.toLowerCase();
        // Match channels named cheapshot, cheapshot-private, etc.
        if (channelName.includes('cheapshot')) {
            logger.debug('CHANNEL_CONFIG', `Guild ${guildId}: No config, auto-detected channel "${channel.name}" as CheapShot channel`);
            return true;
        }
    }

    logger.debug('CHANNEL_CONFIG', `Guild ${guildId}: No channels configured and channel not named cheapshot, skipping`);
    return false;
}

/**
 * Get a specific channel ID by type for a guild (async)
 * @param {string} guildId - Discord guild ID
 * @param {string} type - Channel type ('public', 'private', 'moderation')
 * @returns {Promise<string|null>} Channel ID or null if not found
 */
export async function getChannelIdByTypeAsync(guildId, type) {
    const config = await getChannelConfigAsync(guildId);

    if (!config || !config.channels) {
        return null;
    }

    for (const [channelName, channelData] of Object.entries(config.channels)) {
        const channelType = channelData.type || CHANNEL_TYPE_MAP[channelName] || 'unknown';
        if (channelType === type && channelData.id) {
            return channelData.id;
        }
    }

    return null;
}

/**
 * Get the moderation channel ID for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>} Moderation channel ID or null if not found
 */
export async function getModerationChannelId(guildId) {
    return await getChannelIdByTypeAsync(guildId, 'moderation');
}

/**
 * Get the public channel ID for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>} Public channel ID or null if not found
 */
export async function getPublicChannelId(guildId) {
    return await getChannelIdByTypeAsync(guildId, 'public');
}

/**
 * Get the private channel ID for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>} Private channel ID or null if not found
 */
export async function getPrivateChannelId(guildId) {
    return await getChannelIdByTypeAsync(guildId, 'private');
}

/**
 * Clear the cache for a specific guild (call this when config is updated)
 * @param {string} guildId - Discord guild ID
 */
export function clearChannelCache(guildId) {
    channelConfigCache.delete(guildId);
    logger.debug('CHANNEL_CONFIG', `Cleared channel cache for guild ${guildId}`);
}

/**
 * Clear all cached channel configurations
 */
export function clearAllChannelCache() {
    channelConfigCache.clear();
    logger.debug('CHANNEL_CONFIG', 'Cleared all channel cache');
}

/**
 * Initialize - preload configs from database on startup
 * This warms the cache for faster lookups
 */
export async function initializeChannelConfigs(guildIds) {
    logger.info('CHANNEL_CONFIG', `Initializing channel configs for ${guildIds.length} guilds...`);

    for (const guildId of guildIds) {
        await getChannelConfigAsync(guildId);
    }

    logger.info('CHANNEL_CONFIG', 'Channel config initialization complete');
}
