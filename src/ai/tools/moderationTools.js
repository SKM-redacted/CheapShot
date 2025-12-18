/**
 * Discord Tools - Moderation
 * 
 * Handlers for kick, ban, timeout, and message management.
 * Includes member search functionality.
 */

import { PermissionFlagsBits } from 'discord.js';
import {
    logger,
    findChannel,
    findMemberSmart,
    parseDuration
} from './helpers.js';

// ============================================================
// PERMISSION CHECKING HANDLERS
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

/**
 * Handler for searching/finding members in the server
 * This is a reconnaissance tool to help find the right user before moderation actions
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { query, limit? }
 * @returns {Promise<{success: boolean, members?: Array, error?: string}>}
 */
export async function handleSearchMembers(guild, args) {
    const { query, limit = 10 } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot search members: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!query || typeof query !== 'string') {
        return { success: false, error: 'Must specify a search query' };
    }

    // Validate limit (1-25)
    const searchLimit = Math.max(1, Math.min(25, limit || 10));

    try {
        logger.info('TOOL', `Searching for members matching "${query}" in ${guild.name} (limit: ${searchLimit})`);

        // Use Discord's member search API - efficient for large servers
        const searchResults = await guild.members.search({ query, limit: searchLimit });

        if (searchResults.size === 0) {
            logger.info('TOOL', `No members found matching "${query}"`);
            return {
                success: true,
                members: [],
                count: 0,
                message: `No members found matching "${query}". Try a different search term or check the spelling.`
            };
        }

        // Format the results with useful info
        const members = searchResults.map(m => ({
            id: m.id,
            username: m.user.username,
            display_name: m.displayName,
            tag: m.user.tag,
            nickname: m.nickname || null,
            joined_at: m.joinedAt?.toISOString() || null,
            roles: m.roles.cache
                .filter(r => r.name !== '@everyone')
                .map(r => r.name)
                .slice(0, 5), // Only show first 5 roles
            is_bot: m.user.bot
        }));

        // Build a human-readable summary
        const summaryLines = [`🔍 **Found ${members.length} member${members.length !== 1 ? 's' : ''} matching "${query}":**`];
        for (const m of members) {
            let line = `  • **${m.display_name}** (${m.username})`;
            if (m.nickname) line += ` [nickname: ${m.nickname}]`;
            if (m.is_bot) line += ' 🤖';
            line += ` - ID: \`${m.id}\``;
            if (m.roles.length > 0) {
                line += ` | Roles: ${m.roles.join(', ')}`;
            }
            summaryLines.push(line);
        }

        logger.info('TOOL', `Found ${members.length} members matching "${query}"`);

        return {
            success: true,
            members,
            count: members.length,
            query,
            summary: summaryLines.join('\n')
        };

    } catch (error) {
        logger.error('TOOL', `Failed to search members: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to search members'
        };
    }
}

// ============================================================
// MODERATION HANDLERS
// ============================================================

/**
 * Handler for kicking a member from the server
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { member, reason? }
 * @returns {Promise<{success: boolean, member?: Object, error?: string}>}
 */
export async function handleKickMember(guild, args) {
    const { member: memberIdentifier, reason } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot kick member: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!memberIdentifier) {
        return { success: false, error: 'Must specify which member to kick' };
    }

    try {
        // Find the member
        const targetMember = await findMemberSmart(guild, memberIdentifier);
        if (!targetMember) {
            return { success: false, error: `Could not find member "${memberIdentifier}"` };
        }

        // Check if the member is kickable
        if (!targetMember.kickable) {
            return { success: false, error: `Cannot kick ${targetMember.displayName} - they may have higher permissions than me` };
        }

        // Check if trying to kick the server owner
        if (targetMember.id === guild.ownerId) {
            return { success: false, error: 'Cannot kick the server owner' };
        }

        logger.info('TOOL', `Kicking ${targetMember.displayName} from ${guild.name}${reason ? ` (Reason: ${reason})` : ''}`);

        await targetMember.kick(reason || 'Kicked by CheapShot AI');

        logger.info('TOOL', `Successfully kicked ${targetMember.displayName}`);

        return {
            success: true,
            member: {
                id: targetMember.id,
                name: targetMember.displayName,
                username: targetMember.user.tag
            },
            reason: reason || 'No reason provided',
            message: `Kicked ${targetMember.displayName} from the server${reason ? ` for: ${reason}` : ''}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to kick member: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to kick member'
        };
    }
}

