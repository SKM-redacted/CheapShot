/**
 * Image Storage - Downloads and stores images locally for persistent context
 * 
 * Discord CDN links expire after 24 hours, so we need to download
 * and store images locally for the dashboard to display them.
 * 
 * Images are stored in per-guild folders for easy backup/deletion:
 * dashboard/uploads/context-images/{guildId}/{filename}
 * 
 * Images are served via authenticated API endpoint:
 * /api/guilds/{guildId}/images/{filename}
 */
import { logger } from './logger.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Base path to store images (PRIVATE - not in public folder)
const UPLOADS_BASE = path.join(__dirname, '../../dashboard/uploads/context-images');

// Supported image extensions
const EXTENSION_MAP = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
    'image/tiff': '.tiff'
};

// Maximum image size (10MB for storage)
const MAX_STORAGE_SIZE = 10 * 1024 * 1024;

/**
 * Get the folder path for a specific guild
 * @param {string} guildId 
 * @returns {string}
 */
function getGuildFolder(guildId) {
    return path.join(UPLOADS_BASE, guildId);
}

/**
 * Ensure the uploads directory exists for a guild
 * @param {string} guildId
 */
async function ensureGuildDir(guildId) {
    const guildDir = getGuildFolder(guildId);
    try {
        await fs.access(guildDir);
    } catch {
        await fs.mkdir(guildDir, { recursive: true });
        logger.info('IMAGE_STORAGE', `Created guild uploads directory: ${guildDir}`);
    }
}

/**
 * Generate a unique filename for an image
 * Filename format: {channelId}_{userId}_{timestamp}_{random}.{ext}
 * @param {string} channelId 
 * @param {string} userId 
 * @param {string} mimeType 
 * @returns {string}
 */
function generateFilename(channelId, userId, mimeType) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const extension = EXTENSION_MAP[mimeType] || '.png';
    return `${channelId}_${userId}_${timestamp}_${random}${extension}`;
}

/**
 * Download and save an image locally in the guild's folder
 * @param {Object} imageData - Image data with url, base64, mimeType
 * @param {string} guildId 
 * @param {string} channelId 
 * @param {string} userId 
 * @returns {Promise<{localPath: string, url: string, filename: string, mimeType: string, source: string}|null>}
 */
