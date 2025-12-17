/**
 * Discord Tools - Webhook Management
 * 
 * Handlers for creating, deleting, and listing webhooks.
 * Includes bulk operations.
 */

import {
    logger,
    findChannel
} from './helpers.js';

// ============================================================
// SINGLE WEBHOOK HANDLERS
// ============================================================

/**
 * Handler for creating a webhook
 */
export async function handleCreateWebhook(guild, args) {
    const { channel: channelName, name, avatar_url } = args;

    if (!channelName || !name) return { success: false, error: 'Must specify channel and name' };

    try {
        const channel = findChannel(guild, channelName, 'text');
        if (!channel) return { success: false, error: `Could not find channel "${channelName}"` };

        const webhook = await channel.createWebhook({ name, avatar: avatar_url });
        logger.info('TOOL', `Created webhook "${name}" in #${channel.name}`);

        return {
            success: true,
            webhook: { id: webhook.id, name: webhook.name, url: webhook.url },
            message: `✅ Created webhook "${name}"`,
            url: webhook.url
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create webhook: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for deleting a webhook
 */
export async function handleDeleteWebhook(guild, args) {
    const { webhook_name, channel: channelName } = args;

    if (!webhook_name) return { success: false, error: 'Must specify webhook_name' };

    try {
        let webhooks;
        if (channelName) {
            const channel = findChannel(guild, channelName, 'text');
            if (channel) {
                webhooks = await channel.fetchWebhooks();
            }
        }
        if (!webhooks) {
            webhooks = await guild.fetchWebhooks();
        }

        const webhook = webhooks.find(w => w.name.toLowerCase().includes(webhook_name.toLowerCase()));
        if (!webhook) return { success: false, error: `Could not find webhook "${webhook_name}"` };

        await webhook.delete();
        logger.info('TOOL', `Deleted webhook "${webhook.name}"`);

        return { success: true, message: `🗑️ Deleted webhook "${webhook.name}"` };
    } catch (error) {
        logger.error('TOOL', `Failed to delete webhook: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for listing webhooks
 */
export async function handleListWebhooks(guild, args) {
    const { channel: channelName } = args;

    try {
        let webhooks;
        if (channelName) {
            const channel = findChannel(guild, channelName, 'text');
            if (channel) {
                webhooks = await channel.fetchWebhooks();
            }
        }
        if (!webhooks) {
            webhooks = await guild.fetchWebhooks();
        }

        const webhookList = webhooks.map(w => ({
            id: w.id,
            name: w.name,
            channel: w.channel.name,
            url: w.url
        }));

        const summary = `🔗 **${webhookList.length} webhooks found**`;
        logger.info('TOOL', `Listed ${webhookList.length} webhooks`);

        return { success: true, webhooks: webhookList, count: webhookList.length, summary };
    } catch (error) {
        logger.error('TOOL', `Failed to list webhooks: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================================
// BULK WEBHOOK HANDLERS
// ============================================================

/**
 * Handler for bulk creating webhooks
 */
export async function handleCreateWebhooksBulk(guild, args) {
    const { webhooks } = args;

    if (!webhooks || !Array.isArray(webhooks)) {
        return { success: false, error: 'Must provide array of webhooks' };
    }

    try {
        const results = await Promise.allSettled(
            webhooks.map(async (webhook) => {
                const channel = findChannel(guild, webhook.channel, 'text');
                if (!channel) throw new Error(`Channel "${webhook.channel}" not found`);

                const created = await channel.createWebhook({
                    name: webhook.name,
                    avatar: webhook.avatar_url
                });
                return { name: webhook.name, channel: channel.name, url: created.url };
            })
        );

        const created = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk created ${created.length} webhooks, ${failed} failed`);

        return {
            success: created.length > 0,
            created,
            failed,
            message: `✅ Created ${created.length} webhook(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create webhooks bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for bulk deleting webhooks
 */
export async function handleDeleteWebhooksBulk(guild, args) {
    const { webhook_names } = args;

    if (!webhook_names || !Array.isArray(webhook_names)) {
        return { success: false, error: 'Must provide array of webhook_names' };
    }

    try {
        const allWebhooks = await guild.fetchWebhooks();

        const results = await Promise.allSettled(
            webhook_names.map(async (name) => {
                const webhook = allWebhooks.find(w => w.name.toLowerCase().includes(name.toLowerCase()));
                if (!webhook) throw new Error(`Webhook "${name}" not found`);
                await webhook.delete();
                return name;
            })
        );

        const deleted = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk deleted ${deleted.length} webhooks, ${failed} failed`);

        return {
            success: deleted.length > 0,
            deleted: deleted.length,
            failed,
            message: `🗑️ Deleted ${deleted.length} webhook(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to delete webhooks bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}