/**
 * Handler for banning a member from the server
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { member, reason?, delete_messages? }
 * @returns {Promise<{success: boolean, member?: Object, error?: string}>}
 */
export async function handleBanMember(guild, args) {
    const { member: memberIdentifier, reason, delete_messages = 0 } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot ban member: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!memberIdentifier) {
        return { success: false, error: 'Must specify which member to ban' };
    }

    try {
        // Find the member (can also ban by ID for users not in server)
        const targetMember = await findMemberSmart(guild, memberIdentifier);

        // If member not found, try to ban by ID directly
        let targetId = null;
        let targetName = memberIdentifier;

        if (targetMember) {
            // Check if the member is bannable
            if (!targetMember.bannable) {
                return { success: false, error: `Cannot ban ${targetMember.displayName} - they may have higher permissions than me` };
            }

            // Check if trying to ban the server owner
            if (targetMember.id === guild.ownerId) {
                return { success: false, error: 'Cannot ban the server owner' };
            }

            targetId = targetMember.id;
            targetName = targetMember.displayName;
        } else {
            // Check if it looks like a user ID
            const cleanId = memberIdentifier.replace(/[<@!>]/g, '').trim();
            if (/^\d{17,19}$/.test(cleanId)) {
                targetId = cleanId;
            } else {
                return { success: false, error: `Could not find member "${memberIdentifier}"` };
            }
        }

        // Validate delete_messages (0-7 days)
        const deleteMessageDays = Math.max(0, Math.min(7, delete_messages || 0));

        logger.info('TOOL', `Banning ${targetName} from ${guild.name}${reason ? ` (Reason: ${reason})` : ''}`);

        await guild.members.ban(targetId, {
            reason: reason || 'Banned by CheapShot AI',
            deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60
        });

        logger.info('TOOL', `Successfully banned ${targetName}`);

        return {
            success: true,
            member: {
                id: targetId,
                name: targetName,
                username: targetMember?.user?.tag || targetName
            },
            reason: reason || 'No reason provided',
            deleted_messages_days: deleteMessageDays,
            message: `Banned ${targetName} from the server${reason ? ` for: ${reason}` : ''}${deleteMessageDays > 0 ? ` (deleted ${deleteMessageDays} day(s) of messages)` : ''}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to ban member: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to ban member'
        };
    }
}

/**
 * Handler for timing out a member
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { member, duration, reason? }
 * @returns {Promise<{success: boolean, member?: Object, error?: string}>}
 */
export async function handleTimeoutMember(guild, args) {
    const { member: memberIdentifier, duration, reason } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot timeout member: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!memberIdentifier) {
        return { success: false, error: 'Must specify which member to timeout' };
    }

    if (!duration) {
        return { success: false, error: 'Must specify timeout duration (e.g., "5m", "1h", "1d")' };
    }

    try {
        // Parse the duration
        const durationMs = parseDuration(duration);
        if (!durationMs) {
            return { success: false, error: `Invalid duration format "${duration}". Use formats like: 5m, 1h, 1d, 1w` };
        }

        // Max timeout is 28 days
        const maxTimeout = 28 * 24 * 60 * 60 * 1000;
        if (durationMs > maxTimeout) {
            return { success: false, error: 'Maximum timeout duration is 28 days' };
        }

        // Find the member
        const targetMember = await findMemberSmart(guild, memberIdentifier);
        if (!targetMember) {
            return { success: false, error: `Could not find member "${memberIdentifier}"` };
        }

        // Check if the member is moderatable
        if (!targetMember.moderatable) {
            return { success: false, error: `Cannot timeout ${targetMember.displayName} - they may have higher permissions than me` };
        }

        // Check if trying to timeout the server owner
        if (targetMember.id === guild.ownerId) {
            return { success: false, error: 'Cannot timeout the server owner' };
        }

        logger.info('TOOL', `Timing out ${targetMember.displayName} for ${duration}${reason ? ` (Reason: ${reason})` : ''}`);

        await targetMember.timeout(durationMs, reason || 'Timed out by CheapShot AI');

        // Calculate human-readable end time
        const endTime = new Date(Date.now() + durationMs);
        const endTimeStr = endTime.toLocaleString();

        logger.info('TOOL', `Successfully timed out ${targetMember.displayName} until ${endTimeStr}`);

        return {
            success: true,
            member: {
                id: targetMember.id,
                name: targetMember.displayName,
                username: targetMember.user.tag
            },
            duration: duration,
            duration_ms: durationMs,
            ends_at: endTimeStr,
            reason: reason || 'No reason provided',
            message: `Timed out ${targetMember.displayName} for ${duration}${reason ? ` (Reason: ${reason})` : ''}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to timeout member: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to timeout member'
        };
    }
}

