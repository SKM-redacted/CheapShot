/**
 * Message Analyzer
 * 
 * Core analysis logic - ties together AI client, parser, and rules.
 */

import { logger } from '../../ai/logger.js';
import { getGuildRules } from './rulesManager.js';
import { sendModerationRequest } from './aiClient.js';
import { parseResponse } from './responseParser.js';

/**
 * Build message context for AI
 */
function buildMessageContext(message) {
    return `
Channel: #${message.channel?.name || 'unknown'}
Author: ${message.author.tag} (ID: ${message.author.id})
Message: "${message.content}"
`;
}

/**
 * Analyze a message for rule violations
 * @param {Object} message - Discord message
 * @returns {Promise<Object|null>}
 */
export async function analyzeMessage(message) {
    // Skip bots, empty, DMs
    if (message.author.bot) return null;
    if (!message.content?.trim()) return null;
    if (!message.guild) return null;

    // Log that we received a message
    logger.info('MODERATION', `📨 Received message in #${message.channel?.name} from ${message.author.tag}`);

    try {
        const { rules, isCustom } = await getGuildRules(message.guild);
        logger.info('MODERATION', `📋 Got ${isCustom ? 'custom' : 'default'} rules, sending to AI...`);

        const context = buildMessageContext(message);
        const response = await sendModerationRequest(context, rules);

        if (!response) {
            logger.warn('MODERATION', `❌ No response from AI for message from ${message.author.tag}`);
            return null;
        }

        logger.info('MODERATION', `✅ Got AI response: ${response.substring(0, 80)}...`);

        const result = parseResponse(response);

        if (!result) {
            logger.warn('MODERATION', `❌ Failed to parse response: ${response.substring(0, 100)}`);
            return null;
        }

        logResult(message, result, isCustom);

        return result;
    } catch (error) {
        logger.error('MODERATION', `❌ Analysis failed for ${message.author.tag}: ${error.message}`);
        return null;
    }
}

/**
 * Log analysis result based on severity
 */
function logResult(message, result, isCustom) {
    if (!result) return;

    logger.info('MODERATION',
        `🔍 [${message.guild.name}] ${message.author.tag}: severity=${result.severity}, ` +
        `actions=[${result.actions.join(',')}], rule="${result.rule_violated || 'none'}", ` +
        `reason="${result.reason || 'none'}"`
    );
}

/**
 * Message handler (fire and forget)
 */
export async function handleModerationMessage(message, bot) {
    analyzeMessage(message).catch((err) => {
        logger.error('MODERATION', `❌ Handler error: ${err.message}`);
    });
}
