import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { voiceClient } from './voiceClient.js';
import { voiceMemory } from './voiceMemory.js';

/**
 * Discord Tool Handlers
 * 
 * This file contains the handler functions that execute Discord actions
 * when the AI calls a tool.
 * 
 * Tool definitions (schemas) are in toolDefinitions.js
 */

/**
 * Find the best category for a voice channel
 * @param {Object} guild - Discord guild object
 * @param {string} requestedCategory - Optional category name the user requested
 * @returns {Object|null} The best category channel, or null for no category
 */
function findBestVoiceCategory(guild, requestedCategory = null) {
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
function findBestTextCategory(guild, requestedCategory = null) {
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

/**
 * Handler for creating a voice channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name: string, category?: string }
 * @returns {Promise<{success: boolean, channel?: Object, error?: string}>}
 */
export async function handleCreateVoiceChannel(guild, args) {
    const { name, category: requestedCategory } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot create voice channel: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot create voice channel: Invalid name');
        return { success: false, error: 'Invalid channel name' };
    }

    try {
        // Find the best category for this channel
        const targetCategory = findBestVoiceCategory(guild, requestedCategory);

        const categoryInfo = targetCategory ? ` in category "${targetCategory.name}"` : ' (no category)';
        logger.info('TOOL', `Creating voice channel "${name}"${categoryInfo} in guild ${guild.name}`);

        const channelOptions = {
            name: name,
            type: ChannelType.GuildVoice,
            reason: 'Created by CheapShot AI via tool call'
        };

        // Add to category if we found one
        if (targetCategory) {
            channelOptions.parent = targetCategory.id;
        }

        const channel = await guild.channels.create(channelOptions);

        logger.info('TOOL', `Voice channel "${name}" created successfully (ID: ${channel.id})${categoryInfo}`);

        return {
            success: true,
            channel: {
                id: channel.id,
                name: channel.name,
                type: 'voice',
                category: targetCategory?.name || null
            }
        };

    } catch (error) {
        logger.error('TOOL', `Failed to create voice channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to create channel'
        };
    }
}

/**
 * Handler for creating a text channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name: string, category?: string, topic?: string }
 * @returns {Promise<{success: boolean, channel?: Object, error?: string}>}
 */
export async function handleCreateTextChannel(guild, args) {
    const { name, category: requestedCategory, topic } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot create text channel: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot create text channel: Invalid name');
        return { success: false, error: 'Invalid channel name' };
    }

    try {
        // Find the best category for this channel
        const targetCategory = findBestTextCategory(guild, requestedCategory);

        const categoryInfo = targetCategory ? ` in category "${targetCategory.name}"` : ' (no category)';
        logger.info('TOOL', `Creating text channel "${name}"${categoryInfo} in guild ${guild.name}`);

        const channelOptions = {
            name: name,
            type: ChannelType.GuildText,
            reason: 'Created by CheapShot AI via tool call'
        };

        // Add to category if we found one
        if (targetCategory) {
            channelOptions.parent = targetCategory.id;
        }

        // Add topic if provided
        if (topic) {
            channelOptions.topic = topic;
        }

        const channel = await guild.channels.create(channelOptions);

        logger.info('TOOL', `Text channel "${name}" created successfully (ID: ${channel.id})${categoryInfo}`);

        return {
            success: true,
            channel: {
                id: channel.id,
                name: channel.name,
                type: 'text',
                category: targetCategory?.name || null,
                topic: topic || null
            }
        };

    } catch (error) {
        logger.error('TOOL', `Failed to create text channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to create channel'
        };
    }
}

/**
 * Handler for creating a category
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name: string }
 * @returns {Promise<{success: boolean, category?: Object, error?: string}>}
 */
export async function handleCreateCategory(guild, args) {
    const { name } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot create category: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot create category: Invalid name');
        return { success: false, error: 'Invalid category name' };
    }

    try {
        logger.info('TOOL', `Creating category "${name}" in guild ${guild.name}`);

        const category = await guild.channels.create({
            name: name,
            type: ChannelType.GuildCategory,
            reason: 'Created by CheapShot AI via tool call'
        });

        logger.info('TOOL', `Category "${name}" created successfully (ID: ${category.id})`);

        return {
            success: true,
            category: {
                id: category.id,
                name: category.name,
                type: 'category'
            }
        };

    } catch (error) {
        logger.error('TOOL', `Failed to create category: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to create category'
        };
    }
}

/**
 * Handler for deleting a channel or category
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name: string, type?: 'text'|'voice'|'category'|'any' }
 * @returns {Promise<{success: boolean, deleted?: Object, error?: string}>}
 */
export async function handleDeleteChannel(guild, args) {
    const { name, type = 'any' } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot delete channel: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot delete channel: Invalid name');
        return { success: false, error: 'Invalid channel name' };
    }

    try {
        const lowerName = name.toLowerCase();

        // Find matching channels based on type filter
        let channels = guild.channels.cache.filter(ch => {
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

        if (channels.size === 0) {
            const typeStr = type === 'any' ? 'channel or category' : type;
            logger.warn('TOOL', `No ${typeStr} found matching "${name}"`);
            return { success: false, error: `No ${typeStr} found matching "${name}"` };
        }

        // If multiple matches, prefer exact match
        let channelToDelete = channels.find(ch => ch.name.toLowerCase() === lowerName);
        if (!channelToDelete) {
            channelToDelete = channels.first();
        }

        const channelName = channelToDelete.name;
        const channelType = channelToDelete.type === ChannelType.GuildCategory ? 'category' :
            channelToDelete.type === ChannelType.GuildVoice ? 'voice' : 'text';

        logger.info('TOOL', `Deleting ${channelType} "${channelName}" (ID: ${channelToDelete.id}) in guild ${guild.name}`);

        await channelToDelete.delete('Deleted by CheapShot AI via tool call');

        logger.info('TOOL', `${channelType} "${channelName}" deleted successfully`);

        return {
            success: true,
            deleted: {
                id: channelToDelete.id,
                name: channelName,
                type: channelType
            }
        };

    } catch (error) {
        logger.error('TOOL', `Failed to delete channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to delete channel'
        };
    }
}

/**
 * Handler for listing channels in the server
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { type?: 'all'|'text'|'voice'|'category' }
 * @returns {Promise<{success: boolean, channels?: Object, error?: string}>}
 */