export async function saveImageLocally(imageData, guildId, channelId, userId) {
    if (!imageData || !imageData.base64 || !imageData.mimeType) {
        logger.warn('IMAGE_STORAGE', 'Invalid image data - missing base64 or mimeType');
        return null;
    }

    try {
        await ensureGuildDir(guildId);

        // Generate unique filename (guildId is in folder, not filename)
        const filename = generateFilename(channelId, userId, imageData.mimeType);
        const guildDir = getGuildFolder(guildId);
        const localPath = path.join(guildDir, filename);

        // Convert base64 to buffer
        const buffer = Buffer.from(imageData.base64, 'base64');

        // Check size
        if (buffer.length > MAX_STORAGE_SIZE) {
            logger.warn('IMAGE_STORAGE', `Image too large for storage: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
            return null;
        }

        // Write to disk
        await fs.writeFile(localPath, buffer);

        // Return the authenticated API path for accessing the image
        const apiPath = `/api/guilds/${guildId}/images/${filename}`;

        logger.info('IMAGE_STORAGE', `Saved image: ${guildId}/${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);

        return {
            localPath: apiPath,  // API path for authenticated access
            originalUrl: imageData.url,  // Keep original Discord URL for reference
            filename: imageData.filename || filename,
            mimeType: imageData.mimeType,
            source: imageData.source || 'unknown',
            size: buffer.length
        };
    } catch (err) {
        logger.error('IMAGE_STORAGE', `Failed to save image: ${err.message}`);
        return null;
    }
}

/**
 * Save multiple images locally
 * @param {Array} images - Array of image data objects
 * @param {string} guildId 
 * @param {string} channelId 
 * @param {string} userId 
 * @returns {Promise<Array>}
 */
export async function saveImagesLocally(images, guildId, channelId, userId) {
    if (!images || images.length === 0) return [];

    const results = [];

    for (const img of images) {
        const saved = await saveImageLocally(img, guildId, channelId, userId);
        if (saved) {
            results.push(saved);
        }
    }

    return results;
}

/**
 * Get the absolute file path for a guild's image
 * @param {string} guildId 
 * @param {string} filename 
 * @returns {string}
 */
export function getImageFilePath(guildId, filename) {
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(filename);
    return path.join(getGuildFolder(guildId), sanitizedFilename);
}

/**
 * Check if an image file exists
 * @param {string} guildId 
 * @param {string} filename 
 * @returns {Promise<boolean>}
 */
export async function imageExists(guildId, filename) {
    try {
        const filePath = getImageFilePath(guildId, filename);
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Delete a specific image
 * @param {string} guildId 
 * @param {string} filename 
 * @returns {Promise<boolean>}
 */
export async function deleteImage(guildId, filename) {
    try {
        const filePath = getImageFilePath(guildId, filename);
        await fs.unlink(filePath);
        logger.info('IMAGE_STORAGE', `Deleted image: ${guildId}/${filename}`);
        return true;
    } catch (err) {
        logger.warn('IMAGE_STORAGE', `Failed to delete image: ${err.message}`);
        return false;
    }
}

/**
 * Delete all images for a specific context (channel/user within a guild)
 * @param {string} guildId 
 * @param {string} channelId 
 * @param {string} userId 
 * @returns {Promise<number>} Number of deleted files
 */
export async function deleteContextImages(guildId, channelId, userId) {
    try {
        const guildDir = getGuildFolder(guildId);
        const prefix = `${channelId}_${userId}_`;

        let files;
        try {
            files = await fs.readdir(guildDir);
        } catch {
            // Guild folder doesn't exist
            return 0;
        }

        let deleted = 0;

        for (const file of files) {
            if (file.startsWith(prefix)) {
                try {
                    await fs.unlink(path.join(guildDir, file));
                    deleted++;
                } catch {
                    // Ignore individual file errors
                }
            }
        }

        if (deleted > 0) {
            logger.info('IMAGE_STORAGE', `Deleted ${deleted} image(s) for context ${guildId}/${channelId}/${userId}`);
        }

        return deleted;
    } catch (err) {
        logger.warn('IMAGE_STORAGE', `Failed to delete context images: ${err.message}`);
        return 0;
    }
}

/**
 * Delete all images for a guild (entire folder)
 * @param {string} guildId 
 * @returns {Promise<boolean>}
 */
export async function deleteGuildImages(guildId) {
    try {
        const guildDir = getGuildFolder(guildId);
        await fs.rm(guildDir, { recursive: true, force: true });
        logger.info('IMAGE_STORAGE', `Deleted all images for guild ${guildId}`);
        return true;
    } catch (err) {
        logger.warn('IMAGE_STORAGE', `Failed to delete guild images: ${err.message}`);
        return false;
    }
}

/**
 * Get storage stats for a guild
 * @param {string} guildId 
 * @returns {Promise<{fileCount: number, totalSize: number}>}
 */
export async function getGuildStorageStats(guildId) {
    try {
        const guildDir = getGuildFolder(guildId);
        const files = await fs.readdir(guildDir);

        let totalSize = 0;
        for (const file of files) {
            try {
                const stats = await fs.stat(path.join(guildDir, file));
                totalSize += stats.size;
            } catch {
                // Ignore individual file errors
            }
        }

        return { fileCount: files.length, totalSize };
    } catch {
        return { fileCount: 0, totalSize: 0 };
    }
}

/**
 * Cleanup old images across all guilds
 * Deletes images older than maxAge (default 30 days)
 * @param {number} maxAgeDays - Maximum age in days
 * @returns {Promise<number>} Number of deleted files
 */
export async function cleanupOldImages(maxAgeDays = 30) {
    try {
        const now = Date.now();
        const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
        let totalDeleted = 0;

        // Get all guild folders
        let guilds;
        try {
            guilds = await fs.readdir(UPLOADS_BASE);
        } catch {
            return 0;
        }

        for (const guildId of guilds) {
            const guildDir = path.join(UPLOADS_BASE, guildId);

            try {
                const stat = await fs.stat(guildDir);
                if (!stat.isDirectory()) continue;

                const files = await fs.readdir(guildDir);

                for (const file of files) {
                    const filePath = path.join(guildDir, file);
                    try {
                        const fileStats = await fs.stat(filePath);
                        if (now - fileStats.mtime.getTime() > maxAge) {
                            await fs.unlink(filePath);
                            totalDeleted++;
                        }
                    } catch {
                        // Ignore individual file errors
                    }
                }
            } catch {
                // Ignore individual guild folder errors
            }
        }

        if (totalDeleted > 0) {
            logger.info('IMAGE_STORAGE', `Cleanup: Deleted ${totalDeleted} old image(s)`);
        }

        return totalDeleted;
    } catch (err) {
        logger.warn('IMAGE_STORAGE', `Cleanup failed: ${err.message}`);
        return 0;
    }
}
