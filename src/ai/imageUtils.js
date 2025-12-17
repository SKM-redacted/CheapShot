import { logger } from './logger.js';

/**
 * Supported image MIME types for the Vision API
 */
const SUPPORTED_IMAGE_TYPES = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/svg+xml',
    'image/tiff'
];

/**
 * Image extensions that we can process
 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.tif'];

/**
 * Maximum image size in bytes (20MB - Discord's limit)
 */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

/**
 * Check if a URL points to an image based on extension
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isImageUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        return IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
    } catch {
        return false;
    }
}

/**
 * Get MIME type from URL extension
 * @param {string} url - URL to check
 * @returns {string} MIME type or 'image/png' as default
 */
function getMimeTypeFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();

        if (pathname.endsWith('.png')) return 'image/png';
        if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
        if (pathname.endsWith('.gif')) return 'image/gif';
        if (pathname.endsWith('.webp')) return 'image/webp';
        if (pathname.endsWith('.bmp')) return 'image/bmp';
        if (pathname.endsWith('.svg')) return 'image/svg+xml';
        if (pathname.endsWith('.tiff') || pathname.endsWith('.tif')) return 'image/tiff';

        return 'image/png'; // Default fallback
    } catch {
        return 'image/png';
    }
}

/**
 * Download an image from a URL and convert to base64
 * @param {string} url - Image URL
 * @returns {Promise<{base64: string, mimeType: string}|null>}
 */
async function downloadImageAsBase64(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'CheapShot Discord Bot'
            }
        });

        if (!response.ok) {
            logger.warn('IMAGE', `Failed to download image: ${response.status} ${response.statusText}`);
            return null;
        }

        // Check content type
        const contentType = response.headers.get('content-type') || getMimeTypeFromUrl(url);
        const mimeType = contentType.split(';')[0].trim();

        if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
            logger.warn('IMAGE', `Unsupported image type: ${mimeType}`);
            return null;
        }

        // Get the image data
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Check size
        if (buffer.length > MAX_IMAGE_SIZE) {
            logger.warn('IMAGE', `Image too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
            return null;
        }

        // Convert to base64
        const base64 = buffer.toString('base64');

        logger.debug('IMAGE', `Downloaded image: ${(buffer.length / 1024).toFixed(1)}KB, type: ${mimeType}`);

        return { base64, mimeType };
    } catch (error) {
        logger.error('IMAGE', `Failed to download image: ${error.message}`);
        return null;
    }
}

/**
 * Extract image information from a Discord message
 * Handles both attachments and embedded images
 * @param {Object} message - Discord message object
 * @returns {Promise<Array<{url: string, base64?: string, mimeType?: string}>>}
 */
export async function extractImagesFromMessage(message) {
    const images = [];

    // 1. Check attachments (direct file uploads)
    if (message.attachments && message.attachments.size > 0) {
        for (const [, attachment] of message.attachments) {
            // Check if it's an image by content type or extension
            const isImage = attachment.contentType?.startsWith('image/') ||
                isImageUrl(attachment.url);

            if (isImage && attachment.size <= MAX_IMAGE_SIZE) {
                // Download and convert to base64 for reliable sending
                const imageData = await downloadImageAsBase64(attachment.url);
                if (imageData) {
                    images.push({
                        url: attachment.url,
                        base64: imageData.base64,
                        mimeType: imageData.mimeType,
                        filename: attachment.name || 'image',
                        source: 'attachment'
                    });
                    logger.info('IMAGE', `Extracted attachment: ${attachment.name || 'image'}`);
                }
            }
        }
    }

    // 2. Check embeds (linked images, image URLs in message)
    if (message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
            // Check embed image
            if (embed.image?.url) {
                const imageData = await downloadImageAsBase64(embed.image.url);
                if (imageData) {
                    images.push({
                        url: embed.image.url,
                        base64: imageData.base64,
                        mimeType: imageData.mimeType,
                        source: 'embed_image'
                    });
                    logger.info('IMAGE', `Extracted embed image`);
                }
            }

            // Check embed thumbnail
            if (embed.thumbnail?.url && !images.some(img => img.url === embed.thumbnail.url)) {
                const imageData = await downloadImageAsBase64(embed.thumbnail.url);
                if (imageData) {
                    images.push({
                        url: embed.thumbnail.url,
                        base64: imageData.base64,
                        mimeType: imageData.mimeType,
                        source: 'embed_thumbnail'
                    });
                    logger.info('IMAGE', `Extracted embed thumbnail`);
                }
            }
        }
    }

    // 3. Check for image URLs in message content
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const urls = message.content?.match(urlRegex) || [];

    for (const url of urls) {
        // Skip if we already have this URL
        if (images.some(img => img.url === url)) continue;

        // Check if it looks like an image URL
        if (isImageUrl(url)) {
            const imageData = await downloadImageAsBase64(url);
            if (imageData) {
                images.push({
                    url: url,
                    base64: imageData.base64,
                    mimeType: imageData.mimeType,
                    source: 'message_url'
                });
                logger.info('IMAGE', `Extracted image URL from message content`);
            }
        }
    }

    logger.debug('IMAGE', `Extracted ${images.length} image(s) from message`);
    return images;
}

/**
 * Format images for the OpenAI Vision API format
 * @param {Array<{base64: string, mimeType: string}>} images - Array of image data
 * @returns {Array<{type: string, image_url: {url: string}}>}
 */
export function formatImagesForVisionAPI(images) {
    return images.map(img => ({
        type: 'image_url',
        image_url: {
            url: `data:${img.mimeType};base64,${img.base64}`
        }
    }));
}

/**
 * Build multi-part content array for OpenAI Vision API
 * Combines text and images into the correct format
 * @param {string} text - Text content
 * @param {Array} images - Array of image data from extractImagesFromMessage
 * @returns {Array|string} - Multi-part content array if images, or just text string
 */
export function buildVisionContent(text, images) {
    if (!images || images.length === 0) {
        return text; // Simple text content
    }

    // Multi-part content with text first, then images
    const content = [
        { type: 'text', text: text }
    ];

    // Add images in Vision API format
    for (const img of images) {
        if (img.base64 && img.mimeType) {
            content.push({
                type: 'image_url',
                image_url: {
                    url: `data:${img.mimeType};base64,${img.base64}`
                }
            });
        }
    }

    return content;
}

/**
 * Check if a message has processable images
 * @param {Object} message - Discord message object
 * @returns {boolean}
 */
export function hasImages(message) {
    // Check attachments
    if (message.attachments?.size > 0) {
        for (const [, attachment] of message.attachments) {
            if (attachment.contentType?.startsWith('image/') || isImageUrl(attachment.url)) {
                return true;
            }
        }
    }

    // Check embeds
    if (message.embeds?.length > 0) {
        for (const embed of message.embeds) {
            if (embed.image?.url || embed.thumbnail?.url) {
                return true;
            }
        }
    }

    // Check message content for image URLs
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const urls = message.content?.match(urlRegex) || [];
    for (const url of urls) {
        if (isImageUrl(url)) {
            return true;
        }
    }

    return false;
}
