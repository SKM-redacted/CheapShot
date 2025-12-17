/**
 * Discord Tools - Invite Management
 * 
 * Handlers for creating and listing server invites.
 */

import { ChannelType } from 'discord.js';
import {
    logger,
    findChannel
} from './helpers.js';

// ============================================================
// INVITE HANDLERS
// ============================================================

/**
 * Handler for creating a server invite
 */
export async function handleCreateInvite(guild, args) {
    const { channel: channelName, max_age = 86400, max_uses = 0, temporary = false } = args;

    try {
        let channel;
        if (channelName) {
            channel = findChannel(guild, channelName, 'any');
        } else {
            // Find first text channel
            channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText);
        }

        if (!channel) return { success: false, error: 'Could not find suitable channel' };

        const invite = await channel.createInvite({
            maxAge: max_age,
            maxUses: max_uses,
            temporary
        });

        logger.info('TOOL', `Created invite for #${channel.name}`);

        return {
            success: true,
            invite: {
                code: invite.code,
                url: invite.url,
                channel: channel.name,
                expires: max_age === 0 ? 'Never' : `${max_age / 3600} hours`
            },
            url: invite.url,
            message: `🔗 Created invite: ${invite.url}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create invite: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for listing server invites
 */
export async function handleListInvites(guild, args) {
    try {
        const invites = await guild.invites.fetch();

        const inviteList = invites.map(i => ({
            code: i.code,
            url: i.url,
            channel: i.channel.name,
            uses: i.uses,
            max_uses: i.maxUses || 'Unlimited',
            expires: i.expiresAt ? i.expiresAt.toISOString() : 'Never',
            creator: i.inviter?.tag || 'Unknown'
        }));

        const summary = `🔗 **${inviteList.length} active invites**`;
        logger.info('TOOL', `Listed ${inviteList.length} invites`);

        return { success: true, invites: inviteList, count: inviteList.length, summary };
    } catch (error) {
        logger.error('TOOL', `Failed to list invites: ${error.message}`);
        return { success: false, error: error.message };
    }
}