export async function handleListChannels(guild, args) {
    const { type = 'all' } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot list channels: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        const categories = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildCategory);
        const textChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText);
        const voiceChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildVoice);

        // Build organized channel list
        const result = {
            success: true,
            categories: [],
            text_channels: [],
            voice_channels: [],
            summary: ''
        };

        // Categories
        if (type === 'all' || type === 'category') {
            for (const [, cat] of categories) {
                result.categories.push({
                    name: cat.name,
                    id: cat.id
                });
            }
        }

        // Text channels
        if (type === 'all' || type === 'text') {
            for (const [, ch] of textChannels) {
                const parent = ch.parent?.name || 'No Category';
                result.text_channels.push({
                    name: ch.name,
                    category: parent,
                    id: ch.id
                });
            }
        }

        // Voice channels
        if (type === 'all' || type === 'voice') {
            for (const [, ch] of voiceChannels) {
                const parent = ch.parent?.name || 'No Category';
                result.voice_channels.push({
                    name: ch.name,
                    category: parent,
                    id: ch.id
                });
            }
        }

        // Build summary with category grouping
        let summaryLines = [];
        const MAX_CHANNELS_PER_CATEGORY = 20; // Limit to prevent huge messages
        let truncatedCount = 0;

        // Categories
        if (result.categories.length > 0) {
            const catNames = result.categories.map(c => c.name);
            if (catNames.length > 15) {
                summaryLines.push(`📁 Categories (${catNames.length}): ${catNames.slice(0, 15).join(', ')}... and ${catNames.length - 15} more`);
            } else {
                summaryLines.push(`📁 Categories: ${catNames.join(', ')}`);
            }
        }

        // Text channels grouped by category
        if (result.text_channels.length > 0) {
            const byCategory = {};
            for (const ch of result.text_channels) {
                const cat = ch.category || 'No Category';
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push(`#${ch.name}`);
            }
            summaryLines.push(`💬 Text Channels (${result.text_channels.length} total):`);
            for (const [cat, channels] of Object.entries(byCategory)) {
                if (channels.length > MAX_CHANNELS_PER_CATEGORY) {
                    const shown = channels.slice(0, MAX_CHANNELS_PER_CATEGORY);
                    const remaining = channels.length - MAX_CHANNELS_PER_CATEGORY;
                    truncatedCount += remaining;
                    summaryLines.push(`  [${cat}]: ${shown.join(', ')}... +${remaining} more`);
                } else {
                    summaryLines.push(`  [${cat}]: ${channels.join(', ')}`);
                }
            }
        }

        // Voice channels grouped by category
        if (result.voice_channels.length > 0) {
            const byCategory = {};
            for (const ch of result.voice_channels) {
                const cat = ch.category || 'No Category';
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push(ch.name);
            }
            summaryLines.push(`🔊 Voice Channels (${result.voice_channels.length} total):`);
            for (const [cat, channels] of Object.entries(byCategory)) {
                if (channels.length > MAX_CHANNELS_PER_CATEGORY) {
                    const shown = channels.slice(0, MAX_CHANNELS_PER_CATEGORY);
                    const remaining = channels.length - MAX_CHANNELS_PER_CATEGORY;
                    truncatedCount += remaining;
                    summaryLines.push(`  [${cat}]: ${shown.join(', ')}... +${remaining} more`);
                } else {
                    summaryLines.push(`  [${cat}]: ${channels.join(', ')}`);
                }
            }
        }

        if (truncatedCount > 0) {
            summaryLines.push(`\n⚠️ *Output truncated - ${truncatedCount} channels not shown in summary (full data available in result object)*`);
        }

        result.summary = summaryLines.join('\n') || 'No channels found';

        logger.info('TOOL', `Listed channels: ${result.categories.length} categories, ${result.text_channels.length} text, ${result.voice_channels.length} voice`);

        return result;

    } catch (error) {
        logger.error('TOOL', `Failed to list channels: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to list channels'
        };
    }
}

/**
 * Handler for getting complete server info (channels + roles) in one call
 * This is the preferred reconnaissance tool before setup_server_structure
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { include_permissions?: boolean }
 * @returns {Promise<{success: boolean, channels?: Object, roles?: Array, summary?: string, error?: string}>}
 */
export async function handleGetServerInfo(guild, args) {
    const { include_permissions = false } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot get server info: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        // Get channels info
        const channelResult = await handleListChannels(guild, { type: 'all' });

        // Get roles info (using internal logic to avoid circular dependency issues)
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(r => {
                const roleData = {
                    name: r.name,
                    id: r.id,
                    color: r.hexColor,
                    members: r.members.size,
                    hoist: r.hoist,
                    mentionable: r.mentionable,
                    position: r.position
                };

                if (include_permissions) {
                    const keyPerms = [];
                    if (r.permissions.has(PermissionFlagsBits.Administrator)) keyPerms.push('Administrator');
                    if (r.permissions.has(PermissionFlagsBits.ManageChannels)) keyPerms.push('ManageChannels');
                    if (r.permissions.has(PermissionFlagsBits.ManageRoles)) keyPerms.push('ManageRoles');
                    if (r.permissions.has(PermissionFlagsBits.ManageMessages)) keyPerms.push('ManageMessages');
                    if (r.permissions.has(PermissionFlagsBits.KickMembers)) keyPerms.push('KickMembers');
                    if (r.permissions.has(PermissionFlagsBits.BanMembers)) keyPerms.push('BanMembers');
                    roleData.key_permissions = keyPerms;
                }

                return roleData;
            });

        // Build a comprehensive summary
        let summaryLines = [`📊 **Server Structure Overview for "${guild.name}"**\n`];

        // Add channel summary
        if (channelResult.success) {
            summaryLines.push(channelResult.summary);
        }

        // Add roles summary (capped to prevent huge messages)
        const MAX_ROLES_SHOWN = 25;
        summaryLines.push(`\n🎭 **Roles** (${roles.length} total):`);
        const rolesToShow = roles.slice(0, MAX_ROLES_SHOWN);
        for (const r of rolesToShow) {
            let line = `  • **${r.name}** ${r.color !== '#000000' ? `[${r.color}]` : ''} - ${r.members} member${r.members !== 1 ? 's' : ''}`;
            if (r.hoist) line += ' 📌';
            if (r.mentionable) line += ' @';
            if (include_permissions && r.key_permissions?.length > 0) {
                line += ` (${r.key_permissions.join(', ')})`;
            }
            summaryLines.push(line);
        }
        if (roles.length > MAX_ROLES_SHOWN) {
            summaryLines.push(`  ... and ${roles.length - MAX_ROLES_SHOWN} more roles`);
        }

        logger.info('TOOL', `Got server info: ${channelResult.categories?.length || 0} categories, ${channelResult.text_channels?.length || 0} text, ${channelResult.voice_channels?.length || 0} voice, ${roles.length} roles`);

        return {
            success: true,
            categories: channelResult.categories || [],
            text_channels: channelResult.text_channels || [],
            voice_channels: channelResult.voice_channels || [],
            roles: roles,
            summary: summaryLines.join('\n')
        };

    } catch (error) {
        logger.error('TOOL', `Failed to get server info: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to get server info'
        };
    }
}

/**
 * Handler for bulk deleting multiple channels at once
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { channels: Array<{name: string, type?: string}> }
 * @returns {Promise<{success: boolean, deleted?: Array, failed?: Array, error?: string}>}
 */
export async function handleDeleteChannelsBulk(guild, args) {
    const { channels = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot bulk delete channels: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!Array.isArray(channels) || channels.length === 0) {
        logger.error('TOOL', 'Cannot bulk delete channels: No channels specified');
        return { success: false, error: 'No channels specified for deletion' };
    }

    logger.info('TOOL', `Bulk deleting ${channels.length} channels in parallel`);

    // Execute all deletions in parallel
    const deletePromises = channels.map(async (ch) => {
        try {
            const result = await handleDeleteChannel(guild, {
                name: ch.name,
                type: ch.type || 'any'
            });
            return {
                name: ch.name,
                type: ch.type || 'any',
                ...result
            };
        } catch (error) {
            return {
                name: ch.name,
                type: ch.type || 'any',
                success: false,
                error: error.message
            };
        }
    });

    const results = await Promise.all(deletePromises);

    const deleted = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    logger.info('TOOL', `Bulk delete complete: ${deleted.length} deleted, ${failed.length} failed`);

    return {
        success: deleted.length > 0,
        deleted: deleted.map(r => ({ name: r.deleted?.name || r.name, type: r.deleted?.type || r.type })),
        failed: failed.map(r => ({ name: r.name, error: r.error })),
        summary: `Deleted ${deleted.length} channel(s)${failed.length > 0 ? `, ${failed.length} failed` : ''}`
    };
}

// ============================================================
// CHANNEL EDITING HANDLERS
// ============================================================

/**
 * Find a channel by name and type
 * @param {Object} guild - Discord guild object
 * @param {string} name - Channel name to find
 * @param {string} type - Channel type filter ('text', 'voice', 'category', 'any')
 * @returns {Object|null} The channel if found, or null
 */
function findChannel(guild, name, type = 'any') {
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
 * Handler for editing a text channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, new_name?, topic?, category?, slowmode?, nsfw? }
 * @returns {Promise<{success: boolean, channel?: Object, changes?: Array, error?: string}>}
 */
