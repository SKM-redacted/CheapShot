/**
 * Message Analyzer
 * 
 * Core analysis logic - ties together AI client, parser, and action executor.
 */

import { logger } from '../../ai/logger.js';
import { getGuildRules } from './rulesManager.js';
import { sendModerationRequest } from './aiClient.js';
import { parseResponse } from './responseParser.js';
import { executeActions } from './actionExecutor.js';
import { getModerationChannelId } from '../channelConfig.js';
import db from '../../shared/database.js';

/**
 * Build message context for AI
 */
function buildMessageContext(message) {
    return `
Channel: #${message.channel?.name || 'unknown'}
Author: ${message.author.tag}
Message: "${message.content}"
`;
}

/**
 * Analyze a message for rule violations and execute actions
 * @param {Object} message - Discord message
 * @returns {Promise<Object|null>}
 */
export async function analyzeMessage(message) {
    // Skip bots, empty, DMs
    if (message.author.bot) return null;
    if (!message.content?.trim()) return null;
    if (!message.guild) return null;

    // Check if moderation is enabled for this guild
    try {
        const settings = await db.getGuildSettings(message.guild.id);
        const moderationEnabled = settings?.modules?.moderation?.enabled;

        // If moderation module exists and is explicitly disabled, skip
        if (settings?.modules?.moderation && moderationEnabled === false) {
            return null;
        }
    } catch (e) {
        // If we can't check settings, continue with moderation (fail open for safety)
        logger.warn('MODERATION', `Could not check settings for ${message.guild.id}: ${e.message}`);
    }

    // Skip moderation channel - don't moderate the mod log!
    const modChannelId = await getModerationChannelId(message.guild.id);
    if (modChannelId && message.channel.id === modChannelId) {
        return null;
    }

    try {
        const { rules, isCustom } = await getGuildRules(message.guild);
        const context = buildMessageContext(message);
        const response = await sendModerationRequest(context, rules);

        if (!response) {
            logger.warn('MODERATION', `No response from AI for ${message.author.tag}`);
            return null;
        }

        const result = parseResponse(response);

        if (!result) {
            logger.warn('MODERATION', `Failed to parse: ${response.substring(0, 50)}`);
            return null;
        }

        // Log the result
        logResult(message, result);

        // Execute actions if severity >= 2
        if (result.severity >= 2) {
            const { actionsExecuted, warningCount, warningId } = await executeActions(message, result);
            result.actionsExecuted = actionsExecuted;
            result.warningCount = warningCount;
            result.warningId = warningId;

            logger.info('MODERATION',
                `⚡ Executed: [${actionsExecuted.join(', ')}] for ${message.author.tag} (warnings: ${warningCount})`
            );
        }

        return result;
    } catch (error) {
        logger.error('MODERATION', `Analysis failed for ${message.author.tag}: ${error.message}`);
        return null;
    }
}

/**
 * Log analysis result
 */
function logResult(message, result) {
    if (!result) return;

    const emoji = result.severity >= 3 ? '🚨' : result.severity >= 2 ? '⚠️' : '✅';

    logger.info('MODERATION',
        `${emoji} [${message.guild.name}] ${message.author.tag}: severity=${result.severity}, ` +
        `actions=[${result.actions.join(',')}]`
    );
}

/**
 * Message handler (fire and forget)
 */
export async function handleModerationMessage(message, bot) {
    analyzeMessage(message).catch((err) => {
        logger.error('MODERATION', `Handler error: ${err.message}`);
    });
}
