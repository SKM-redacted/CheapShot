/**
 * Discord Tools - Sticker Management
 * 
 * Handlers for creating, deleting, and listing custom stickers.
 * Includes bulk operations.
 * 
 * Discord Sticker Requirements:
 * - Name: 2-30 characters
 * - Description: 2-100 characters (optional)
 * - Tags: Discord emoji name representing the sticker's expression
 * - File: PNG, APNG, or Lottie JSON (max 512KB for images, 500KB for Lottie)
 * - Size: 320x320 pixels
 * - Animated stickers: max 5 seconds
 */

import { logger } from './helpers.js';

// ============================================================
// SINGLE STICKER HANDLERS
// ============================================================

/**
 * Handler for creating a custom sticker
 */
export async function handleCreateSticker(guild, args) {
    const { name, description, tags, file_url } = args;

    if (!name || !file_url || !tags) {
        return { success: false, error: 'Must specify name, file_url, and tags (emoji name for expression)' };
    }

    if (name.length < 2 || name.length > 30) {
        return { success: false, error: 'Sticker name must be between 2 and 30 characters' };
    }

    try {
        const sticker = await guild.stickers.create({
            file: file_url,
            name,
            tags,
            description: description || '',
        });
        logger.info('TOOL', `Created sticker "${name}"`);

        return {
            success: true,
            sticker: {
                id: sticker.id,
                name: sticker.name,
                description: sticker.description,
                tags: sticker.tags,
                url: sticker.url
            },
            message: `✅ Created sticker "${name}"`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create sticker: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for deleting a custom sticker
 */
export async function handleDeleteSticker(guild, args) {
    const { sticker_name } = args;

    if (!sticker_name) return { success: false, error: 'Must specify sticker_name' };

    try {
        // Fetch stickers to ensure we have the latest cache
        await guild.stickers.fetch();

        const sticker = guild.stickers.cache.find(s => s.name.toLowerCase() === sticker_name.toLowerCase());
        if (!sticker) return { success: false, error: `Could not find sticker "${sticker_name}"` };

        const stickerName = sticker.name;
        await sticker.delete();
        logger.info('TOOL', `Deleted sticker "${stickerName}"`);

        return { success: true, message: `🗑️ Deleted sticker "${stickerName}"` };
    } catch (error) {
        logger.error('TOOL', `Failed to delete sticker: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for listing custom stickers
 */
export async function handleListStickers(guild, args) {
    try {
        // Fetch stickers to ensure we have the latest cache
        await guild.stickers.fetch();

        const stickers = guild.stickers.cache.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            tags: s.tags,
            format: s.format,
            url: s.url
        }));

        const summary = `🏷️ **${stickers.length} custom stickers**`;
        logger.info('TOOL', `Listed ${stickers.length} stickers`);

        return { success: true, stickers, count: stickers.length, summary };
    } catch (error) {
        logger.error('TOOL', `Failed to list stickers: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================================
// BULK STICKER HANDLERS
// ============================================================

/**
 * Handler for bulk creating stickers
 */
export async function handleCreateStickersBulk(guild, args) {
    const { stickers } = args;

    if (!stickers || !Array.isArray(stickers)) {
        return { success: false, error: 'Must provide array of stickers' };
    }

    try {
        const results = await Promise.allSettled(
            stickers.map(async (sticker) => {
                if (!sticker.name || !sticker.file_url || !sticker.tags) {
                    throw new Error(`Sticker missing required fields: name, file_url, or tags`);
                }

                const created = await guild.stickers.create({
                    file: sticker.file_url,
                    name: sticker.name,
                    tags: sticker.tags,
                    description: sticker.description || '',
                });
                return sticker.name;
            })
        );

        const created = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk created ${created.length} stickers, ${failed} failed`);

        return {
            success: created.length > 0,
            created: created.length,
            failed,
            message: `🏷️ Created ${created.length} sticker(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create stickers bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for bulk deleting stickers
 */
export async function handleDeleteStickersBulk(guild, args) {
    const { sticker_names } = args;

    if (!sticker_names || !Array.isArray(sticker_names)) {
        return { success: false, error: 'Must provide array of sticker_names' };
    }

    try {
        // Fetch stickers to ensure we have the latest cache
        await guild.stickers.fetch();

        const results = await Promise.allSettled(
            sticker_names.map(async (name) => {
                const sticker = guild.stickers.cache.find(s => s.name.toLowerCase() === name.toLowerCase());
                if (!sticker) throw new Error(`Sticker "${name}" not found`);
                await sticker.delete();
                return name;
            })
        );

        const deleted = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk deleted ${deleted.length} stickers, ${failed} failed`);

        return {
            success: deleted.length > 0,
            deleted: deleted.length,
            failed,
            message: `🗑️ Deleted ${deleted.length} sticker(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to delete stickers bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}
