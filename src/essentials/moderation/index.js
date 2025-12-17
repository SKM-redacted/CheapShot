/**
 * Moderation Module
 * 
 * Sends every message across all guilds/channels to the AI for analysis.
 * The AI response is captured but not acted upon (goes into "limbo").
 * This allows training data collection or future moderation features.
 */

import { config } from '../../ai/config.js';
import { logger } from '../../ai/logger.js';

// Lazy-loaded AI client to avoid circular dependencies
let aiClient = null;

async function getAIClient() {
    if (!aiClient) {
        const { AIClient } = await import('../../ai/aiClient.js');
        aiClient = new AIClient();
    }
    return aiClient;
}

// Simple moderation system prompt
const MODERATION_SYSTEM_PROMPT = `You are a content moderation analyzer. 
Analyze the following message for:
- Toxicity level (0-10)
- Spam likelihood (0-10)  
- Rule violations (if any)
- Overall risk level (low/medium/high)

Respond in JSON format only. Be concise.`;

/**
 * Analyze a message through AI for moderation purposes.
 * The result is logged but not acted upon.
 * 
 * @param {Object} message - Discord message object
 * @returns {Promise<Object|null>} AI analysis result or null if failed
 */
async function analyzeMessage(message) {
    // Skip bot messages
    if (message.author.bot) return null;

    // Skip empty messages
    if (!message.content || message.content.trim().length === 0) return null;

    try {
        const client = await getAIClient();

        const messageContext = `
Guild: ${message.guild?.name || 'DM'}
Channel: ${message.channel?.name || 'DM'}
Author: ${message.author.tag}
Message: "${message.content}"
`;

        // Use non-streaming simple chat for moderation
        const response = await moderationChat(client, messageContext);

        // Log for debugging (response goes into limbo)
        logger.debug('MODERATION', `Analyzed message from ${message.author.tag}: ${response?.substring(0, 100)}...`);

        return response;
    } catch (error) {
        // Silently fail - moderation shouldn't break normal operation
        logger.error('MODERATION', `Analysis failed: ${error.message}`);
        return null;
    }
}

/**
 * Simple moderation-focused chat request (non-streaming)
 * 
 * @param {Object} client - AIClient instance
 * @param {string} content - Message content to analyze
 * @returns {Promise<string>} AI response
 */
async function moderationChat(client, content) {
    const url = `${config.onyxApiBase}/v1/chat/completions`;

    const body = {
        model: config.gatekeeperModel || config.aiModel, // Use faster model if available
        messages: [
            {
                role: 'system',
                content: MODERATION_SYSTEM_PROMPT
            },
            {
                role: 'user',
                content: content
            }
        ],
        stream: false,
        max_tokens: 150 // Keep responses short
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-App-Name': 'cheapshot-moderation'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Moderation API request failed: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;

    } catch (error) {
        throw error;
    }
}

/**
 * Message handler for moderation
 * Called on every message received
 * 
 * @param {Object} message - Discord message  
 * @param {Object} bot - Bot that received the message
 */
async function handleModerationMessage(message, bot) {
    // Fire and forget - don't await to avoid blocking main message flow
    analyzeMessage(message).catch(() => {
        // Silently ignore errors
    });
}

/**
 * Setup moderation on the bot manager
 * Call this from the main index.js start() function
 * 
 * @param {Object} botManager - BotManager instance
 */
export function setupModeration(botManager) {
    // Register a separate message handler for moderation
    // This runs in parallel with the main AI response handler
    for (const bot of botManager.bots) {
        bot.client.on('messageCreate', async (message) => {
            // Fire and forget - moderation analysis runs independently
            handleModerationMessage(message, bot);
        });
    }

    logger.info('MODERATION', 'Moderation module initialized - analyzing all messages');
}

export { analyzeMessage, handleModerationMessage };
