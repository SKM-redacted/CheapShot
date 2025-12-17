/**
 * Discord Tools - Channel Management
 * 
 * Handlers for creating, deleting, editing, and listing channels/categories.
 * Includes bulk operations and convenience wrappers.
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import {
    logger,
    findChannel,
    findBestVoiceCategory,
    findBestTextCategory
} from './helpers.js';

// ============================================================
// CHANNEL CREATION HANDLERS
// ============================================================

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
 * Handler for creating a stage channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, category?, topic? }
 * @returns {Promise<{success: boolean, channel?: Object, error?: string}>}
 */
export async function handleCreateStageChannel(guild, args) {
    const { name, category, topic } = args;

    if (!name) return { success: false, error: 'Must specify channel name' };

    try {
        let parent = null;
        if (category) {
            parent = findChannel(guild, category, 'category');
            if (!parent) return { success: false, error: `Could not find category "${category}"` };
        }

        const channel = await guild.channels.create({
            name,
            type: ChannelType.GuildStageVoice,
            parent: parent?.id,
            topic
        });

        logger.info('TOOL', `Created stage channel "${name}"`);

        return {
            success: true,
            channel: { id: channel.id, name: channel.name, type: 'stage' },
            message: `🎤 Created stage channel "${name}"`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create stage channel: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for creating a forum channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, category?, topic? }
 * @returns {Promise<{success: boolean, channel?: Object, error?: string}>}
 */
export async function handleCreateForumChannel(guild, args) {
    const { name, category, topic } = args;

    if (!name) return { success: false, error: 'Must specify channel name' };

    try {
        let parent = null;
        if (category) {
            parent = findChannel(guild, category, 'category');
            if (!parent) return { success: false, error: `Could not find category "${category}"` };
        }

        const channel = await guild.channels.create({
            name,
            type: ChannelType.GuildForum,
            parent: parent?.id,
            topic
        });

        logger.info('TOOL', `Created forum channel "${name}"`);

        return {
            success: true,
            channel: { id: channel.id, name: channel.name, type: 'forum' },
            message: `💬 Created forum channel "${name}"`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create forum channel: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================================
// CHANNEL DELETION HANDLERS
// ============================================================

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
// CHANNEL LISTING HANDLERS
// ============================================================

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

// ============================================================
// CHANNEL EDITING HANDLERS
// ============================================================

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

// ============================================================
// CHANNEL CONVENIENCE HANDLERS
// ============================================================

/**
 * Handler for renaming any channel (convenience wrapper)
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, new_name }
 * @returns {Promise<{success: boolean, channel?: Object, error?: string}>}
 */
export async function handleRenameChannel(guild, args) {
    const { name, new_name } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot rename channel: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name) {
        return { success: false, error: 'Must specify the channel name to rename' };
    }

    if (!new_name) {
        return { success: false, error: 'Must specify the new name for the channel' };
    }

    try {
        // Find the channel (any type)
        const channel = findChannel(guild, name, 'any');
        if (!channel) {
            return { success: false, error: `Could not find channel "${name}"` };
        }

        const oldName = channel.name;
        const channelType = channel.type === ChannelType.GuildCategory ? 'category' :
            channel.type === ChannelType.GuildVoice ? 'voice' :
                channel.type === ChannelType.GuildStageVoice ? 'stage' : 'text';

        logger.info('TOOL', `Renaming ${channelType} channel "${oldName}" to "${new_name}"`);

        await channel.setName(new_name);

        logger.info('TOOL', `Successfully renamed channel to "${new_name}"`);

        return {
            success: true,
            channel: {
                id: channel.id,
                old_name: oldName,
                new_name: channel.name,
                type: channelType
            },
            message: `Renamed ${channelType} channel "${oldName}" to "${channel.name}"`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to rename channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to rename channel'
        };
    }
}

/**
 * Handler for moving a channel to a different category
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, category }
 * @returns {Promise<{success: boolean, channel?: Object, error?: string}>}
 */
export async function handleMoveChannel(guild, args) {
    const { name, category: categoryName } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot move channel: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name) {
        return { success: false, error: 'Must specify the channel name to move' };
    }

    if (categoryName === undefined) {
        return { success: false, error: 'Must specify the category to move to (use empty string to remove from category)' };
    }

    try {
        // Find the channel (text or voice, not category)
        const channel = findChannel(guild, name, 'any');
        if (!channel) {
            return { success: false, error: `Could not find channel "${name}"` };
        }

        if (channel.type === ChannelType.GuildCategory) {
            return { success: false, error: 'Cannot move a category - categories contain channels, not the other way around' };
        }

        let targetCategory = null;
        const oldCategory = channel.parent?.name || 'no category';

        // If category name is empty, remove from category
        if (categoryName === '' || categoryName === null) {
            targetCategory = null;
        } else {
            // Find the category
            targetCategory = findChannel(guild, categoryName, 'category');
            if (!targetCategory) {
                return { success: false, error: `Could not find category "${categoryName}"` };
            }
        }

        // Check if already in the target category
        if (channel.parentId === (targetCategory?.id || null)) {
            return {
                success: true,
                message: `Channel "${name}" is already in ${targetCategory ? `"${targetCategory.name}"` : 'no category'}`
            };
        }

        logger.info('TOOL', `Moving channel "${name}" from "${oldCategory}" to "${targetCategory?.name || 'no category'}"`);

        await channel.setParent(targetCategory?.id || null);

        logger.info('TOOL', `Successfully moved channel to ${targetCategory?.name || 'no category'}`);

        return {
            success: true,
            channel: {
                id: channel.id,
                name: channel.name,
                type: channel.type === ChannelType.GuildVoice ? 'voice' : 'text'
            },
            from_category: oldCategory,
            to_category: targetCategory?.name || null,
            message: `Moved "${channel.name}" from "${oldCategory}" to "${targetCategory?.name || 'no category'}"`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to move channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to move channel'
        };
    }
}
