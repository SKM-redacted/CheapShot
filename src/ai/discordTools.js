import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';

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

        // Categories
        if (result.categories.length > 0) {
            summaryLines.push(`📁 Categories: ${result.categories.map(c => c.name).join(', ')}`);
        }

        // Text channels grouped by category
        if (result.text_channels.length > 0) {
            const byCategory = {};
            for (const ch of result.text_channels) {
                const cat = ch.category || 'No Category';
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push(`#${ch.name}`);
            }
            summaryLines.push(`💬 Text Channels:`);
            for (const [cat, channels] of Object.entries(byCategory)) {
                summaryLines.push(`  [${cat}]: ${channels.join(', ')}`);
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
            summaryLines.push(`🔊 Voice Channels:`);
            for (const [cat, channels] of Object.entries(byCategory)) {
                summaryLines.push(`  [${cat}]: ${channels.join(', ')}`);
            }
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

/**
 * Handler for setting up a complete server structure in parallel
 * Creates categories first, then all channels at once
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { categories: Array, text_channels: Array, voice_channels: Array }
 * @returns {Promise<{success: boolean, created?: Object, failed?: Object, summary?: string, error?: string}>}
 */
export async function handleSetupServerStructure(guild, args) {
    const { categories = [], text_channels = [], voice_channels = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot setup server structure: No guild context');
        return { success: false, error: 'No server context available' };
    }

    const totalItems = categories.length + text_channels.length + voice_channels.length;
    if (totalItems === 0) {
        logger.error('TOOL', 'Cannot setup server structure: No items specified');
        return { success: false, error: 'No categories or channels specified' };
    }

    logger.info('TOOL', `Setting up server structure: ${categories.length} categories, ${text_channels.length} text, ${voice_channels.length} voice`);

    const results = {
        categories: { success: 0, failed: 0, details: [] },
        text_channels: { success: 0, failed: 0, details: [] },
        voice_channels: { success: 0, failed: 0, details: [] }
    };

    // Phase 1: Create all categories in parallel
    if (categories.length > 0) {
        logger.info('TOOL', `Phase 1: Creating ${categories.length} categories in parallel`);

        const categoryResults = await Promise.all(
            categories.map(async (cat) => {
                try {
                    const result = await handleCreateCategory(guild, { name: cat.name });
                    return { ...cat, result, success: result.success };
                } catch (error) {
                    return { ...cat, result: { success: false, error: error.message }, success: false };
                }
            })
        );

        for (const res of categoryResults) {
            if (res.success) {
                results.categories.success++;
                results.categories.details.push({ name: res.name, success: true });
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

    // Phase 2: Create all channels (text + voice) in parallel
    const allChannels = [
        ...text_channels.map(ch => ({ ...ch, type: 'text' })),
        ...voice_channels.map(ch => ({ ...ch, type: 'voice' }))
    ];

    if (allChannels.length > 0) {
        logger.info('TOOL', `Phase 2: Creating ${allChannels.length} channels in parallel`);

        const channelResults = await Promise.all(
            allChannels.map(async (ch) => {
                try {
                    let result;
                    if (ch.type === 'text') {
                        result = await handleCreateTextChannel(guild, {
                            name: ch.name,
                            category: ch.category,
                            topic: ch.topic
                        });
                    } else {
                        result = await handleCreateVoiceChannel(guild, {
                            name: ch.name,
                            category: ch.category
                        });
                    }
                    return { ...ch, result, success: result.success };
                } catch (error) {
                    return { ...ch, result: { success: false, error: error.message }, success: false };
                }
            })
        );

        for (const res of channelResults) {
            const targetResults = res.type === 'text' ? results.text_channels : results.voice_channels;
            if (res.success) {
                targetResults.success++;
                targetResults.details.push({ name: res.name, success: true });
            } else {
                targetResults.failed++;
                targetResults.details.push({ name: res.name, success: false, error: res.result.error });
            }
        }
    }

    // Build summary
    const totalSuccess = results.categories.success + results.text_channels.success + results.voice_channels.success;
    const totalFailed = results.categories.failed + results.text_channels.failed + results.voice_channels.failed;

    logger.info('TOOL', `Server structure setup complete: ${totalSuccess} success, ${totalFailed} failed`);

    return {
        success: totalSuccess > 0,
        created: {
            categories: results.categories.success,
            text_channels: results.text_channels.success,
            voice_channels: results.voice_channels.success
        },
        failed: {
            categories: results.categories.failed,
            text_channels: results.text_channels.failed,
            voice_channels: results.voice_channels.failed
        },
        details: results,
        summary: `Created ${results.categories.success} categories, ${results.text_channels.success} text channels, ${results.voice_channels.success} voice channels${totalFailed > 0 ? ` (${totalFailed} failed)` : ''}`
    };
}
