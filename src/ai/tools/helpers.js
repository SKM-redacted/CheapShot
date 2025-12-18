/**
 * Discord Tools - Shared Helper Functions
 * 
 * This file contains utility functions used across multiple tool handlers.
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../logger.js';

// ============================================================
// COLOR UTILITIES
// ============================================================

/**
 * Color name to hex code mapping
 */
export const COLOR_MAP = {
    'red': 0xE74C3C,
    'blue': 0x3498DB,
    'green': 0x2ECC71,
    'purple': 0x9B59B6,
    'orange': 0xE67E22,
    'yellow': 0xF1C40F,
    'pink': 0xE91E63,
    'cyan': 0x00BCD4,
    'gold': 0xFFD700,
    'navy': 0x001F3F,
    'teal': 0x008080,
    'lime': 0x00FF00,
    'coral': 0xFF7F50,
    'crimson': 0xDC143C,
    'indigo': 0x4B0082,
    'violet': 0xEE82EE,
    'salmon': 0xFA8072,
    'magenta': 0xFF00FF,
    'aqua': 0x00FFFF,
    'maroon': 0x800000,
    'white': 0xFFFFFF,
    'black': 0x000000,
    'gray': 0x808080,
    'grey': 0x808080,
    'silver': 0xC0C0C0,
    'bronze': 0xCD7F32,
    'default': 0x000000
};

/**
 * Parse a color string into a Discord.js compatible color value
 * @param {string} colorInput - Hex code or color name
 * @returns {number|null} Color as a number, or null if invalid
 */
export function parseColor(colorInput) {
    if (!colorInput) return null;

    const lowerColor = colorInput.toLowerCase().trim();

    // Check if it's a named color
    if (COLOR_MAP[lowerColor] !== undefined) {
        return COLOR_MAP[lowerColor];
    }

    // Try to parse as hex code
    let hexStr = lowerColor.replace('#', '').replace('0x', '');

    // Validate hex format (3 or 6 characters)
    if (/^[0-9a-f]{6}$/i.test(hexStr)) {
        return parseInt(hexStr, 16);
    }
    if (/^[0-9a-f]{3}$/i.test(hexStr)) {
        // Expand 3-char hex to 6-char
        hexStr = hexStr.split('').map(c => c + c).join('');
        return parseInt(hexStr, 16);
    }

    return null;
}

// ============================================================
// PERMISSION UTILITIES
// ============================================================

/**
 * Parse permission names into PermissionFlagsBits values
 * @param {string[]} permissionNames - Array of permission names
 * @returns {{valid: bigint[], invalid: string[]}} Valid permission bits and invalid names
 */
export function parsePermissions(permissionNames) {
    const valid = [];
    const invalid = [];

    for (const name of permissionNames) {
        // Try exact match first
        if (PermissionFlagsBits[name] !== undefined) {
            valid.push(PermissionFlagsBits[name]);
            continue;
        }

        // Try case-insensitive match
        const matchKey = Object.keys(PermissionFlagsBits).find(
            key => key.toLowerCase() === name.toLowerCase()
        );

        if (matchKey) {
            valid.push(PermissionFlagsBits[matchKey]);
        } else {
            invalid.push(name);
        }
    }

    return { valid, invalid };
}

/**
 * Helper function to get permission name from PermissionFlagsBits value
 * @param {bigint} permissionBit - The permission flag bit
 * @returns {string} The permission name
 */
export function getPermissionName(permissionBit) {
    for (const [name, value] of Object.entries(PermissionFlagsBits)) {
        if (value === permissionBit) return name;
    }
    return 'Unknown';
}

/**
 * Build permission overwrites array for a channel based on configuration
 * @param {Object} guild - Discord guild object
 * @param {Object} config - Channel config { private, role_access, read_only, read_only_except }
 * @param {string} channelType - 'text', 'voice', or 'category'
 * @returns {Array} Array of permission overwrites for Discord API
 */
