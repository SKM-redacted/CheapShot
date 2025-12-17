/**
 * Message Analyzer
 * 
 * Sends messages to AI for moderation analysis.
 * Uses server rules (custom or default) in the analysis.
 */

import { config } from '../../ai/config.js';
import { logger } from '../../ai/logger.js';
import { getGuildRules } from './rulesManager.js';

/**
 * Build moderation system prompt with rules context
 * @param {string} rules - Server rules
 * @returns {string} System prompt for moderation AI
 */
function getModerationSystemPrompt(rules) {
    return `You are a content moderation analyzer for a Discord server.

SERVER RULES:
${rules}

Analyze the following message against these rules. Respond ONLY with a JSON object:
{
  "toxicity": 0-10,
  "spam": 0-10,
  "rule_violations": ["list of violated rules or empty array"],
  "risk": "low" | "medium" | "high",
  "reason": "brief explanation if any issues found"
}

Be concise. Only flag genuine violations, not borderline cases.`;
}

/**
 * Make a moderation-focused chat request (non-streaming)
 * 
 * @param {string} content - Message content to analyze
 * @param {string} rules - Server rules for context
 * @returns {Promise<string>} AI response
 */
async function moderationChat(content, rules) {
    const url = `${config.onyxApiBase}/v1/chat/completions`;

    const body = {
        model: config.gatekeeperModel || config.aiModel,
        messages: [
            {
                role: 'system',
                content: getModerationSystemPrompt(rules)
            },
            {
                role: 'user',
                content: content
            }
        ],
        stream: false,
        max_tokens: 200
    };

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
}

/**
 * Parse AI moderation response into structured data
 * @param {string} response - Raw AI response
 * @returns {Object|null} Parsed moderation result
 */
export function parseModerationResponse(response) {
    if (!response) return null;

    try {
        // Try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        logger.debug('MODERATION', `Failed to parse response: ${error.message}`);
    }

    return null;
}

/**
 * Analyze a message through AI for moderation purposes.
 * The result is logged but not acted upon (goes into limbo).
 * 
 * @param {Object} message - Discord message object
 * @returns {Promise<Object|null>} AI analysis result or null if failed
 */
export async function analyzeMessage(message) {
    // Skip bot messages
    if (message.author.bot) return null;

    // Skip empty messages
    if (!message.content || message.content.trim().length === 0) return null;

    // Skip DMs
    if (!message.guild) return null;

    try {
        // Get rules for this guild (custom rules take priority)
        const { rules, isCustom } = await getGuildRules(message.guild);

        const messageContext = `
Channel: #${message.channel?.name || 'unknown'}
Author: ${message.author.tag}
Message: "${message.content}"
`;

        // Send to AI for analysis
        const response = await moderationChat(messageContext, rules);

        // Parse the response
        const parsed = parseModerationResponse(response);

        // Log for debugging (response goes into limbo)
        if (parsed) {
            logger.debug('MODERATION',
                `[${message.guild.name}] ${message.author.tag}: risk=${parsed.risk}, toxicity=${parsed.toxicity}, using ${isCustom ? 'custom' : 'default'} rules`
            );
        }

        return parsed;
    } catch (error) {
        // Silently fail - moderation shouldn't break normal operation
        logger.error('MODERATION', `Analysis failed: ${error.message}`);
        return null;
    }
}

/**
 * Message handler for moderation
 * Called on every message received (fire and forget)
 * 
 * @param {Object} message - Discord message  
 * @param {Object} bot - Bot that received the message
 */
export async function handleModerationMessage(message, bot) {
    // Fire and forget - don't await to avoid blocking main message flow
    analyzeMessage(message).catch(() => {
        // Silently ignore errors
    });
}
