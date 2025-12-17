/**
 * Discord Tools - Thread Management
 * 
 * Handlers for creating and archiving threads.
 * Includes bulk operations.
 */

import { ChannelType } from 'discord.js';
import {
    logger,
    findChannel
} from './helpers.js';

// ============================================================
// SINGLE THREAD HANDLERS
// ============================================================

/**
 * Handler for creating a thread
 */
export async function handleCreateThread(guild, args, context = {}) {
    const { name, channel: channelName, message_id, auto_archive, private: isPrivate } = args;
    const { message: contextMessage } = context;

    if (!name) return { success: false, error: 'Must specify thread name' };

    try {
        let targetChannel = channelName ? findChannel(guild, channelName, 'text') : contextMessage?.channel;
        if (!targetChannel) return { success: false, error: 'Could not find channel' };

        let thread;
        if (message_id) {
            const msg = await targetChannel.messages.fetch(message_id);
            thread = await msg.startThread({ name, autoArchiveDuration: auto_archive || 1440 });
        } else {
            thread = await targetChannel.threads.create({
                name,
                autoArchiveDuration: auto_archive || 1440,
                type: isPrivate ? ChannelType.PrivateThread : ChannelType.PublicThread
            });
        }

        logger.info('TOOL', `Created thread "${name}"`);

        return {
            success: true,
            thread: { id: thread.id, name: thread.name },
            message: `🧵 Created thread "${name}"`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create thread: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for archiving a thread
 */
export async function handleArchiveThread(guild, args) {
    const { thread_name } = args;

    if (!thread_name) return { success: false, error: 'Must specify thread_name' };

    try {
        const threads = await guild.channels.fetchActiveThreads();
        const thread = threads.threads.find(t => t.name.toLowerCase().includes(thread_name.toLowerCase()));

        if (!thread) return { success: false, error: `Could not find thread "${thread_name}"` };

        await thread.setArchived(true);
        logger.info('TOOL', `Archived thread "${thread.name}"`);

        return { success: true, message: `📦 Archived thread "${thread.name}"` };
    } catch (error) {
        logger.error('TOOL', `Failed to archive thread: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================================
// BULK THREAD HANDLERS
// ============================================================

/**
 * Handler for bulk creating threads
 */
export async function handleCreateThreadsBulk(guild, args, context = {}) {
    const { threads } = args;
    const { message: contextMessage } = context;

    if (!threads || !Array.isArray(threads)) {
        return { success: false, error: 'Must provide array of threads' };
    }

    try {
        const results = await Promise.allSettled(
            threads.map(async (thread) => {
                const result = await handleCreateThread(guild, thread, context);
                if (!result.success) throw new Error(result.error || result.message);
                return thread.name;
            })
        );

        const created = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk created ${created.length} threads, ${failed} failed`);

        return {
            success: created.length > 0,
            created: created.length,
            failed,
            message: `🧵 Created ${created.length} thread(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create threads bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for bulk archiving threads
 */
export async function handleArchiveThreadsBulk(guild, args) {
    const { thread_names } = args;

    if (!thread_names || !Array.isArray(thread_names)) {
        return { success: false, error: 'Must provide array of thread_names' };
    }

    try {
        const activeThreads = await guild.channels.fetchActiveThreads();

        const results = await Promise.allSettled(
            thread_names.map(async (name) => {
                const thread = activeThreads.threads.find(t => t.name.toLowerCase().includes(name.toLowerCase()));
                if (!thread) throw new Error(`Thread "${name}" not found`);
                await thread.setArchived(true);
                return name;
            })
        );

        const archived = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk archived ${archived.length} threads, ${failed} failed`);

        return {
            success: archived.length > 0,
            archived: archived.length,
            failed,
            message: `📦 Archived ${archived.length} thread(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to archive threads bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}