export function buildPermissionOverwrites(guild, config, channelType = 'text') {
    const overwrites = [];
    const { private: isPrivate, role_access = [], read_only, read_only_except = [] } = config;

    // If channel is private, deny @everyone view access
    if (isPrivate) {
        overwrites.push({
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
        });

        // Grant access to specified roles
        for (const roleName of role_access) {
            const role = guild.roles.cache.find(r =>
                r.name.toLowerCase() === roleName.toLowerCase() ||
                r.name.toLowerCase().includes(roleName.toLowerCase())
            );
            if (role) {
                const allow = [PermissionFlagsBits.ViewChannel];
                if (channelType === 'voice') {
                    allow.push(PermissionFlagsBits.Connect, PermissionFlagsBits.Speak);
                } else if (channelType === 'text') {
                    allow.push(PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory);
                }
                overwrites.push({
                    id: role.id,
                    allow: allow
                });
            }
        }
    }

    // If read_only, deny SendMessages for @everyone
    if (read_only && channelType === 'text') {
        // Find if we already have an @everyone overwrite
        const everyoneOverwrite = overwrites.find(o => o.id === guild.roles.everyone.id);
        if (everyoneOverwrite) {
            // Add SendMessages denial to existing overwrite
            if (!everyoneOverwrite.deny) everyoneOverwrite.deny = [];
            everyoneOverwrite.deny.push(PermissionFlagsBits.SendMessages);
        } else {
            // Create new overwrite for @everyone
            overwrites.push({
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.SendMessages]
            });
        }

        // Allow specified roles to send messages
        for (const roleName of read_only_except) {
            const role = guild.roles.cache.find(r =>
                r.name.toLowerCase() === roleName.toLowerCase() ||
                r.name.toLowerCase().includes(roleName.toLowerCase())
            );
            if (role) {
                // Check if we already have an overwrite for this role
                const existingOverwrite = overwrites.find(o => o.id === role.id);
                if (existingOverwrite) {
                    if (!existingOverwrite.allow) existingOverwrite.allow = [];
                    existingOverwrite.allow.push(PermissionFlagsBits.SendMessages);
                } else {
                    overwrites.push({
                        id: role.id,
                        allow: [PermissionFlagsBits.SendMessages]
                    });
                }
            }
        }
    }

    return overwrites;
}

// ============================================================
// CHANNEL FINDER UTILITIES
// ============================================================

/**
 * Find a channel by name and type
 * @param {Object} guild - Discord guild object
 * @param {string} name - Channel name to find
 * @param {string} type - Channel type filter ('text', 'voice', 'category', 'any')
 * @returns {Object|null} The channel if found, or null
 */
export function findChannel(guild, name, type = 'any') {
    const lowerName = name.toLowerCase();

    return guild.channels.cache.find(ch => {
        const nameMatch = ch.name.toLowerCase() === lowerName ||
            ch.name.toLowerCase().includes(lowerName);

        if (!nameMatch) return false;

        switch (type) {
            case 'text':
                return ch.type === ChannelType.GuildText;
            case 'voice':
                return ch.type === ChannelType.GuildVoice;
            case 'category':
                return ch.type === ChannelType.GuildCategory;
            case 'any':
            default:
                return ch.type === ChannelType.GuildText ||
                    ch.type === ChannelType.GuildVoice ||
                    ch.type === ChannelType.GuildCategory;
        }
    });
}

/**
 * Find a voice channel by name
 * @param {Object} guild - Discord guild object
 * @param {string} name - Voice channel name to find
 * @returns {Object|null} The voice channel if found, or null
 */
export function findVoiceChannel(guild, name) {
    const lowerName = name.toLowerCase();

    // Try exact match first
    let channel = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildVoice && c.name.toLowerCase() === lowerName
    );
    if (channel) return channel;

    // Try partial match
    channel = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes(lowerName)
    );
    return channel;
}

/**
 * Find the best category for a voice channel
 * @param {Object} guild - Discord guild object
 * @param {string} requestedCategory - Optional category name the user requested
 * @returns {Object|null} The best category channel, or null for no category
 */
