/**
 * Discord Tools - Emoji Management
 * 
 * Handlers for creating, deleting, and listing custom emojis.
 * Includes bulk operations.
 */

import { logger } from './helpers.js';

// ============================================================
// SINGLE EMOJI HANDLERS
// ============================================================

/**
 * Handler for creating a custom emoji
 */
export async function handleCreateEmoji(guild, args) {
    const { name, image_url } = args;

    if (!name || !image_url) return { success: false, error: 'Must specify name and image_url' };

    try {
        const emoji = await guild.emojis.create({ attachment: image_url, name });
        logger.info('TOOL', `Created emoji :${name}:`);

        return {
            success: true,
            emoji: { id: emoji.id, name: emoji.name, url: emoji.url },
            message: `✅ Created emoji :${name}:`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create emoji: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for deleting a custom emoji
 */
export async function handleDeleteEmoji(guild, args) {
    const { emoji_name } = args;

    if (!emoji_name) return { success: false, error: 'Must specify emoji_name' };

    try {
        const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === emoji_name.toLowerCase());
        if (!emoji) return { success: false, error: `Could not find emoji "${emoji_name}"` };

        await emoji.delete();
        logger.info('TOOL', `Deleted emoji :${emoji.name}:`);

        return { success: true, message: `🗑️ Deleted emoji :${emoji.name}:` };
    } catch (error) {
        logger.error('TOOL', `Failed to delete emoji: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for listing custom emojis
 */
export async function handleListEmojis(guild, args) {
    try {
        const emojis = guild.emojis.cache.map(e => ({
            id: e.id,
            name: e.name,
            animated: e.animated,
            url: e.url
        }));

        const summary = `😀 **${emojis.length} custom emojis**`;
        logger.info('TOOL', `Listed ${emojis.length} emojis`);

        return { success: true, emojis, count: emojis.length, summary };
    } catch (error) {
        logger.error('TOOL', `Failed to list emojis: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================================
// BULK EMOJI HANDLERS
// ============================================================

/**
 * Handler for bulk creating emojis
 */
export async function handleCreateEmojisBulk(guild, args) {
    const { emojis } = args;

    if (!emojis || !Array.isArray(emojis)) {
        return { success: false, error: 'Must provide array of emojis' };
    }

    try {
        const results = await Promise.allSettled(
            emojis.map(async (emoji) => {
                const created = await guild.emojis.create({
                    attachment: emoji.image_url,
                    name: emoji.name
                });
                return emoji.name;
            })
        );

        const created = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk created ${created.length} emojis, ${failed} failed`);

        return {
            success: created.length > 0,
            created: created.length,
            failed,
            message: `😀 Created ${created.length} emoji(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create emojis bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for bulk deleting emojis
 */
export async function handleDeleteEmojisBulk(guild, args) {
    const { emoji_names } = args;

    if (!emoji_names || !Array.isArray(emoji_names)) {
        return { success: false, error: 'Must provide array of emoji_names' };
    }

    try {
        const results = await Promise.allSettled(
            emoji_names.map(async (name) => {
                const emoji = guild.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase());
                if (!emoji) throw new Error(`Emoji "${name}" not found`);
                await emoji.delete();
                return name;
            })
        );

        const deleted = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk deleted ${deleted.length} emojis, ${failed} failed`);

        return {
            success: deleted.length > 0,
            deleted: deleted.length,
            failed,
            message: `🗑️ Deleted ${deleted.length} emoji(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to delete emojis bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}
