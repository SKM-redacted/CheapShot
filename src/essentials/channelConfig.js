/**
 * Channel Configuration Manager
 * 
 * Handles loading and caching channel configurations from guild data directories.
 * This replaces the .env-based channel configuration with a per-guild directory structure.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../ai/logger.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to guild data directory
const GUILD_DATA_PATH = path.join(__dirname, '../../data/guild');

// Cache for guild channel configs (reduces file reads)
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
 * Load channel configuration from a guild's channels.json file
 * @param {string} guildId - Discord guild ID
 * @returns {Object|null} Channel configuration or null if not found
 */
function loadChannelConfigFromFile(guildId) {
    try {
        const channelsFile = path.join(GUILD_DATA_PATH, guildId, 'channels.json');

        if (!fs.existsSync(channelsFile)) {
            logger.debug('CHANNEL_CONFIG', `No channels.json found for guild ${guildId}`);
            return null;
        }

        const data = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
        return data;
    } catch (error) {
        logger.error('CHANNEL_CONFIG', `Failed to load channel config for guild ${guildId}: ${error.message}`);
        return null;
    }
}

/**
 * Get channel configuration for a guild (with caching)
 * @param {string} guildId - Discord guild ID
 * @returns {Object|null} Channel configuration or null if not found
 */
function getChannelConfig(guildId) {
    const cached = channelConfigCache.get(guildId);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        return cached.config;
    }

    const config = loadChannelConfigFromFile(guildId);
    channelConfigCache.set(guildId, {
        config,
        timestamp: Date.now()
    });

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
 * Clear the cache for a specific guild (call this when channels.json is updated)
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