export function findBestVoiceCategory(guild, requestedCategory = null) {
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
    const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);

    // If user specified a category, try to find it
    if (requestedCategory) {
        const lowerRequested = requestedCategory.toLowerCase();
        const match = categories.find(c =>
            c.name.toLowerCase() === lowerRequested ||
            c.name.toLowerCase().includes(lowerRequested)
        );
        if (match) {
            logger.debug('TOOL', `Found requested category: ${match.name}`);
            return match;
        }
    }

    // Strategy 1: Find category with the most voice channels (that's probably the "voice" section)
    const categoryVoiceCounts = new Map();
    for (const [, vc] of voiceChannels) {
        if (vc.parentId) {
            categoryVoiceCounts.set(vc.parentId, (categoryVoiceCounts.get(vc.parentId) || 0) + 1);
        }
    }

    if (categoryVoiceCounts.size > 0) {
        // Get category with most voice channels
        let bestCategoryId = null;
        let maxCount = 0;
        for (const [catId, count] of categoryVoiceCounts) {
            if (count > maxCount) {
                maxCount = count;
                bestCategoryId = catId;
            }
        }
        if (bestCategoryId) {
            const bestCategory = categories.get(bestCategoryId);
            if (bestCategory) {
                logger.debug('TOOL', `Auto-selected category by voice channel count: ${bestCategory.name} (${maxCount} voice channels)`);
                return bestCategory;
            }
        }
    }

    // Strategy 2: Look for common voice category names
    const voiceCategoryNames = ['voice channels', 'voice', 'vc', 'voice chats', 'calls', 'talk'];
    for (const name of voiceCategoryNames) {
        const match = categories.find(c => c.name.toLowerCase().includes(name));
        if (match) {
            logger.debug('TOOL', `Found voice category by name: ${match.name}`);
            return match;
        }
    }

    // Strategy 3: Look for general/community categories
    const generalCategoryNames = ['general', 'community', 'main', 'public'];
    for (const name of generalCategoryNames) {
        const match = categories.find(c => c.name.toLowerCase().includes(name));
        if (match) {
            logger.debug('TOOL', `Using general category: ${match.name}`);
            return match;
        }
    }

    // Strategy 4: Just use the first category if any exist
    if (categories.size > 0) {
        const firstCategory = categories.first();
        logger.debug('TOOL', `Using first available category: ${firstCategory.name}`);
        return firstCategory;
    }

    // No categories exist - channel will be created at the top level
    logger.debug('TOOL', 'No categories found, creating channel at top level');
    return null;
}

/**
 * Find the best category for a text channel
 * @param {Object} guild - Discord guild object
 * @param {string} requestedCategory - Optional category name the user requested
 * @returns {Object|null} The best category channel, or null for no category
 */
export function findBestTextCategory(guild, requestedCategory = null) {
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
    const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);

    // If user specified a category, try to find it
    if (requestedCategory) {
        const lowerRequested = requestedCategory.toLowerCase();
        const match = categories.find(c =>
            c.name.toLowerCase() === lowerRequested ||
            c.name.toLowerCase().includes(lowerRequested)
        );
        if (match) {
            logger.debug('TOOL', `Found requested category: ${match.name}`);
            return match;
        }
    }

    // Strategy 1: Find category with the most text channels
    const categoryTextCounts = new Map();
    for (const [, tc] of textChannels) {
        if (tc.parentId) {
            categoryTextCounts.set(tc.parentId, (categoryTextCounts.get(tc.parentId) || 0) + 1);
        }
    }

    if (categoryTextCounts.size > 0) {
        // Get category with most text channels
        let bestCategoryId = null;
        let maxCount = 0;
        for (const [catId, count] of categoryTextCounts) {
            if (count > maxCount) {
                maxCount = count;
                bestCategoryId = catId;
            }
        }
        if (bestCategoryId) {
            const bestCategory = categories.get(bestCategoryId);
            if (bestCategory) {
                logger.debug('TOOL', `Auto-selected category by text channel count: ${bestCategory.name} (${maxCount} text channels)`);
                return bestCategory;
            }
        }
    }

    // Strategy 2: Look for common text category names
    const textCategoryNames = ['text channels', 'text', 'chat', 'general', 'community'];
    for (const name of textCategoryNames) {
        const match = categories.find(c => c.name.toLowerCase().includes(name));
        if (match) {
            logger.debug('TOOL', `Found text category by name: ${match.name}`);
            return match;
        }
    }

    // Strategy 3: Just use the first category if any exist
    if (categories.size > 0) {
        const firstCategory = categories.first();
        logger.debug('TOOL', `Using first available category: ${firstCategory.name}`);
        return firstCategory;
    }

    // No categories exist - channel will be created at the top level
    logger.debug('TOOL', 'No categories found, creating channel at top level');
    return null;
}

