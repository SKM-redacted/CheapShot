/**
 * Rules Manager
 * 
 * Handles finding, creating, and caching server rules channels.
 * Extracts custom rules or falls back to default rules.
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../ai/logger.js';
import { DEFAULT_RULES } from './defaultRules.js';

// Cache for guild rules (guildId -> rules string)
const guildRulesCache = new Map();

// Cache for rules channel IDs (guildId -> channelId)
const rulesChannelCache = new Map();

// Keywords to identify a rules channel
const RULES_CHANNEL_KEYWORDS = ['rules', 'rule', 'guidelines', 'server-rules', 'community-rules', 'info'];

/**
 * Find a rules channel in the guild
 * @param {Object} guild - Discord guild
 * @returns {Object|null} The rules channel or null
 */
export function findRulesChannel(guild) {
    if (!guild) return null;

    // Check cache first
    if (rulesChannelCache.has(guild.id)) {
        const cachedId = rulesChannelCache.get(guild.id);
        const channel = guild.channels.cache.get(cachedId);
        if (channel) return channel;
        // Cache was stale, remove it
        rulesChannelCache.delete(guild.id);
    }

    // Search for a rules channel
    const textChannels = guild.channels.cache.filter(
        ch => ch.type === ChannelType.GuildText
    );

    for (const keyword of RULES_CHANNEL_KEYWORDS) {
        const found = textChannels.find(ch =>
            ch.name.toLowerCase().includes(keyword)
        );
        if (found) {
            rulesChannelCache.set(guild.id, found.id);
            return found;
        }
    }

    return null;
}

/**
 * Create a rules channel with default rules
 * @param {Object} guild - Discord guild
 * @returns {Promise<Object|null>} The created channel or null
 */
export async function createRulesChannel(guild) {
    if (!guild) return null;

    try {
        // Create the rules channel
        const rulesChannel = await guild.channels.create({
            name: '📜-rules',
            type: ChannelType.GuildText,
            topic: 'Server rules and guidelines - Please read before participating!',
            permissionOverwrites: [
                {
                    id: guild.id, // @everyone
                    deny: [PermissionFlagsBits.SendMessages], // Read-only
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
                }
            ],
            reason: 'CheapShot Moderation: Creating rules channel'
        });

        // Send the default rules
        await rulesChannel.send(DEFAULT_RULES);

        // Cache the channel
        rulesChannelCache.set(guild.id, rulesChannel.id);
        guildRulesCache.set(guild.id, DEFAULT_RULES);

        logger.info('MODERATION', `Created rules channel in ${guild.name}`);

        return rulesChannel;
    } catch (error) {
        logger.error('MODERATION', `Failed to create rules channel in ${guild.name}: ${error.message}`);
        return null;
    }
}

/**
 * Extract rules from a rules channel
 * @param {Object} channel - Rules channel
 * @returns {Promise<string>} Extracted rules text
 */
export async function extractRulesFromChannel(channel) {
    if (!channel) return DEFAULT_RULES;

    try {
        // Fetch messages from the rules channel (up to 50)
        const messages = await channel.messages.fetch({ limit: 50 });

        if (messages.size === 0) {
            return DEFAULT_RULES;
        }

        // Combine all messages into rules text (oldest first)
        const rulesArray = [];
        messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        for (const msg of messages.values()) {
            if (msg.content && msg.content.trim().length > 0) {
                rulesArray.push(msg.content);
            }
            // Also check embeds
            if (msg.embeds && msg.embeds.length > 0) {
                for (const embed of msg.embeds) {
                    if (embed.description) {
                        rulesArray.push(embed.description);
                    }
                    if (embed.fields && embed.fields.length > 0) {
                        for (const field of embed.fields) {
                            rulesArray.push(`${field.name}: ${field.value}`);
                        }
                    }
                }
            }
        }

        const extractedRules = rulesArray.join('\n\n');
        return extractedRules.length > 0 ? extractedRules : DEFAULT_RULES;

    } catch (error) {
        logger.error('MODERATION', `Failed to extract rules: ${error.message}`);
        return DEFAULT_RULES;
    }
}

/**
 * Get rules for a guild (cached)
 * Custom rules take priority over default rules
 * 
 * @param {Object} guild - Discord guild
 * @returns {Promise<{rules: string, isCustom: boolean}>} Rules text and whether they're custom
 */
export async function getGuildRules(guild) {
    if (!guild) return { rules: DEFAULT_RULES, isCustom: false };

    // Check cache first
    const cacheKey = guild.id;
    if (guildRulesCache.has(cacheKey)) {
        const cached = guildRulesCache.get(cacheKey);
        return {
            rules: cached,
            isCustom: cached !== DEFAULT_RULES
        };
    }

    // Find or create rules channel
    let rulesChannel = findRulesChannel(guild);

    if (!rulesChannel) {
        // No rules channel found - create one
        logger.info('MODERATION', `No rules channel found in ${guild.name}, creating one...`);
        rulesChannel = await createRulesChannel(guild);

        if (rulesChannel) {
            guildRulesCache.set(cacheKey, DEFAULT_RULES);
            return { rules: DEFAULT_RULES, isCustom: false };
        }

        // Failed to create - use defaults anyway
        return { rules: DEFAULT_RULES, isCustom: false };
    }

    // Extract rules from existing channel (custom rules)
    const rules = await extractRulesFromChannel(rulesChannel);
    const isCustom = rules !== DEFAULT_RULES;
    guildRulesCache.set(cacheKey, rules);

    logger.debug('MODERATION', `Loaded ${isCustom ? 'custom' : 'default'} rules for ${guild.name} (${rules.length} chars)`);

    return { rules, isCustom };
}

/**
 * Refresh rules cache for a guild
 * @param {string} guildId - Guild ID to refresh
 */
export function invalidateRulesCache(guildId) {
    guildRulesCache.delete(guildId);
    rulesChannelCache.delete(guildId);
}

/**
 * Clear all rules caches
 */
export function clearRulesCache() {
    guildRulesCache.clear();
    rulesChannelCache.clear();
}

/**
 * Check if a guild has custom rules (cached check)
 * @param {string} guildId - Guild ID
 * @returns {boolean}
 */
export function hasCustomRules(guildId) {
    if (!guildRulesCache.has(guildId)) return false;
    return guildRulesCache.get(guildId) !== DEFAULT_RULES;
}
