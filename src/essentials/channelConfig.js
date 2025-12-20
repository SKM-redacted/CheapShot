/**
 * Channel Configuration Manager
 * 
 * Handles loading and caching channel configurations from PostgreSQL database.
 * Falls back to JSON files for backwards compatibility.
 * 
 * The database is the primary source (set via Dashboard), 
 * JSON files are secondary (for guilds set up before database integration).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../ai/logger.js';
import db from '../shared/database.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to guild data directory (legacy fallback)
const GUILD_DATA_PATH = path.join(__dirname, '../../data/guild');

// Cache for guild channel configs (reduces database/file reads)
const channelConfigCache = new Map();
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Channel types that the bot should respond in
 * Note: 'moderation' is intentionally excluded - bot doesn't respond there
 */
const ALLOWED_CHANNEL_TYPES = ['public', 'private'];

/**
 * Channel name to type mapping (for backwards compatibility with existing channels.json)
 */
const CHANNEL_TYPE_MAP = {
    'cheapshot': 'public',
    'cheapshot-private': 'private',
    'cheapshot-moderation': 'moderation'
};

/**
 * Load channel configuration from legacy JSON file
 * @param {string} guildId - Discord guild ID
 * @returns {Object|null} Channel configuration or null if not found
 */
function loadChannelConfigFromFile(guildId) {
    try {
        const channelsFile = path.join(GUILD_DATA_PATH, guildId, 'channels.json');

        if (!fs.existsSync(channelsFile)) {
            return null;
        }

        const data = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
        logger.debug('CHANNEL_CONFIG', `Loaded config from file for guild ${guildId}`);
        return data;
    } catch (error) {
        logger.error('CHANNEL_CONFIG', `Failed to load channel config from file for guild ${guildId}: ${error.message}`);
        return null;
    }
}

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
        logger.error('CHANNEL_CONFIG', `Failed to load channel config from database for guild ${guildId}: ${error.message}`);
        return null;
    }
}

/**
 * Get channel configuration for a guild (with caching)
 * Tries database first, falls back to JSON file
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object|null>} Channel configuration or null if not found
 */
async function getChannelConfigAsync(guildId) {
    const cached = channelConfigCache.get(guildId);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        return cached.config;
    }

    // Try database first (primary source)
    let config = await loadChannelConfigFromDatabase(guildId);

    // Fall back to file if not in database
    if (!config) {
        config = loadChannelConfigFromFile(guildId);
    }

    channelConfigCache.set(guildId, {
        config,
        timestamp: Date.now()
    });

    return config;
}

/**
 * Synchronous version for backwards compatibility
 * Uses cached value or file fallback (can't await in sync context)
 */
function getChannelConfig(guildId) {
    const cached = channelConfigCache.get(guildId);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        return cached.config;
    }

    // Sync fallback - only file-based
    const config = loadChannelConfigFromFile(guildId);
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
 * Get all allowed channel IDs for a guild
 * Returns channels where the bot should respond (public and private, NOT moderation)
 * @param {string} guildId - Discord guild ID
 * @returns {string[]} Array of channel IDs where the bot should respond
 */
export function getAllowedChannelIds(guildId) {
    const config = getChannelConfig(guildId);

    if (!config || !config.channels) {
        return []; // No config = respond in no channels (fallback to mention-only mode)
    }

    const allowedIds = [];

    // Iterate through all channels in the config
    for (const [channelName, channelData] of Object.entries(config.channels)) {
        // Determine the channel type
        let channelType = channelData.type || CHANNEL_TYPE_MAP[channelName] || 'unknown';

        // If it's an allowed type (public or private), add it
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
 * Async version of getAllowedChannelIds - checks database first
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string[]>} Array of channel IDs
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

    logger.debug('CHANNEL_CONFIG', `Guild ${guildId}: Allowed channels (async): ${allowedIds.join(', ') || 'none'}`);
    return allowedIds;
}

/**
 * Check if a channel is allowed for bot responses in a specific guild
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - Discord channel ID to check
 * @returns {boolean} True if the bot should respond in this channel
 */
export function isChannelAllowed(guildId, channelId) {
    const allowedIds = getAllowedChannelIds(guildId);

    // If no allowed channels are configured, default to not responding
    // (This means the guild hasn't been set up yet - bot will only respond to mentions)
    if (allowedIds.length === 0) {
        return false;
    }

    return allowedIds.includes(channelId);
}

/**
 * Async version - checks database first
 */
export async function isChannelAllowedAsync(guildId, channelId) {
    const allowedIds = await getAllowedChannelIdsAsync(guildId);

    if (allowedIds.length === 0) {
        return false;
    }

    return allowedIds.includes(channelId);
}

/**
 * Get a specific channel ID by type for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} type - Channel type ('public', 'private', 'moderation')
 * @returns {string|null} Channel ID or null if not found
 */
export function getChannelIdByType(guildId, type) {
    const config = getChannelConfig(guildId);

    if (!config || !config.channels) {
        return null;
    }

    // First, check for a channel with the explicit type
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
 * @returns {string|null} Moderation channel ID or null if not found
 */
export function getModerationChannelId(guildId) {
    return getChannelIdByType(guildId, 'moderation');
}

/**
 * Get the public channel ID for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {string|null} Public channel ID or null if not found
 */
export function getPublicChannelId(guildId) {
    return getChannelIdByType(guildId, 'public');
}

/**
 * Get the private channel ID for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {string|null} Private channel ID or null if not found
 */
export function getPrivateChannelId(guildId) {
    return getChannelIdByType(guildId, 'private');
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
 * This warms the cache so sync functions work immediately
 */
export async function initializeChannelConfigs(guildIds) {
    logger.info('CHANNEL_CONFIG', `Initializing channel configs for ${guildIds.length} guilds...`);

    for (const guildId of guildIds) {
        await getChannelConfigAsync(guildId);
    }

    logger.info('CHANNEL_CONFIG', 'Channel config initialization complete');
}
