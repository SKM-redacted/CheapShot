/**
 * Discord Tools - Server Management
 * 
 * Handlers for getting server info, editing server settings,
 * setting up server structure, and configuring channel permissions.
 */

import { ChannelType, GuildVerificationLevel, PermissionFlagsBits } from 'discord.js';
import {
    logger,
    findChannel,
    findRole,
    parseColor,
    parsePermissions,
    getPermissionName,
    buildPermissionOverwrites
} from './helpers.js';

// Forward reference - these will be imported via the index
let handleListChannels;
let handleCreateRole;

/**
 * Set the handler references (called from index.js to avoid circular deps)
 */
export function setHandlerReferences(refs) {
    handleListChannels = refs.handleListChannels;
    handleCreateRole = refs.handleCreateRole;
}

// ============================================================
// SERVER INFO HANDLERS
// ============================================================

/**
 * Handler for getting comprehensive server information
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { include_permissions? }
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
        const channelResult = handleListChannels ?
            await handleListChannels(guild, { type: 'all' }) :
            await getChannelList(guild);

        // Get roles info
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
 * Helper function to get channel list (fallback if handleListChannels not available)
 */
async function getChannelList(guild) {
    const categories = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildCategory)
        .map(c => ({ name: c.name, id: c.id }));

    const text_channels = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({ name: c.name, id: c.id, category: c.parent?.name }));

    const voice_channels = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildVoice)
        .map(c => ({ name: c.name, id: c.id, category: c.parent?.name }));

    return {
        success: true,
        categories,
        text_channels,
        voice_channels,
        summary: `${categories.length} categories, ${text_channels.length} text, ${voice_channels.length} voice`
    };
}

// ============================================================
// SERVER SETTINGS HANDLER
// ============================================================

/**
 * Handler for editing server settings
 */
export async function handleEditServer(guild, args) {
    const { name, description, icon_url, banner_url, verification_level } = args;

    const edits = {};
    if (name) edits.name = name;
    if (description !== undefined) edits.description = description;
    if (icon_url) edits.icon = icon_url;
    if (banner_url) edits.banner = banner_url;
    if (verification_level) {
        const levels = {
            'none': GuildVerificationLevel.None,
            'low': GuildVerificationLevel.Low,
            'medium': GuildVerificationLevel.Medium,
            'high': GuildVerificationLevel.High,
            'very_high': GuildVerificationLevel.VeryHigh
        };
        edits.verificationLevel = levels[verification_level];
    }

    if (Object.keys(edits).length === 0) {
        return { success: false, error: 'Must specify at least one setting to edit' };
    }

    try {
        await guild.edit(edits);
        logger.info('TOOL', `Edited server settings: ${Object.keys(edits).join(', ')}`);

        return {
            success: true,
            changes: Object.keys(edits),
            message: `⚙️ Updated server settings: ${Object.keys(edits).join(', ')}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to edit server: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================================
// SERVER STRUCTURE SETUP HANDLER
// ============================================================

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
    if (roles.length > 0 && handleCreateRole) {
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

// ============================================================
// CHANNEL PERMISSIONS HANDLER
// ============================================================

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