export async function handleEditTextChannel(guild, args) {
    const { name, new_name, topic, category, slowmode, nsfw } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot edit text channel: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot edit text channel: Invalid name');
        return { success: false, error: 'Invalid channel name' };
    }

    try {
        const channel = findChannel(guild, name, 'text');

        if (!channel) {
            logger.warn('TOOL', `No text channel found matching "${name}"`);
            return { success: false, error: `No text channel found matching "${name}"` };
        }

        const changes = [];
        const editOptions = {
            reason: 'Edited by CheapShot AI via tool call'
        };

        // Apply new name
        if (new_name && new_name !== channel.name) {
            editOptions.name = new_name;
            changes.push(`renamed from "${channel.name}" to "${new_name}"`);
        }

        // Apply new topic
        if (topic !== undefined && topic !== channel.topic) {
            editOptions.topic = topic;
            changes.push(`topic ${topic ? `set to "${topic}"` : 'cleared'}`);
        }

        // Move to different category
        if (category !== undefined) {
            if (category === null || category === '') {
                // Remove from category
                editOptions.parent = null;
                changes.push('removed from category');
            } else {
                const targetCategory = findChannel(guild, category, 'category');
                if (targetCategory) {
                    editOptions.parent = targetCategory.id;
                    changes.push(`moved to category "${targetCategory.name}"`);
                }
            }
        }

        // Apply slowmode (rate limit per user in seconds)
        if (slowmode !== undefined && slowmode !== channel.rateLimitPerUser) {
            editOptions.rateLimitPerUser = Math.max(0, Math.min(21600, slowmode));
            changes.push(`slowmode set to ${slowmode} seconds`);
        }

        // Apply NSFW setting
        if (nsfw !== undefined && nsfw !== channel.nsfw) {
            editOptions.nsfw = Boolean(nsfw);
            changes.push(`NSFW ${nsfw ? 'enabled' : 'disabled'}`);
        }

        if (changes.length === 0) {
            return { success: false, error: 'No changes specified' };
        }

        logger.info('TOOL', `Editing text channel "${channel.name}": ${changes.join(', ')}`);

        const updatedChannel = await channel.edit(editOptions);

        logger.info('TOOL', `Text channel "${updatedChannel.name}" edited successfully`);

        return {
            success: true,
            channel: {
                id: updatedChannel.id,
                name: updatedChannel.name,
                type: 'text',
                topic: updatedChannel.topic,
                category: updatedChannel.parent?.name || null,
                slowmode: updatedChannel.rateLimitPerUser,
                nsfw: updatedChannel.nsfw
            },
            changes
        };

    } catch (error) {
        logger.error('TOOL', `Failed to edit text channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to edit text channel'
        };
    }
}

/**
 * Handler for editing a voice channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, new_name?, category?, user_limit?, bitrate? }
 * @returns {Promise<{success: boolean, channel?: Object, changes?: Array, error?: string}>}
 */
export async function handleEditVoiceChannel(guild, args) {
    const { name, new_name, category, user_limit, bitrate } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot edit voice channel: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot edit voice channel: Invalid name');
        return { success: false, error: 'Invalid channel name' };
    }

    try {
        const channel = findChannel(guild, name, 'voice');

        if (!channel) {
            logger.warn('TOOL', `No voice channel found matching "${name}"`);
            return { success: false, error: `No voice channel found matching "${name}"` };
        }

        const changes = [];
        const editOptions = {
            reason: 'Edited by CheapShot AI via tool call'
        };

        // Apply new name
        if (new_name && new_name !== channel.name) {
            editOptions.name = new_name;
            changes.push(`renamed from "${channel.name}" to "${new_name}"`);
        }

        // Move to different category
        if (category !== undefined) {
            if (category === null || category === '') {
                editOptions.parent = null;
                changes.push('removed from category');
            } else {
                const targetCategory = findChannel(guild, category, 'category');
                if (targetCategory) {
                    editOptions.parent = targetCategory.id;
                    changes.push(`moved to category "${targetCategory.name}"`);
                }
            }
        }

        // Apply user limit (0 = unlimited)
        if (user_limit !== undefined && user_limit !== channel.userLimit) {
            editOptions.userLimit = Math.max(0, Math.min(99, user_limit));
            changes.push(`user limit set to ${user_limit === 0 ? 'unlimited' : user_limit}`);
        }

        // Apply bitrate (in bps, 8000-96000 for normal servers, up to 384000 for boosted)
        if (bitrate !== undefined && bitrate !== channel.bitrate) {
            editOptions.bitrate = Math.max(8000, Math.min(384000, bitrate));
            changes.push(`bitrate set to ${bitrate}bps`);
        }

        if (changes.length === 0) {
            return { success: false, error: 'No changes specified' };
        }

        logger.info('TOOL', `Editing voice channel "${channel.name}": ${changes.join(', ')}`);

        const updatedChannel = await channel.edit(editOptions);

        logger.info('TOOL', `Voice channel "${updatedChannel.name}" edited successfully`);

        return {
            success: true,
            channel: {
                id: updatedChannel.id,
                name: updatedChannel.name,
                type: 'voice',
                category: updatedChannel.parent?.name || null,
                user_limit: updatedChannel.userLimit,
                bitrate: updatedChannel.bitrate
            },
            changes
        };

    } catch (error) {
        logger.error('TOOL', `Failed to edit voice channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to edit voice channel'
        };
    }
}

/**
 * Handler for editing a category
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, new_name? }
 * @returns {Promise<{success: boolean, category?: Object, changes?: Array, error?: string}>}
 */
