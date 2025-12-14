import { config } from './config.js';
import { logger } from './logger.js';
import { ALL_TOOLS } from './toolDefinitions.js';

/**
 * Image Generation Client
 * Calls the Onyx API to generate images
 */
export class ImageClient {
    constructor() {
        this.baseUrl = config.onyxApiBase;
    }

    /**
     * Generate an image from a text prompt
     * @param {string} prompt - The image description
     * @param {string} size - Image size (e.g., "1024x1024")
     * @returns {Promise<{url: string, revised_prompt: string}>}
     */
    async generateImage(prompt, size = "1024x1024") {
        const url = `${this.baseUrl}/v1/images/generations`;

        const body = {
            prompt: prompt,
            model: "dall-e-3",
            n: 1,
            size: size,
            quality: "standard",
            response_format: "url"
        };

        // logger.imageStart is called in index.js, so we just log debug level here
        logger.debug('IMAGE', 'Request sent to API', { promptLength: prompt.length });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Name': 'cheapshot' // Organize images by app
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('IMAGE', 'API Error', { status: response.status, text: errorText });
                throw new Error(`Image generation failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.data || data.data.length === 0) {
                throw new Error('No image data returned');
            }

            const imageData = data.data[0];
            logger.debug('IMAGE', 'Success', { url: imageData.url });

            return {
                url: imageData.url,
                revised_prompt: imageData.revised_prompt || prompt
            };

        } catch (error) {
            // logger.error is called in index.js for the main error
            throw error;
        }
    }
}

/**
 * All available tools - imported from toolDefinitions.js
 */
export const TOOLS = ALL_TOOLS;