// ============================================================
// MEMBER/ROLE FINDER UTILITIES
// ============================================================

/**
 * Find a role by name (exact or partial match)
 * @param {Object} guild - Discord guild object
 * @param {string} name - Role name to find
 * @returns {Object|null} The role if found, or null
 */
export function findRole(guild, name) {
    const lowerName = name.toLowerCase();

    // Try exact match first
    let role = guild.roles.cache.find(r => r.name.toLowerCase() === lowerName);
    if (role) return role;

    // Try partial match
    role = guild.roles.cache.find(r => r.name.toLowerCase().includes(lowerName));
    return role;
}

/**
 * Find a member by name, display name, or ID
 * @param {Object} guild - Discord guild object
 * @param {string} identifier - Username, display name, mention, or ID
 * @returns {Promise<Object|null>} The member if found, or null
 */
export async function findMember(guild, identifier) {
    // Clean up mentions
    let cleanId = identifier.replace(/<@!?(\d+)>/, '$1').trim();
    const lowerName = cleanId.toLowerCase();

    // If it looks like an ID, try to fetch directly
    if (/^\d{17,19}$/.test(cleanId)) {
        try {
            const member = await guild.members.fetch(cleanId);
            return member;
        } catch (e) {
            // Not found by ID
        }
    }

    // Search by username or display name
    const members = await guild.members.fetch({ query: cleanId, limit: 10 });

    // Try exact username match
    let member = members.find(m =>
        m.user.username.toLowerCase() === lowerName ||
        m.user.tag.toLowerCase() === lowerName ||
        m.displayName.toLowerCase() === lowerName
    );
    if (member) return member;

    // Try partial match
    member = members.find(m =>
        m.user.username.toLowerCase().includes(lowerName) ||
        m.displayName.toLowerCase().includes(lowerName)
    );

    return member;
}

/**
 * Find a member by name or ID - optimized to avoid fetching all members
 * @param {Object} guild - Discord guild object
 * @param {string} identifier - Username, display name, ID, or mention
 * @returns {Promise<Object|null>} The member if found, or null
 */
export async function findMemberSmart(guild, identifier) {
    if (!identifier) return null;

    const cleanId = identifier.replace(/[<@!>]/g, '').trim();

    // If it looks like an ID (all digits), try direct fetch first
    if (/^\d{17,19}$/.test(cleanId)) {
        try {
            const member = await guild.members.fetch(cleanId);
            if (member) return member;
        } catch (e) {
            // Member not found by ID, continue with name search
        }
    }

    // Check cached members first (no API call)
    const lowerName = cleanId.toLowerCase();

    // Try exact match in cache
    let member = guild.members.cache.find(m =>
        m.displayName.toLowerCase() === lowerName ||
        m.user.username.toLowerCase() === lowerName
    );
    if (member) return member;

    // Try partial match in cache
    member = guild.members.cache.find(m =>
        m.displayName.toLowerCase().includes(lowerName) ||
        m.user.username.toLowerCase().includes(lowerName)
    );
    if (member) return member;

    // If not in cache, search by query (limited fetch, won't timeout)
    try {
        const searchResults = await guild.members.search({ query: cleanId, limit: 10 });
        if (searchResults.size > 0) {
            // Return best match (first result)
            return searchResults.first();
        }
    } catch (e) {
        logger.warn('TOOL', `Member search failed: ${e.message}`);
    }

    return null;
}

// ============================================================
// TIME/DURATION UTILITIES
// ============================================================

/**
 * Parse a duration string into milliseconds
 * @param {string} duration - Duration string like '5m', '1h', '1d', '1w'
 * @returns {number|null} Duration in milliseconds, or null if invalid
 */