export async function handleEditCategory(guild, args) {
    const { name, new_name } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot edit category: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot edit category: Invalid name');
        return { success: false, error: 'Invalid category name' };
    }

    try {
        const category = findChannel(guild, name, 'category');

        if (!category) {
            logger.warn('TOOL', `No category found matching "${name}"`);
            return { success: false, error: `No category found matching "${name}"` };
        }

        const changes = [];
        const editOptions = {
            reason: 'Edited by CheapShot AI via tool call'
        };

        // Apply new name
        if (new_name && new_name !== category.name) {
            editOptions.name = new_name;
            changes.push(`renamed from "${category.name}" to "${new_name}"`);
        }

        if (changes.length === 0) {
            return { success: false, error: 'No changes specified' };
        }

        logger.info('TOOL', `Editing category "${category.name}": ${changes.join(', ')}`);

        const updatedCategory = await category.edit(editOptions);

        logger.info('TOOL', `Category "${updatedCategory.name}" edited successfully`);

        return {
            success: true,
            category: {
                id: updatedCategory.id,
                name: updatedCategory.name,
                type: 'category'
            },
            changes
        };

    } catch (error) {
        logger.error('TOOL', `Failed to edit category: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to edit category'
        };
    }
}

/**
 * Handler for bulk editing multiple channels at once
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { channels: Array<{name, type?, new_name?, ...}> }
 * @returns {Promise<{success: boolean, edited?: Array, failed?: Array, summary?: string, error?: string}>}
 */
export async function handleEditChannelsBulk(guild, args) {
    const { channels = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot bulk edit channels: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!Array.isArray(channels) || channels.length === 0) {
        logger.error('TOOL', 'Cannot bulk edit channels: No channels specified');
        return { success: false, error: 'No channels specified for editing' };
    }

    logger.info('TOOL', `Bulk editing ${channels.length} channels in parallel`);

    // Execute all edits in parallel
    const editPromises = channels.map(async (ch) => {
        try {
            const type = ch.type || 'any';
            let result;

            if (type === 'text') {
                result = await handleEditTextChannel(guild, ch);
            } else if (type === 'voice') {
                result = await handleEditVoiceChannel(guild, ch);
            } else if (type === 'category') {
                result = await handleEditCategory(guild, ch);
            } else {
                // Auto-detect type
                const foundChannel = findChannel(guild, ch.name, 'any');
                if (!foundChannel) {
                    return { name: ch.name, success: false, error: `Channel "${ch.name}" not found` };
                }

                if (foundChannel.type === ChannelType.GuildText) {
                    result = await handleEditTextChannel(guild, ch);
                } else if (foundChannel.type === ChannelType.GuildVoice) {
                    result = await handleEditVoiceChannel(guild, ch);
                } else if (foundChannel.type === ChannelType.GuildCategory) {
                    result = await handleEditCategory(guild, ch);
                } else {
                    return { name: ch.name, success: false, error: 'Unsupported channel type' };
                }
            }

            return {
                name: ch.name,
                ...result
            };
        } catch (error) {
            return {
                name: ch.name,
                success: false,
                error: error.message
            };
        }
    });

    const results = await Promise.all(editPromises);

    const edited = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    logger.info('TOOL', `Bulk edit complete: ${edited.length} edited, ${failed.length} failed`);

    return {
        success: edited.length > 0,
        edited: edited.map(r => ({
            name: r.channel?.name || r.category?.name || r.name,
            type: r.channel?.type || r.category?.type || 'unknown',
            changes: r.changes || []
        })),
        failed: failed.map(r => ({ name: r.name, error: r.error })),
        summary: `Edited ${edited.length} channel(s)${failed.length > 0 ? `, ${failed.length} failed` : ''}`
    };
}

/**
 * Build permission overwrites array for a channel based on configuration
 * @param {Object} guild - Discord guild object
 * @param {Object} config - Channel config { private, role_access, read_only, read_only_except }
 * @param {string} channelType - 'text', 'voice', or 'category'
 * @returns {Array} Array of permission overwrites for Discord API
 */
function buildPermissionOverwrites(guild, config, channelType = 'text') {
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

/**
 * Handler for setting up a complete server structure in parallel
 * Creates roles first, then categories, then all channels - all with proper permissions
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { roles: Array, categories: Array, text_channels: Array, voice_channels: Array }
 * @returns {Promise<{success: boolean, created?: Object, failed?: Object, summary?: string, error?: string}>}
 */
export async function handleSetupServerStructure(guild, args) {
    const { roles = [], categories = [], text_channels = [], voice_channels = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot setup server structure: No guild context');
        return { success: false, error: 'No server context available' };
    }

    const totalItems = roles.length + categories.length + text_channels.length + voice_channels.length;
    if (totalItems === 0) {
        logger.error('TOOL', 'Cannot setup server structure: No items specified');
        return { success: false, error: 'No items specified' };
    }

    logger.info('TOOL', `Setting up server structure: ${roles.length} roles, ${categories.length} categories, ${text_channels.length} text, ${voice_channels.length} voice`);

    const results = {
        roles: { success: 0, failed: 0, details: [] },
        categories: { success: 0, failed: 0, details: [] },
        text_channels: { success: 0, failed: 0, details: [] },
        voice_channels: { success: 0, failed: 0, details: [] }
    };

    // Phase 0: Create all roles FIRST (so we can reference them in channel permissions)
    if (roles.length > 0) {
        logger.info('TOOL', `Phase 0: Creating ${roles.length} roles in parallel`);

        const roleResults = await Promise.all(
            roles.map(async (roleConfig) => {
                try {
                    const result = await handleCreateRole(guild, {
                        name: roleConfig.name,
                        color: roleConfig.color,
                        hoist: roleConfig.hoist,
                        mentionable: roleConfig.mentionable,
                        permissions: roleConfig.permissions
                    });
                    return { ...roleConfig, result, success: result.success };
                } catch (error) {
                    return { ...roleConfig, result: { success: false, error: error.message }, success: false };
                }
            })
        );

        for (const res of roleResults) {
            if (res.success) {
                results.roles.success++;
                results.roles.details.push({ name: res.name, success: true });
            } else {
                results.roles.failed++;
                results.roles.details.push({ name: res.name, success: false, error: res.result.error });
            }
        }

        // Small delay to let Discord API settle after role creation
        await new Promise(r => setTimeout(r, 500));

        // Refresh the guild roles cache to pick up the new roles
        await guild.roles.fetch();
    }

    // Phase 1: Create all categories in parallel WITH PERMISSIONS
    if (categories.length > 0) {
        logger.info('TOOL', `Phase 1: Creating ${categories.length} categories in parallel`);

        const categoryResults = await Promise.all(
            categories.map(async (cat) => {
                try {
                    // Build permission overwrites
                    const permissionOverwrites = buildPermissionOverwrites(guild, cat, 'category');

                    const channelOptions = {
                        name: cat.name,
                        type: ChannelType.GuildCategory,
                        reason: 'Created by CheapShot AI via setup_server_structure'
                    };

                    if (permissionOverwrites.length > 0) {
                        channelOptions.permissionOverwrites = permissionOverwrites;
                    }

                    const category = await guild.channels.create(channelOptions);

                    logger.info('TOOL', `Category "${cat.name}" created successfully (ID: ${category.id})${cat.private ? ' [PRIVATE]' : ''}`);

                    return {
                        ...cat,
                        result: {
                            success: true,
                            category: { id: category.id, name: category.name, private: cat.private || false }
                        },
                        success: true
                    };
                } catch (error) {
                    return { ...cat, result: { success: false, error: error.message }, success: false };
                }
            })
        );

        for (const res of categoryResults) {
            if (res.success) {
                results.categories.success++;
                results.categories.details.push({ name: res.name, success: true, private: res.private });
            } else {
                results.categories.failed++;
                results.categories.details.push({ name: res.name, success: false, error: res.result.error });
            }
        }
    }

    // Small delay to let Discord API settle
    if (categories.length > 0) {
        await new Promise(r => setTimeout(r, 500));
    }

    // Phase 2: Create all channels (text + voice) in parallel WITH PERMISSIONS
    const allChannels = [
        ...text_channels.map(ch => ({ ...ch, channelType: 'text' })),
        ...voice_channels.map(ch => ({ ...ch, channelType: 'voice' }))
    ];

    if (allChannels.length > 0) {
        logger.info('TOOL', `Phase 2: Creating ${allChannels.length} channels in parallel with permissions`);

        const channelResults = await Promise.all(
            allChannels.map(async (ch) => {
                try {
                    // Find category if specified
                    let parentCategory = null;
                    if (ch.category) {
                        parentCategory = guild.channels.cache.find(c =>
                            c.type === ChannelType.GuildCategory &&
                            (c.name.toLowerCase() === ch.category.toLowerCase() ||
                                c.name.toLowerCase().includes(ch.category.toLowerCase()))
                        );
                    }

                    // Build permission overwrites
                    const permissionOverwrites = buildPermissionOverwrites(guild, ch, ch.channelType);

                    const channelOptions = {
                        name: ch.name,
                        type: ch.channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
                        reason: 'Created by CheapShot AI via setup_server_structure'
                    };

                    if (parentCategory) {
                        channelOptions.parent = parentCategory.id;
                    }

                    if (ch.channelType === 'text' && ch.topic) {
                        channelOptions.topic = ch.topic;
                    }

                    if (permissionOverwrites.length > 0) {
                        channelOptions.permissionOverwrites = permissionOverwrites;
                    }

                    const channel = await guild.channels.create(channelOptions);

                    const permInfo = [];
                    if (ch.private) permInfo.push('PRIVATE');
                    if (ch.read_only) permInfo.push('READ-ONLY');
                    const permStr = permInfo.length > 0 ? ` [${permInfo.join(', ')}]` : '';

                    logger.info('TOOL', `${ch.channelType} channel "${ch.name}" created successfully (ID: ${channel.id})${permStr}`);

                    return {
                        ...ch,
                        result: {
                            success: true,
                            channel: {
                                id: channel.id,
                                name: channel.name,
                                type: ch.channelType,
                                private: ch.private || false,
                                read_only: ch.read_only || false
                            }
                        },
                        success: true
                    };
                } catch (error) {
                    return { ...ch, result: { success: false, error: error.message }, success: false };
                }
            })
        );

        for (const res of channelResults) {
            const targetResults = res.channelType === 'text' ? results.text_channels : results.voice_channels;
            if (res.success) {
                targetResults.success++;
                targetResults.details.push({ name: res.name, success: true, private: res.private, read_only: res.read_only });
            } else {
                targetResults.failed++;
                targetResults.details.push({ name: res.name, success: false, error: res.result.error });
            }
        }
    }

    // Build summary
    const totalSuccess = results.roles.success + results.categories.success + results.text_channels.success + results.voice_channels.success;
    const totalFailed = results.roles.failed + results.categories.failed + results.text_channels.failed + results.voice_channels.failed;

    logger.info('TOOL', `Server structure setup complete: ${totalSuccess} success, ${totalFailed} failed`);

    // Build a more detailed summary
    const summaryParts = [];
    if (results.roles.success > 0) summaryParts.push(`${results.roles.success} roles`);
    if (results.categories.success > 0) summaryParts.push(`${results.categories.success} categories`);
    if (results.text_channels.success > 0) summaryParts.push(`${results.text_channels.success} text channels`);
    if (results.voice_channels.success > 0) summaryParts.push(`${results.voice_channels.success} voice channels`);

    return {
        success: totalSuccess > 0,
        created: {
            roles: results.roles.success,
            categories: results.categories.success,
            text_channels: results.text_channels.success,
            voice_channels: results.voice_channels.success
        },
        failed: {
            roles: results.roles.failed,
            categories: results.categories.failed,
            text_channels: results.text_channels.failed,
            voice_channels: results.voice_channels.failed
        },
        details: results,
        summary: `Created ${summaryParts.join(', ')}${totalFailed > 0 ? ` (${totalFailed} failed)` : ''}`
    };
}

/**
 * Handler for configuring permissions on an existing channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { channel_name, channel_type, private, role_access, role_deny, read_only, read_only_except, sync_with_category }
 * @returns {Promise<{success: boolean, channel?: Object, changes?: Array, error?: string}>}
 */
export async function handleConfigureChannelPermissions(guild, args) {
    const {
        channel_name,
        channel_type = 'any',
        private: isPrivate,
        role_access = [],
        role_deny = [],
        read_only,
        read_only_except = [],
        sync_with_category
    } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot configure channel permissions: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!channel_name || typeof channel_name !== 'string') {
        logger.error('TOOL', 'Cannot configure channel permissions: Invalid channel name');
        return { success: false, error: 'Invalid channel name' };
    }

    try {
        const lowerName = channel_name.toLowerCase();

        // Find matching channel based on type filter
        let channels = guild.channels.cache.filter(ch => {
            const nameMatch = ch.name.toLowerCase() === lowerName ||
                ch.name.toLowerCase().includes(lowerName);

            if (!nameMatch) return false;

            switch (channel_type) {
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

        if (channels.size === 0) {
            logger.warn('TOOL', `No channel found matching "${channel_name}"`);
            return { success: false, error: `No channel found matching "${channel_name}"` };
        }

        // Prefer exact match
        let channel = channels.find(ch => ch.name.toLowerCase() === lowerName);
        if (!channel) {
            channel = channels.first();
        }

        const channelTypeStr = channel.type === ChannelType.GuildCategory ? 'category' :
            channel.type === ChannelType.GuildVoice ? 'voice' : 'text';

        logger.info('TOOL', `Configuring permissions for ${channelTypeStr} "${channel.name}" (ID: ${channel.id})`);

        const changes = [];

        // If sync_with_category is requested, just do that and return
        if (sync_with_category && channel.parent) {
            await channel.lockPermissions();
            changes.push('Synced permissions with parent category');
            logger.info('TOOL', `Synced "${channel.name}" permissions with category "${channel.parent.name}"`);

            return {
                success: true,
                channel: { id: channel.id, name: channel.name, type: channelTypeStr },
                changes,
                summary: `Synced permissions with parent category "${channel.parent.name}"`
            };
        }

        // Build permission overwrites
        const overwrites = [];

        // Handle private setting
        if (isPrivate === true) {
            overwrites.push({
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            });
            changes.push('Made channel private (hidden from @everyone)');
        } else if (isPrivate === false) {
            overwrites.push({
                id: guild.roles.everyone.id,
                allow: [PermissionFlagsBits.ViewChannel]
            });
            changes.push('Made channel public (visible to @everyone)');
        }

        // Handle role_access - grant ViewChannel + appropriate perms
        for (const roleName of role_access) {
            const role = guild.roles.cache.find(r =>
                r.name.toLowerCase() === roleName.toLowerCase() ||
                r.name.toLowerCase().includes(roleName.toLowerCase())
            );
            if (role) {
                const allow = [PermissionFlagsBits.ViewChannel];
                if (channelTypeStr === 'voice') {
                    allow.push(PermissionFlagsBits.Connect, PermissionFlagsBits.Speak);
                } else if (channelTypeStr === 'text') {
                    allow.push(PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory);
                }
                overwrites.push({ id: role.id, allow });
                changes.push(`Granted access to role "${role.name}"`);
            } else {
                logger.warn('TOOL', `Role "${roleName}" not found, skipping`);
            }
        }

        // Handle role_deny - deny ViewChannel
        for (const roleName of role_deny) {
            const role = guild.roles.cache.find(r =>
                r.name.toLowerCase() === roleName.toLowerCase() ||
                r.name.toLowerCase().includes(roleName.toLowerCase())
            );
            if (role) {
                overwrites.push({
                    id: role.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                });
                changes.push(`Denied access to role "${role.name}"`);
            } else {
                logger.warn('TOOL', `Role "${roleName}" not found, skipping`);
            }
        }

        // Handle read_only for text channels
        if (read_only === true && channelTypeStr === 'text') {
            // Find or update @everyone overwrite
            const everyoneOverwrite = overwrites.find(o => o.id === guild.roles.everyone.id);
            if (everyoneOverwrite) {
                if (!everyoneOverwrite.deny) everyoneOverwrite.deny = [];
                everyoneOverwrite.deny.push(PermissionFlagsBits.SendMessages);
            } else {
                overwrites.push({
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.SendMessages]
                });
            }
            changes.push('Made channel read-only (SendMessages denied)');

            // Allow specified roles to send messages
            for (const roleName of read_only_except) {
                const role = guild.roles.cache.find(r =>
                    r.name.toLowerCase() === roleName.toLowerCase() ||
                    r.name.toLowerCase().includes(roleName.toLowerCase())
                );
                if (role) {
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
                    changes.push(`"${role.name}" can still send messages`);
                }
            }
        } else if (read_only === false && channelTypeStr === 'text') {
            // Find or update @everyone overwrite to allow sending
            const everyoneOverwrite = overwrites.find(o => o.id === guild.roles.everyone.id);
            if (everyoneOverwrite) {
                if (!everyoneOverwrite.allow) everyoneOverwrite.allow = [];
                everyoneOverwrite.allow.push(PermissionFlagsBits.SendMessages);
            } else {
                overwrites.push({
                    id: guild.roles.everyone.id,
                    allow: [PermissionFlagsBits.SendMessages]
                });
            }
            changes.push('Enabled sending messages for @everyone');
        }

        // Apply all permission overwrites IN PARALLEL for speed
        if (overwrites.length > 0) {
            await Promise.all(
                overwrites.map(overwrite =>
                    channel.permissionOverwrites.edit(overwrite.id, {
                        ...(overwrite.allow ? Object.fromEntries(overwrite.allow.map(p => [getPermissionName(p), true])) : {}),
                        ...(overwrite.deny ? Object.fromEntries(overwrite.deny.map(p => [getPermissionName(p), false])) : {})
                    })
                )
            );
        }

        logger.info('TOOL', `Configured permissions for "${channel.name}": ${changes.join(', ')}`);

        return {
            success: true,
            channel: {
                id: channel.id,
                name: channel.name,
                type: channelTypeStr
            },
            changes,
            summary: changes.length > 0 ? changes.join('; ') : 'No changes made'
        };

    } catch (error) {
        logger.error('TOOL', `Failed to configure channel permissions: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to configure channel permissions'
        };
    }
}