/**
 * Handler for managing (deleting/purging) messages
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { channel?, count?, from_user?, reason? }
 * @param {Object} context - Additional context { message }
 * @returns {Promise<{success: boolean, deleted?: number, error?: string}>}
 */
export async function handleManageMessages(guild, args, context = {}) {
    const { channel: channelName, count = 10, from_user, reason } = args;
    const { message } = context;

    if (!guild) {
        logger.error('TOOL', 'Cannot manage messages: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        let targetChannel;

        // If channel name specified, find it
        if (channelName) {
            targetChannel = findChannel(guild, channelName, 'text');
            if (!targetChannel) {
                return { success: false, error: `Could not find text channel "${channelName}"` };
            }
        } else if (message?.channel) {
            // Use the current channel
            targetChannel = message.channel;
        } else {
            return { success: false, error: 'No channel specified and could not determine current channel' };
        }

        // Validate count (1-100)
        const deleteCount = Math.max(1, Math.min(100, count || 10));

        logger.info('TOOL', `Deleting up to ${deleteCount} messages from #${targetChannel.name}${from_user ? ` by ${from_user}` : ''}`);

        // Fetch messages
        let messages = await targetChannel.messages.fetch({ limit: deleteCount });

        // Filter by user if specified
        if (from_user) {
            const targetMember = await findMemberSmart(guild, from_user);
            if (targetMember) {
                messages = messages.filter(m => m.author.id === targetMember.id);
            } else {
                // Try to filter by username/ID directly
                const cleanId = from_user.replace(/[<@!>]/g, '').trim().toLowerCase();
                messages = messages.filter(m =>
                    m.author.id === cleanId ||
                    m.author.username.toLowerCase().includes(cleanId) ||
                    m.author.displayName?.toLowerCase().includes(cleanId)
                );
            }
        }

        // Filter out messages older than 14 days (Discord limitation)
        const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        messages = messages.filter(m => m.createdTimestamp > twoWeeksAgo);

        if (messages.size === 0) {
            return { success: true, deleted: 0, message: 'No messages found to delete' };
        }

        // Check if there are ANY non-bot messages
        // If ONLY bot messages remain, stop to prevent infinite loop
        const botId = guild.client.user.id;
        const nonBotMessages = messages.filter(m => m.author.id !== botId);

        if (nonBotMessages.size === 0) {
            // Only bot messages left - stop to prevent infinite loop
            return { success: true, deleted: 0, message: 'No more user messages to delete (only bot messages remain)' };
        }

        // Bulk delete
        const deleted = await targetChannel.bulkDelete(messages, true);

        logger.info('TOOL', `Successfully deleted ${deleted.size} messages from #${targetChannel.name}`);

        return {
            success: true,
            deleted: deleted.size,
            channel: {
                id: targetChannel.id,
                name: targetChannel.name
            },
            from_user: from_user || 'all users',
            reason: reason,
            message: `Deleted ${deleted.size} message${deleted.size !== 1 ? 's' : ''} from #${targetChannel.name}${from_user ? ` by ${from_user}` : ''}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to manage messages: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to delete messages'
        };
    }
}