export function parseDuration(duration) {
    const match = duration.match(/^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        's': 1000,
        'sec': 1000,
        'second': 1000,
        'seconds': 1000,
        'm': 60 * 1000,
        'min': 60 * 1000,
        'minute': 60 * 1000,
        'minutes': 60 * 1000,
        'h': 60 * 60 * 1000,
        'hr': 60 * 60 * 1000,
        'hour': 60 * 60 * 1000,
        'hours': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000,
        'day': 24 * 60 * 60 * 1000,
        'days': 24 * 60 * 60 * 1000,
        'w': 7 * 24 * 60 * 60 * 1000,
        'week': 7 * 24 * 60 * 60 * 1000,
        'weeks': 7 * 24 * 60 * 60 * 1000
    };

    return value * (multipliers[unit] || 0);
}

/**
 * Parse an event time string into a Date object
 * Supports:
 * - ISO 8601 format
 * - "tomorrow at 3pm"
 * - "Saturday at 9pm"
 * - "next Friday at 2:30pm"
 * - "in 2 hours"
 * @param {string} timeString - Time string to parse
 * @returns {Date} Parsed date object
 */
export function parseEventTime(timeString) {
    // Try parsing ISO 8601 first
    let date = new Date(timeString);
    if (!isNaN(date.getTime())) return date;

    const now = new Date();
    const lower = timeString.toLowerCase().trim();

    // Day name mapping
    const dayNames = {
        'sunday': 0, 'sun': 0,
        'monday': 1, 'mon': 1,
        'tuesday': 2, 'tue': 2, 'tues': 2,
        'wednesday': 3, 'wed': 3,
        'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
        'friday': 5, 'fri': 5,
        'saturday': 6, 'sat': 6
    };

    // Helper to parse time from string (returns {hour, minute})
    const parseTime = (str) => {
        const match = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (!match) return { hour: 12, minute: 0 }; // Default to noon

        let hour = parseInt(match[1]);
        const minute = match[2] ? parseInt(match[2]) : 0;
        const ampm = match[3]?.toLowerCase();

        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;

        return { hour, minute };
    };

    // Handle "tomorrow"
    if (lower.includes('tomorrow')) {
        date = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const { hour, minute } = parseTime(lower);
        date.setHours(hour, minute, 0, 0);
        return date;
    }

    // Handle "today"
    if (lower.includes('today')) {
        date = new Date(now);
        const { hour, minute } = parseTime(lower);
        date.setHours(hour, minute, 0, 0);
        return date;
    }

    // Handle "in X hours/minutes/days"
    const relativeMatch = lower.match(/in\s+(\d+)\s*(hour|hr|minute|min|day|week)s?/i);
    if (relativeMatch) {
        const value = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        date = new Date(now);

        if (unit.startsWith('hour') || unit.startsWith('hr')) {
            date.setTime(date.getTime() + value * 60 * 60 * 1000);
        } else if (unit.startsWith('min')) {
            date.setTime(date.getTime() + value * 60 * 1000);
        } else if (unit.startsWith('day')) {
            date.setTime(date.getTime() + value * 24 * 60 * 60 * 1000);
        } else if (unit.startsWith('week')) {
            date.setTime(date.getTime() + value * 7 * 24 * 60 * 60 * 1000);
        }
        return date;
    }

    // Handle day names (e.g., "Saturday at 9pm", "next Friday at 2pm")
    const isNext = lower.includes('next');
    for (const [dayName, dayNum] of Object.entries(dayNames)) {
        if (lower.includes(dayName)) {
            date = new Date(now);
            const currentDay = date.getDay();
            let daysToAdd = dayNum - currentDay;

            // If the day has passed this week (or is today), go to next week
            if (daysToAdd <= 0 || isNext) {
                daysToAdd += 7;
            }

            date.setDate(date.getDate() + daysToAdd);
            const { hour, minute } = parseTime(lower);
            date.setHours(hour, minute, 0, 0);
            return date;
        }
    }

    // Fallback: try direct Date parsing
    return new Date(timeString);
}

// Re-export logger for convenience
export { logger };