/**
 * Helper function to get permission name from PermissionFlagsBits value
 * @param {bigint} permissionBit - The permission flag bit
 * @returns {string} The permission name
 */
function getPermissionName(permissionBit) {
    for (const [name, value] of Object.entries(PermissionFlagsBits)) {
        if (value === permissionBit) return name;
    }
    return 'Unknown';
}

// ============================================================
// ROLE MANAGEMENT HANDLERS
// ============================================================

/**
 * Color name to hex code mapping
 */
const COLOR_MAP = {
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
function parseColor(colorInput) {
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

/**
 * Parse permission names into PermissionFlagsBits values
 * @param {string[]} permissionNames - Array of permission names
 * @returns {{valid: bigint[], invalid: string[]}} Valid permission bits and invalid names
 */
function parsePermissions(permissionNames) {
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
 * Find a role by name (exact or partial match)
 * @param {Object} guild - Discord guild object
 * @param {string} name - Role name to find
 * @returns {Object|null} The role if found, or null
 */
function findRole(guild, name) {
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
async function findMember(guild, identifier) {
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
 * Handler for creating a role
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, color?, hoist?, mentionable?, permissions? }
 * @returns {Promise<{success: boolean, role?: Object, error?: string}>}
 */
export async function handleCreateRole(guild, args) {
    const { name, color, hoist = false, mentionable = false, permissions = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot create role: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot create role: Invalid name');
        return { success: false, error: 'Invalid role name' };
    }

    try {
        logger.info('TOOL', `Creating role "${name}" in guild ${guild.name}`);

        const roleOptions = {
            name: name,
            hoist: Boolean(hoist),
            mentionable: Boolean(mentionable),
            reason: 'Created by CheapShot AI via tool call'
        };

        // Parse and apply color
        if (color) {
            const parsedColor = parseColor(color);
            if (parsedColor !== null) {
                roleOptions.color = parsedColor;
            } else {
                logger.warn('TOOL', `Invalid color "${color}", using default`);
            }
        }

        // Parse and apply permissions
        if (permissions && permissions.length > 0) {
            const { valid, invalid } = parsePermissions(permissions);
            if (valid.length > 0) {
                roleOptions.permissions = valid;
            }
            if (invalid.length > 0) {
                logger.warn('TOOL', `Invalid permissions ignored: ${invalid.join(', ')}`);
            }
        }

        const role = await guild.roles.create(roleOptions);

        logger.info('TOOL', `Role "${name}" created successfully (ID: ${role.id})`);

        return {
            success: true,
            role: {
                id: role.id,
                name: role.name,
                color: role.hexColor,
                hoist: role.hoist,
                mentionable: role.mentionable,
                position: role.position
            }
        };

    } catch (error) {
        logger.error('TOOL', `Failed to create role: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to create role'
        };
    }
}

/**
 * Handler for deleting a role
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name }
 * @returns {Promise<{success: boolean, deleted?: Object, error?: string}>}
 */
export async function handleDeleteRole(guild, args) {
    const { name } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot delete role: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot delete role: Invalid name');
        return { success: false, error: 'Invalid role name' };
    }

    try {
        const role = findRole(guild, name);

        if (!role) {
            logger.warn('TOOL', `No role found matching "${name}"`);
            return { success: false, error: `No role found matching "${name}"` };
        }

        // Check if role is manageable
        if (!role.editable) {
            return { success: false, error: `Cannot delete role "${role.name}" - it's higher than my highest role or is a bot role` };
        }

        const roleName = role.name;
        const roleId = role.id;

        logger.info('TOOL', `Deleting role "${roleName}" (ID: ${roleId}) in guild ${guild.name}`);

        await role.delete('Deleted by CheapShot AI via tool call');

        logger.info('TOOL', `Role "${roleName}" deleted successfully`);

        return {
            success: true,
            deleted: {
                id: roleId,
                name: roleName
            }
        };

    } catch (error) {
        logger.error('TOOL', `Failed to delete role: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to delete role'
        };
    }
}

/**
 * Handler for bulk deleting multiple roles at once
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { roles: Array<string> }
 * @returns {Promise<{success: boolean, deleted?: Array, failed?: Array, summary?: string, error?: string}>}
 */
export async function handleDeleteRolesBulk(guild, args) {
    const { roles = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot bulk delete roles: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!Array.isArray(roles) || roles.length === 0) {
        logger.error('TOOL', 'Cannot bulk delete roles: No roles specified');
        return { success: false, error: 'No roles specified for deletion' };
    }

    logger.info('TOOL', `Bulk deleting ${roles.length} roles in parallel`);

    // Execute all deletions in parallel
    const deletePromises = roles.map(async (roleName) => {
        try {
            const result = await handleDeleteRole(guild, { name: roleName });
            return {
                name: roleName,
                ...result
            };
        } catch (error) {
            return {
                name: roleName,
                success: false,
                error: error.message
            };
        }
    });

    const results = await Promise.all(deletePromises);

    const deleted = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    logger.info('TOOL', `Bulk role delete complete: ${deleted.length} deleted, ${failed.length} failed`);

    return {
        success: deleted.length > 0,
        deleted: deleted.map(r => ({ name: r.deleted?.name || r.name })),
        failed: failed.map(r => ({ name: r.name, error: r.error })),
        summary: `Deleted ${deleted.length} role${deleted.length !== 1 ? 's' : ''}${failed.length > 0 ? `, ${failed.length} failed` : ''}`
    };
}

/**
 * Handler for editing a role
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, new_name?, color?, hoist?, mentionable?, add_permissions?, remove_permissions? }
 * @returns {Promise<{success: boolean, role?: Object, changes?: Array, error?: string}>}
 */
export async function handleEditRole(guild, args) {
    const { name, new_name, color, hoist, mentionable, add_permissions = [], remove_permissions = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot edit role: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot edit role: Invalid name');
        return { success: false, error: 'Invalid role name' };
    }

    try {
        const role = findRole(guild, name);

        if (!role) {
            logger.warn('TOOL', `No role found matching "${name}"`);
            return { success: false, error: `No role found matching "${name}"` };
        }

        // Check if role is editable
        if (!role.editable) {
            return { success: false, error: `Cannot edit role "${role.name}" - it's higher than my highest role or is a bot role` };
        }

        const changes = [];
        const editOptions = {
            reason: 'Edited by CheapShot AI via tool call'
        };

        // Apply new name
        if (new_name && new_name !== role.name) {
            editOptions.name = new_name;
            changes.push(`renamed from "${role.name}" to "${new_name}"`);
        }

        // Apply new color
        if (color !== undefined) {
            const parsedColor = parseColor(color);
            if (parsedColor !== null) {
                editOptions.color = parsedColor;
                changes.push(`color changed to ${color}`);
            }
        }

        // Apply hoist setting
        if (hoist !== undefined && hoist !== role.hoist) {
            editOptions.hoist = Boolean(hoist);
            changes.push(`hoist ${hoist ? 'enabled' : 'disabled'}`);
        }

        // Apply mentionable setting
        if (mentionable !== undefined && mentionable !== role.mentionable) {
            editOptions.mentionable = Boolean(mentionable);
            changes.push(`mentionable ${mentionable ? 'enabled' : 'disabled'}`);
        }

        // Handle permission changes
        if (add_permissions.length > 0 || remove_permissions.length > 0) {
            let currentPerms = role.permissions.bitfield;

            if (add_permissions.length > 0) {
                const { valid, invalid } = parsePermissions(add_permissions);
                for (const perm of valid) {
                    currentPerms |= perm;
                }
                if (valid.length > 0) {
                    changes.push(`added ${valid.length} permission(s)`);
                }
            }

            if (remove_permissions.length > 0) {
                const { valid, invalid } = parsePermissions(remove_permissions);
                for (const perm of valid) {
                    currentPerms &= ~perm;
                }
                if (valid.length > 0) {
                    changes.push(`removed ${valid.length} permission(s)`);
                }
            }

            editOptions.permissions = currentPerms;
        }

        if (changes.length === 0) {
            return { success: false, error: 'No changes specified' };
        }

        logger.info('TOOL', `Editing role "${role.name}": ${changes.join(', ')}`);

        const updatedRole = await role.edit(editOptions);

        logger.info('TOOL', `Role "${updatedRole.name}" edited successfully`);

        return {
            success: true,
            role: {
                id: updatedRole.id,
                name: updatedRole.name,
                color: updatedRole.hexColor,
                hoist: updatedRole.hoist,
                mentionable: updatedRole.mentionable,
                position: updatedRole.position
            },
            changes
        };

    } catch (error) {
        logger.error('TOOL', `Failed to edit role: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to edit role'
        };
    }
}

/**
 * Handler for listing roles
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { include_permissions? }
 * @returns {Promise<{success: boolean, roles?: Array, summary?: string, error?: string}>}
 */
export async function handleListRoles(guild, args) {
    const { include_permissions = false } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot list roles: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        // Get all roles sorted by position (highest first, excluding @everyone)
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(r => {
                const roleData = {
                    name: r.name,
                    id: r.id,
                    color: r.hexColor,
                    members: r.members.size,
                    hoist: r.hoist,
                    mentionable: r.mentionable,
                    position: r.position
                };

                if (include_permissions) {
                    // Get key permissions as readable names
                    const keyPerms = [];
                    if (r.permissions.has(PermissionFlagsBits.Administrator)) keyPerms.push('Administrator');
                    if (r.permissions.has(PermissionFlagsBits.ManageChannels)) keyPerms.push('ManageChannels');
                    if (r.permissions.has(PermissionFlagsBits.ManageRoles)) keyPerms.push('ManageRoles');
                    if (r.permissions.has(PermissionFlagsBits.ManageMessages)) keyPerms.push('ManageMessages');
                    if (r.permissions.has(PermissionFlagsBits.KickMembers)) keyPerms.push('KickMembers');
                    if (r.permissions.has(PermissionFlagsBits.BanMembers)) keyPerms.push('BanMembers');
                    if (r.permissions.has(PermissionFlagsBits.ModerateMembers)) keyPerms.push('ModerateMembers');
                    if (r.permissions.has(PermissionFlagsBits.MentionEveryone)) keyPerms.push('MentionEveryone');
                    roleData.key_permissions = keyPerms;
                }

                return roleData;
            });

        // Build summary
        let summaryLines = [`🎭 **Server Roles** (${roles.length} total):`];
        for (const r of roles) {
            let line = `  • **${r.name}** ${r.color !== '#000000' ? `[${r.color}]` : ''} - ${r.members} member${r.members !== 1 ? 's' : ''}`;
            if (r.hoist) line += ' 📌';
            if (r.mentionable) line += ' @';
            if (include_permissions && r.key_permissions?.length > 0) {
                line += ` (${r.key_permissions.join(', ')})`;
            }
            summaryLines.push(line);
        }

        logger.info('TOOL', `Listed ${roles.length} roles in guild ${guild.name}`);

        return {
            success: true,
            roles,
            summary: summaryLines.join('\n')
        };

    } catch (error) {
        logger.error('TOOL', `Failed to list roles: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to list roles'
        };
    }
}

/**
 * Handler for assigning or removing a role from a member
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { role_name, member, action? }
 * @returns {Promise<{success: boolean, member?: Object, role?: Object, action?: string, error?: string}>}
 */
export async function handleAssignRole(guild, args) {
    const { role_name, member: memberIdentifier, action = 'add' } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot assign role: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!role_name || typeof role_name !== 'string') {
        logger.error('TOOL', 'Cannot assign role: Invalid role name');
        return { success: false, error: 'Invalid role name' };
    }

    if (!memberIdentifier || typeof memberIdentifier !== 'string') {
        logger.error('TOOL', 'Cannot assign role: Invalid member identifier');
        return { success: false, error: 'Invalid member identifier' };
    }

    try {
        // Find the role
        const role = findRole(guild, role_name);
        if (!role) {
            return { success: false, error: `No role found matching "${role_name}"` };
        }

        // Check if role is assignable by the bot
        if (!role.editable) {
            return { success: false, error: `Cannot assign role "${role.name}" - it's higher than my highest role` };
        }

        // Find the member
        const member = await findMember(guild, memberIdentifier);
        if (!member) {
            return { success: false, error: `No member found matching "${memberIdentifier}"` };
        }

        const isAdd = action.toLowerCase() === 'add';
        const hasRole = member.roles.cache.has(role.id);

        // Check if change is needed
        if (isAdd && hasRole) {
            return {
                success: true,
                member: { name: member.displayName, id: member.id },
                role: { name: role.name, id: role.id },
                action: 'none',
                message: `${member.displayName} already has the ${role.name} role`
            };
        }
        if (!isAdd && !hasRole) {
            return {
                success: true,
                member: { name: member.displayName, id: member.id },
                role: { name: role.name, id: role.id },
                action: 'none',
                message: `${member.displayName} doesn't have the ${role.name} role`
            };
        }

        // Apply the change
        logger.info('TOOL', `${isAdd ? 'Adding' : 'Removing'} role "${role.name}" ${isAdd ? 'to' : 'from'} ${member.displayName}`);

        if (isAdd) {
            await member.roles.add(role, 'Assigned by CheapShot AI via tool call');
        } else {
            await member.roles.remove(role, 'Removed by CheapShot AI via tool call');
        }

        logger.info('TOOL', `Successfully ${isAdd ? 'added' : 'removed'} role "${role.name}" ${isAdd ? 'to' : 'from'} ${member.displayName}`);

        return {
            success: true,
            member: { name: member.displayName, id: member.id },
            role: { name: role.name, id: role.id },
            action: isAdd ? 'added' : 'removed'
        };

    } catch (error) {
        logger.error('TOOL', `Failed to assign role: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to assign role'
        };
    }
}

/**
 * Handler for setting up multiple roles at once in parallel
 * Similar to handleSetupServerStructure but for roles
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { roles: Array<{name, color?, hoist?, mentionable?, permissions?}> }
 * @returns {Promise<{success: boolean, created?: Object, failed?: Object, summary?: string, error?: string}>}
 */
export async function handleSetupRoles(guild, args) {
    const { roles = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot setup roles: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!Array.isArray(roles) || roles.length === 0) {
        logger.error('TOOL', 'Cannot setup roles: No roles specified');
        return { success: false, error: 'No roles specified' };
    }

    logger.info('TOOL', `Setting up ${roles.length} roles in parallel`);

    const results = {
        success: 0,
        failed: 0,
        details: []
    };

    // Create all roles in parallel
    const rolePromises = roles.map(async (roleConfig, index) => {
        try {
            const result = await handleCreateRole(guild, {
                name: roleConfig.name,
                color: roleConfig.color,
                hoist: roleConfig.hoist,
                mentionable: roleConfig.mentionable,
                permissions: roleConfig.permissions
            });
            return {
                ...roleConfig,
                result,
                success: result.success,
                index // Track original order for positioning
            };
        } catch (error) {
            return {
                ...roleConfig,
                result: { success: false, error: error.message },
                success: false,
                index
            };
        }
    });

    const roleResults = await Promise.all(rolePromises);

    // Collect results
    const createdRoles = [];
    for (const res of roleResults) {
        if (res.success) {
            results.success++;
            results.details.push({
                name: res.name,
                color: res.result.role?.color,
                success: true
            });
            createdRoles.push({
                role: res.result.role,
                index: res.index
            });
        } else {
            results.failed++;
            results.details.push({
                name: res.name,
                success: false,
                error: res.result.error
            });
        }
    }

    // Try to reorder roles based on original order (first = highest)
    // Discord creates roles at position 1 by default, so we need to reposition
    if (createdRoles.length > 1) {
        try {
            // Sort by original index (first in array should be highest)
            createdRoles.sort((a, b) => a.index - b.index);

            // Get the bot's highest manageable position
            const botMember = guild.members.me;
            const botHighestRole = botMember.roles.highest;
            const maxPosition = botHighestRole.position - 1;

            // Build position array - first role gets highest position
            const positionUpdates = createdRoles.map((item, idx) => ({
                role: item.role.id,
                position: Math.max(1, maxPosition - idx)
            }));

            await guild.roles.setPositions(positionUpdates);
            logger.debug('TOOL', `Repositioned ${createdRoles.length} roles in hierarchy`);
        } catch (e) {
            // Non-fatal - roles are created, just not in ideal order
            logger.warn('TOOL', `Could not reposition roles: ${e.message}`);
        }
    }

    logger.info('TOOL', `Role setup complete: ${results.success} created, ${results.failed} failed`);

    return {
        success: results.success > 0,
        created: results.success,
        failed: results.failed,
        details: results.details,
        summary: `Created ${results.success} role${results.success !== 1 ? 's' : ''}${results.failed > 0 ? `, ${results.failed} failed` : ''}`
    };
}

// ============================================================
// VOICE CHANNEL HANDLERS
// ============================================================

/**
 * Find a voice channel by name
 * @param {Object} guild - Discord guild object
 * @param {string} name - Voice channel name to find
 * @returns {Object|null} The voice channel if found, or null
 */
function findVoiceChannel(guild, name) {
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
 * Handler for joining a voice channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { channel_name?, start_listening?, conversation_mode? }
 * @param {Object} context - Additional context { member, message }
 * @returns {Promise<{success: boolean, channel?: Object, error?: string}>}
 */
export async function handleJoinVoice(guild, args, context = {}) {
    const { channel_name, start_listening = true, conversation_mode = true } = args;
    const { member, message } = context;

    if (!guild) {
        logger.error('TOOL', 'Cannot join voice: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        let voiceChannel = null;

        // If channel name specified, find it
        if (channel_name) {
            voiceChannel = findVoiceChannel(guild, channel_name);
            if (!voiceChannel) {
                return { success: false, error: `No voice channel found matching "${channel_name}"` };
            }
        }
        // Otherwise, try to join the user's current voice channel
        else if (member?.voice?.channel) {
            voiceChannel = member.voice.channel;
        } else {
            return { success: false, error: "No channel specified and user is not in a voice channel" };
        }

        // Get text channel for transcripts (use the message channel if available)
        const textChannel = message?.channel || null;

        logger.info('TOOL', `Joining voice channel "${voiceChannel.name}" in guild ${guild.name}`);

        // Join the voice channel
        const connection = await voiceClient.join(voiceChannel, textChannel);

        if (!connection) {
            return { success: false, error: 'Failed to join voice channel' };
        }

        // Start listening if requested
        if (start_listening) {
            await voiceClient.startListening(guild.id);
        }

        // Enable conversation mode if requested
        if (conversation_mode) {
            voiceClient.setConversationMode(guild.id, true);
        }

        // Import recent text channel messages for context
        // This gives the AI knowledge of what was being discussed before joining
        let importedContext = 0;
        if (textChannel) {
            // Get the bot's user ID to identify our own messages
            const botId = message?.client?.user?.id || null;
            importedContext = await voiceMemory.importTextChannelContext(
                guild.id,
                textChannel,
                10, // Fetch last 10 messages
                botId
            );
        }

        logger.info('TOOL', `Successfully joined voice channel "${voiceChannel.name}"${importedContext > 0 ? ` with ${importedContext} messages of context` : ''}`);

        return {
            success: true,
            channel: {
                id: voiceChannel.id,
                name: voiceChannel.name
            },
            listening: start_listening,
            conversationMode: conversation_mode,
            contextImported: importedContext,
            message: `Joined "${voiceChannel.name}"${start_listening ? ' and started listening' : ''}${conversation_mode ? ' in conversation mode' : ''}${importedContext > 0 ? ` (loaded ${importedContext} messages of chat context)` : ''}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to join voice channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to join voice channel'
        };
    }
}

/**
 * Handler for leaving a voice channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments (none required)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function handleLeaveVoice(guild, args) {
    if (!guild) {
        logger.error('TOOL', 'Cannot leave voice: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        // Check if we're in a voice channel
        const isConnected = voiceClient.isConnected(guild.id);

        if (!isConnected) {
            return { success: false, error: "I'm not in a voice channel" };
        }

        logger.info('TOOL', `Leaving voice channel in guild ${guild.name}`);

        await voiceClient.leave(guild.id);

        logger.info('TOOL', `Successfully left voice channel`);

        return {
            success: true,
            message: 'Left the voice channel'
        };

    } catch (error) {
        logger.error('TOOL', `Failed to leave voice channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to leave voice channel'
        };
    }
}

/**
 * Handler for toggling voice conversation mode
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { enabled }
 * @returns {Promise<{success: boolean, enabled?: boolean, error?: string}>}
 */
export async function handleVoiceConversation(guild, args) {
    const { enabled } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot toggle conversation mode: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (enabled === undefined) {
        return { success: false, error: 'Must specify whether to enable or disable conversation mode' };
    }

    try {
        // Check if we're in a voice channel
        const isConnected = voiceClient.isConnected(guild.id);

        if (!isConnected) {
            return { success: false, error: "I'm not in a voice channel. Use join_voice first." };
        }

        logger.info('TOOL', `${enabled ? 'Enabling' : 'Disabling'} conversation mode in guild ${guild.name}`);

        voiceClient.setConversationMode(guild.id, enabled);

        // Also start/stop listening based on conversation mode
        if (enabled) {
            await voiceClient.startListening(guild.id);
        }

        logger.info('TOOL', `Conversation mode ${enabled ? 'enabled' : 'disabled'}`);

        return {
            success: true,
            enabled: enabled,
            message: `Conversation mode ${enabled ? 'enabled - I will now respond to voice' : 'disabled - I will stop responding to voice'}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to toggle conversation mode: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to toggle conversation mode'
        };
    }
}

/**
 * Find a member by name or ID - optimized to avoid fetching all members
 * @param {Object} guild - Discord guild object
 * @param {string} identifier - Username, display name, ID, or mention
 * @returns {Promise<Object|null>} The member if found, or null
 */
async function findMemberSmart(guild, identifier) {
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

/**
 * Handler for moving a member to another voice channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { member, target_channel }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function handleMoveMember(guild, args) {
    const { member: memberName, target_channel: targetChannelName } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot move member: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!memberName) {
        return { success: false, error: 'Must specify which member to move' };
    }

    if (!targetChannelName) {
        return { success: false, error: 'Must specify target voice channel' };
    }

    try {
        // Find the member using smart lookup (avoids timeouts)
        const targetMember = await findMemberSmart(guild, memberName);

        if (!targetMember) {
            return { success: false, error: `Could not find member "${memberName}"` };
        }

        // Check if member is in a voice channel
        if (!targetMember.voice?.channel) {
            return { success: false, error: `${targetMember.displayName} is not in a voice channel` };
        }

        const currentChannel = targetMember.voice.channel;

        // Find the target voice channel
        const targetChannel = findVoiceChannel(guild, targetChannelName);

        if (!targetChannel) {
            return { success: false, error: `Could not find voice channel "${targetChannelName}"` };
        }

        // Check if they're already in the target channel
        if (currentChannel.id === targetChannel.id) {
            return { success: true, message: `${targetMember.displayName} is already in ${targetChannel.name}` };
        }

        logger.info('TOOL', `Moving ${targetMember.displayName} from "${currentChannel.name}" to "${targetChannel.name}"`);

        // Move the member
        await targetMember.voice.setChannel(targetChannel);

        logger.info('TOOL', `Successfully moved ${targetMember.displayName} to "${targetChannel.name}"`);

        return {
            success: true,
            member: {
                id: targetMember.id,
                name: targetMember.displayName
            },
            from_channel: {
                id: currentChannel.id,
                name: currentChannel.name
            },
            to_channel: {
                id: targetChannel.id,
                name: targetChannel.name
            },
            message: `Moved ${targetMember.displayName} from "${currentChannel.name}" to "${targetChannel.name}"`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to move member: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to move member'
        };
    }
}

/**
 * Handler for listing voice channels and their members
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments (none required)
 * @returns {Promise<{success: boolean, channels?: Array, error?: string}>}
 */
export async function handleListVoiceChannels(guild, args) {
    if (!guild) {
        logger.error('TOOL', 'Cannot list voice channels: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        const { ChannelType } = await import('discord.js');

        // Get all voice channels
        const voiceChannels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
            .sort((a, b) => a.position - b.position);

        if (voiceChannels.size === 0) {
            return {
                success: true,
                channels: [],
                message: 'No voice channels found in this server'
            };
        }

        // Build list with members
        const channelList = [];

        for (const [id, channel] of voiceChannels) {
            const members = channel.members.map(m => ({
                id: m.id,
                name: m.displayName,
                username: m.user.username
            }));

            channelList.push({
                id: channel.id,
                name: channel.name,
                category: channel.parent?.name || null,
                memberCount: members.length,
                members: members
            });
        }

        // Create a readable summary
        const summary = channelList.map(ch => {
            const membersStr = ch.members.length > 0
                ? ch.members.map(m => m.name).join(', ')
                : '(empty)';
            return `• ${ch.name}: ${membersStr}`;
        }).join('\n');

        logger.info('TOOL', `Listed ${channelList.length} voice channels`);

        return {
            success: true,
            channels: channelList,
            summary: summary,
            message: `Found ${channelList.length} voice channels:\n${summary}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to list voice channels: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to list voice channels'
        };
    }
}

/**
 * Handler for moving multiple members to a voice channel at once
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { members: string[], target_channel: string }
 * @returns {Promise<{success: boolean, moved?: Array, failed?: Array, error?: string}>}
 */
export async function handleMoveMembersBulk(guild, args) {
    const { members: memberNames, target_channel: targetChannelName } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot move members: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!memberNames || !Array.isArray(memberNames) || memberNames.length === 0) {
        return { success: false, error: 'Must specify which members to move (array of names)' };
    }

    if (!targetChannelName) {
        return { success: false, error: 'Must specify target voice channel' };
    }

    // Find the target voice channel first
    const targetChannel = findVoiceChannel(guild, targetChannelName);
    if (!targetChannel) {
        return { success: false, error: `Could not find voice channel "${targetChannelName}"` };
    }

    const moved = [];
    const failed = [];

    // Move each member
    for (const memberName of memberNames) {
        try {
            const result = await handleMoveMember(guild, {
                member: memberName,
                target_channel: targetChannelName
            });

            if (result.success) {
                moved.push({
                    name: result.member?.name || memberName,
                    from: result.from_channel?.name,
                    to: result.to_channel?.name
                });
            } else {
                failed.push({
                    name: memberName,
                    error: result.error
                });
            }
        } catch (error) {
            failed.push({
                name: memberName,
                error: error.message
            });
        }
    }

    const success = moved.length > 0;
    let message = '';

    if (moved.length > 0) {
        message = `Moved ${moved.length} member${moved.length !== 1 ? 's' : ''} to "${targetChannel.name}"`;
        if (failed.length > 0) {
            message += `, ${failed.length} failed`;
        }
    } else {
        message = `Failed to move any members: ${failed.map(f => f.error).join('; ')}`;
    }

    logger.info('TOOL', `Bulk move complete: ${moved.length} moved, ${failed.length} failed`);

    return {
        success,
        moved,
        failed,
        target_channel: {
            id: targetChannel.id,
            name: targetChannel.name
        },
        message
    };
}

// ============================================================
// UTILITY / INFO HANDLERS
// ============================================================

/**
 * Handler for checking a user's permissions
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { member?: string }
 * @param {Object} context - Additional context { member }
 * @returns {Promise<{success: boolean, permissions?: Object, error?: string}>}
 */
export async function handleCheckPerms(guild, args, context = {}) {
    const { member: memberIdentifier } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot check perms: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        let targetMember;

        // If no member specified, check the requesting user's permissions
        if (!memberIdentifier) {
            targetMember = context.member;
            if (!targetMember) {
                return { success: false, error: 'Could not determine which user to check. Please specify a user.' };
            }
        } else {
            // Try to find the member
            targetMember = await findMemberSmart(guild, memberIdentifier);
            if (!targetMember) {
                return { success: false, error: `Could not find user "${memberIdentifier}"` };
            }
        }

        // Get permissions
        const permissions = targetMember.permissions;

        // Build a comprehensive permissions object
        const permCategories = {
            general: {
                Administrator: permissions.has(PermissionFlagsBits.Administrator),
                ViewChannel: permissions.has(PermissionFlagsBits.ViewChannel),
                ManageChannels: permissions.has(PermissionFlagsBits.ManageChannels),
                ManageRoles: permissions.has(PermissionFlagsBits.ManageRoles),
                ManageGuild: permissions.has(PermissionFlagsBits.ManageGuild),
                ManageWebhooks: permissions.has(PermissionFlagsBits.ManageWebhooks),
                ManageEmojisAndStickers: permissions.has(PermissionFlagsBits.ManageEmojisAndStickers),
            },
            membership: {
                CreateInstantInvite: permissions.has(PermissionFlagsBits.CreateInstantInvite),
                ChangeNickname: permissions.has(PermissionFlagsBits.ChangeNickname),
                ManageNicknames: permissions.has(PermissionFlagsBits.ManageNicknames),
                KickMembers: permissions.has(PermissionFlagsBits.KickMembers),
                BanMembers: permissions.has(PermissionFlagsBits.BanMembers),
                ModerateMembers: permissions.has(PermissionFlagsBits.ModerateMembers),
            },
            text: {
                SendMessages: permissions.has(PermissionFlagsBits.SendMessages),
                SendMessagesInThreads: permissions.has(PermissionFlagsBits.SendMessagesInThreads),
                CreatePublicThreads: permissions.has(PermissionFlagsBits.CreatePublicThreads),
                CreatePrivateThreads: permissions.has(PermissionFlagsBits.CreatePrivateThreads),
                EmbedLinks: permissions.has(PermissionFlagsBits.EmbedLinks),
                AttachFiles: permissions.has(PermissionFlagsBits.AttachFiles),
                AddReactions: permissions.has(PermissionFlagsBits.AddReactions),
                UseExternalEmojis: permissions.has(PermissionFlagsBits.UseExternalEmojis),
                UseExternalStickers: permissions.has(PermissionFlagsBits.UseExternalStickers),
                MentionEveryone: permissions.has(PermissionFlagsBits.MentionEveryone),
                ManageMessages: permissions.has(PermissionFlagsBits.ManageMessages),
                ManageThreads: permissions.has(PermissionFlagsBits.ManageThreads),
                ReadMessageHistory: permissions.has(PermissionFlagsBits.ReadMessageHistory),
                SendTTSMessages: permissions.has(PermissionFlagsBits.SendTTSMessages),
                UseApplicationCommands: permissions.has(PermissionFlagsBits.UseApplicationCommands),
            },
            voice: {
                Connect: permissions.has(PermissionFlagsBits.Connect),
                Speak: permissions.has(PermissionFlagsBits.Speak),
                Stream: permissions.has(PermissionFlagsBits.Stream),
                UseVAD: permissions.has(PermissionFlagsBits.UseVAD),
                PrioritySpeaker: permissions.has(PermissionFlagsBits.PrioritySpeaker),
                MuteMembers: permissions.has(PermissionFlagsBits.MuteMembers),
                DeafenMembers: permissions.has(PermissionFlagsBits.DeafenMembers),
                MoveMembers: permissions.has(PermissionFlagsBits.MoveMembers),
            }
        };

        // Build a quick summary of key permissions
        const keyPerms = [];
        if (permCategories.general.Administrator) keyPerms.push('👑 Administrator');
        if (permCategories.general.ManageGuild) keyPerms.push('⚙️ Manage Server');
        if (permCategories.general.ManageChannels) keyPerms.push('📁 Manage Channels');
        if (permCategories.general.ManageRoles) keyPerms.push('🎭 Manage Roles');
        if (permCategories.membership.KickMembers) keyPerms.push('👢 Kick Members');
        if (permCategories.membership.BanMembers) keyPerms.push('🔨 Ban Members');
        if (permCategories.membership.ModerateMembers) keyPerms.push('⏰ Timeout Members');
        if (permCategories.voice.MoveMembers) keyPerms.push('📍 Move Members');
        if (permCategories.text.ManageMessages) keyPerms.push('🗑️ Manage Messages');

        // Get roles
        const roles = targetMember.roles.cache
            .filter(r => r.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(r => r.name);

        const summary = `**${targetMember.displayName}** (@${targetMember.user.tag})\n` +
            `🎭 Roles: ${roles.length > 0 ? roles.join(', ') : 'None'}\n` +
            `🔑 Key Permissions: ${keyPerms.length > 0 ? keyPerms.join(', ') : 'Basic member permissions'}`;

        logger.info('TOOL', `Checked permissions for ${targetMember.displayName}`);

        return {
            success: true,
            member: {
                id: targetMember.id,
                username: targetMember.user.tag,
                displayName: targetMember.displayName,
                roles: roles,
                isAdmin: permCategories.general.Administrator,
                isOwner: guild.ownerId === targetMember.id
            },
            permissions: permCategories,
            key_permissions: keyPerms,
            summary
        };

    } catch (error) {
        logger.error('TOOL', `Failed to check permissions: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to check permissions'
        };
    }
}
