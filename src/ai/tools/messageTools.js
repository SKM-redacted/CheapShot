/**
 * Discord Tools - Message Management
 * 
 * Handlers for pinning, unpinning, publishing, and deleting messages.
 * Includes bulk operations.
 */

import { ChannelType } from 'discord.js';
import {
    logger,
    findChannel
} from './helpers.js';

// ============================================================
// SINGLE MESSAGE HANDLERS
// ============================================================

/**
 * Handler for pinning a message
 */
export async function handlePinMessage(guild, args, context = {}) {
    const { message_id, channel: channelName } = args;
    const { message: contextMessage } = context;

    // Resolve message ID: explicit arg -> reply reference -> fail
    const targetMessageId = message_id || contextMessage?.reference?.messageId;

    if (!targetMessageId) return { success: false, error: 'Must specify message_id or reply to a message to pin it' };

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };

        const msg = await targetChannel.messages.fetch(targetMessageId);
        await msg.pin();
        logger.info('TOOL', `Pinned message ${targetMessageId} in #${targetChannel.name}`);

        return { success: true, message: `📌 Pinned message in #${targetChannel.name}` };
    } catch (error) {
        logger.error('TOOL', `Failed to pin message: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for unpinning a message
 */
export async function handleUnpinMessage(guild, args, context = {}) {
    const { message_id, channel: channelName } = args;
    const { message: contextMessage } = context;

    // Resolve message ID: explicit arg -> reply reference -> fail
    const targetMessageId = message_id || contextMessage?.reference?.messageId;

    if (!targetMessageId) return { success: false, error: 'Must specify message_id or reply to a message to unpin it' };

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };

        const msg = await targetChannel.messages.fetch(targetMessageId);
        await msg.unpin();
        logger.info('TOOL', `Unpinned message ${targetMessageId} in #${targetChannel.name}`);

        return { success: true, message: `📍 Unpinned message in #${targetChannel.name}` };
    } catch (error) {
        logger.error('TOOL', `Failed to unpin message: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for listing pinned messages
 */
export async function handleListPinnedMessages(guild, args, context = {}) {
    const { channel: channelName } = args;
    const { message: contextMessage } = context;

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };

        const pinnedMessages = await targetChannel.messages.fetchPinned();

        const messages = pinnedMessages.map(m => ({
            id: m.id,
            content: m.content.substring(0, 100),
            author: m.author.tag,
            url: m.url
        }));

        const summary = `📌 **${messages.length} pinned messages** in #${targetChannel.name}`;
        logger.info('TOOL', `Listed ${messages.length} pinned messages`);

        return { success: true, pinnedMessages: messages, count: messages.length, summary };
    } catch (error) {
        logger.error('TOOL', `Failed to list pinned messages: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for publishing a message to announcement channel followers
 */
export async function handlePublishMessage(guild, args, context = {}) {
    const { message_id, channel: channelName } = args;
    const { message: contextMessage } = context;

    // Resolve message ID: explicit arg -> reply reference -> fail
    const targetMessageId = message_id || contextMessage?.reference?.messageId;

    if (!targetMessageId) return { success: false, error: 'Must specify message_id or reply to a message to publish it' };

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };
        if (targetChannel.type !== ChannelType.GuildAnnouncement) {
            return { success: false, error: 'Can only publish messages in announcement channels' };
        }

        const msg = await targetChannel.messages.fetch(targetMessageId);
        await msg.crosspost();
        logger.info('TOOL', `Published message ${targetMessageId}`);

        return { success: true, message: `📣 Published message to following servers` };
    } catch (error) {
        logger.error('TOOL', `Failed to publish message: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for deleting a single message
 */
export async function handleDeleteMessage(guild, args, context = {}) {
    const { message_id, channel: channelName, reason } = args;
    const { message: contextMessage } = context;

    // Resolve message ID: explicit arg -> reply reference -> fail
    const targetMessageId = message_id || contextMessage?.reference?.messageId;

    if (!targetMessageId) return { success: false, error: 'Must specify message_id or reply to a message to delete it' };

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };

        const msg = await targetChannel.messages.fetch(targetMessageId);
        await msg.delete();
        logger.info('TOOL', `Deleted message ${targetMessageId} in #${targetChannel.name}`);

        return { success: true, message: `🗑️ Deleted message in #${targetChannel.name}` };
    } catch (error) {
        logger.error('TOOL', `Failed to delete message: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================================
// BULK MESSAGE HANDLERS
// ============================================================

/**
 * Handler for bulk pinning messages
 */
export async function handlePinMessagesBulk(guild, args, context = {}) {
    const { message_ids, channel: channelName } = args;
    const { message: contextMessage } = context;

    if (!message_ids || !Array.isArray(message_ids)) {
        return { success: false, error: 'Must provide array of message_ids' };
    }

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };

        const results = await Promise.allSettled(
            message_ids.map(async (id) => {
                const msg = await targetChannel.messages.fetch(id);
                await msg.pin();
                return id;
            })
        );

        const pinned = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk pinned ${pinned.length} messages, ${failed} failed`);

        return {
            success: pinned.length > 0,
            pinned: pinned.length,
            failed,
            message: `📌 Pinned ${pinned.length} message(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to pin messages bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for bulk unpinning messages
 */
export async function handleUnpinMessagesBulk(guild, args, context = {}) {
    const { message_ids, channel: channelName } = args;
    const { message: contextMessage } = context;

    if (!message_ids || !Array.isArray(message_ids)) {
        return { success: false, error: 'Must provide array of message_ids' };
    }

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };

        const results = await Promise.allSettled(
            message_ids.map(async (id) => {
                const msg = await targetChannel.messages.fetch(id);
                await msg.unpin();
                return id;
            })
        );

        const unpinned = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk unpinned ${unpinned.length} messages, ${failed} failed`);

        return {
            success: unpinned.length > 0,
            unpinned: unpinned.length,
            failed,
            message: `📍 Unpinned ${unpinned.length} message(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to unpin messages bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for bulk deleting messages by ID
 */
export async function handleDeleteMessagesBulk(guild, args, context = {}) {
    const { message_ids, channel: channelName, reason } = args;
    const { message: contextMessage } = context;

    if (!message_ids || !Array.isArray(message_ids)) {
        return { success: false, error: 'Must provide array of message_ids' };
    }

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };

        const results = await Promise.allSettled(
            message_ids.map(async (id) => {
                const msg = await targetChannel.messages.fetch(id);
                await msg.delete();
                return id;
            })
        );

        const deleted = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk deleted ${deleted.length} messages, ${failed} failed`);

        return {
            success: deleted.length > 0,
            deleted: deleted.length,
            failed,
            message: `🗑️ Deleted ${deleted.length} message(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to delete messages bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for bulk publishing messages
 */
export async function handlePublishMessagesBulk(guild, args, context = {}) {
    const { message_ids, channel: channelName } = args;
    const { message: contextMessage } = context;

    if (!message_ids || !Array.isArray(message_ids)) {
        return { success: false, error: 'Must provide array of message_ids' };
    }

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };
        if (targetChannel.type !== ChannelType.GuildAnnouncement) {
            return { success: false, error: 'Can only publish messages in announcement channels' };
        }

        const results = await Promise.allSettled(
            message_ids.map(async (id) => {
                const msg = await targetChannel.messages.fetch(id);
                await msg.crosspost();
                return id;
            })
        );

        const published = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk published ${published.length} messages, ${failed} failed`);

        return {
            success: published.length > 0,
            published: published.length,
            failed,
            message: `📣 Published ${published.length} message(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to publish messages bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for listing recent messages in a channel
 * Used for finding message IDs for other operations (pin, delete, etc.)
 */
export async function handleListMessages(guild, args, context = {}) {
    const { channel: channelName, count = 10 } = args;
    const { message: contextMessage } = context;

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };

        // Validate count (1-50)
        const limit = Math.max(1, Math.min(50, count || 10));

        const messages = await targetChannel.messages.fetch({ limit });

        const messageList = messages.map(m => ({
            id: m.id,
            author: m.author.username,
            content: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : ''),
            has_attachments: m.attachments.size > 0,
            has_embeds: m.embeds.length > 0,
            timestamp: m.createdAt.toISOString()
        }));

        const summary = `📜 **Last ${messageList.length} messages in #${targetChannel.name}**\n` +
            messageList.map(m => `• **${m.author}**: ${m.content || '[Media/Embed]'} (${m.id})`).join('\n');

        logger.info('TOOL', `Listed ${messageList.length} messages from #${targetChannel.name}`);

        return {
            success: true,
            messages: messageList,
            count: messageList.length,
            channel: targetChannel.name,
            summary
        };
    } catch (error) {
        logger.error('TOOL', `Failed to list messages: ${error.message}`);
        return { success: false, error: error.message };
    }
}
