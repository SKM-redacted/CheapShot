/**
 * Action Executor
 * 
 * Executes moderation actions based on analysis results.
 * Sends DM warnings with nicely formatted embeds.
 */

import { EmbedBuilder } from 'discord.js';
import { logger } from '../../ai/logger.js';
import { addWarning, getWarningCount, clearWarnings } from './warningTracker.js';
import { ACTION_TYPES, getTimeoutDuration, getTimeoutDurationString, MODERATION_CONFIG } from './constants.js';
import { sendModLogTimeout } from './modLog.js';

/**
 * Execute moderation actions based on analysis result
 * @param {Object} message - Discord message
 * @param {Object} result - Parsed moderation result
 * @returns {Promise<{actionsExecuted: string[], warningCount: number}>}
 */
export async function executeActions(message, result) {
    if (!result || result.severity < 2) {
        return { actionsExecuted: [], warningCount: 0 };
    }

    const actionsExecuted = [];
    let warningCount = 0;

    try {
        // Delete message if needed
        if (result.actions.includes(ACTION_TYPES.DELETE)) {
            try {
                await message.delete();
                actionsExecuted.push('deleted');
                logger.info('MODERATION', `Deleted message from ${message.author.tag}`);
            } catch (err) {
                logger.error('MODERATION', `Failed to delete message: ${err.message}`);
            }
        }

        // Add warning and send DM
        if (result.actions.includes(ACTION_TYPES.WARN)) {
            const warningResult = addWarning(
                message.guild.id,
                message.author.id,
                result.reason
            );
            warningCount = warningResult.count;
            actionsExecuted.push('warned');

            // Send DM with warning embed
            await sendWarningDM(message, warningCount, result, warningResult.shouldTimeout);

            // Auto-timeout if threshold reached
            if (warningResult.shouldTimeout) {
                try {
                    const member = message.guild.members.cache.get(message.author.id)
                        || await message.guild.members.fetch(message.author.id);

                    const duration = getTimeoutDuration(ACTION_TYPES.TIMEOUT_MEDIUM);
                    await member.timeout(duration, `Auto-timeout: ${MODERATION_CONFIG.WARNING_THRESHOLD} warnings`);
                    actionsExecuted.push('timeout_auto');

                    // Clear warnings after timeout
                    clearWarnings(message.guild.id, message.author.id);

                    // Send to mod log
                    await sendModLogTimeout(message, result, 'timeout_auto', warningCount);

                    logger.info('MODERATION', `Auto-timed out ${message.author.tag} after ${warningCount} warnings`);
                } catch (err) {
                    logger.error('MODERATION', `Failed to auto-timeout: ${err.message}`);
                }
            }
        }

        // Execute explicit timeout (for severity 4)
        const timeoutAction = result.actions.find(a => a.startsWith('timeout_'));
        if (timeoutAction && !actionsExecuted.includes('timeout_auto')) {
            try {
                const member = message.guild.members.cache.get(message.author.id)
                    || await message.guild.members.fetch(message.author.id);

                const duration = getTimeoutDuration(timeoutAction);
                await member.timeout(duration, result.reason);
                actionsExecuted.push(timeoutAction);

                // Send to mod log
                await sendModLogTimeout(message, result, timeoutAction, warningCount);

                logger.info('MODERATION', `Timed out ${message.author.tag} for ${getTimeoutDurationString(timeoutAction)}`);
            } catch (err) {
                logger.error('MODERATION', `Failed to timeout: ${err.message}`);
            }
        }

    } catch (error) {
        logger.error('MODERATION', `Action execution failed: ${error.message}`);
    }

    return { actionsExecuted, warningCount };
}

/**
 * Send a warning DM to the user with a nicely formatted embed
 */
async function sendWarningDM(message, warningCount, result, willTimeout) {
    try {
        const threshold = MODERATION_CONFIG.WARNING_THRESHOLD;
        const warningsRemaining = threshold - warningCount;
        const member = message.member;
        const user = message.author;

        // Get user's display info
        const username = user.username;
        const nickname = member?.nickname || null;
        const displayName = member?.displayName || username;
        const avatarURL = user.displayAvatarURL({ dynamic: true, size: 128 });
        const serverIconURL = message.guild.iconURL({ dynamic: true, size: 64 });

        // Truncate message content for display (avoid huge embeds)
        const originalMessage = message.content?.length > 200
            ? message.content.substring(0, 200) + '...'
            : message.content || '*[No text content]*';

        // Build the embed
        const embed = new EmbedBuilder()
            .setColor(0xFFCC00) // Yellow/gold color
            .setAuthor({
                name: `⚠️ Warning Received`,
                iconURL: serverIconURL
            })
            .setThumbnail(avatarURL) // User's avatar in top right
            .setDescription(`You have received a warning in **${message.guild.name}**`)
            .addFields(
                {
                    name: '👤 User Information',
                    value: [
                        `**Username:** ${username}`,
                        nickname ? `**Nickname:** ${nickname}` : null,
                        `**User ID:** \`${user.id}\``
                    ].filter(Boolean).join('\n'),
                    inline: true
                },
                {
                    name: '🏠 Server Information',
                    value: [
                        `**Server:** ${message.guild.name}`,
                        `**Channel:** #${message.channel.name}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '\u200B', // Spacer
                    value: '\u200B',
                    inline: false
                },
                {
                    name: '❌ Offense',
                    value: `\`\`\`${originalMessage}\`\`\``,
                    inline: false
                },
                {
                    name: '📜 Rule Violated',
                    value: result.rule_violated
                        ? `**${result.rule_violated}**`
                        : '*General rule violation*',
                    inline: true
                },
                {
                    name: '⚡ Warning Count',
                    value: `**${warningCount}** / ${threshold}`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({
                text: `${message.guild.name} • Moderation System`,
                iconURL: serverIconURL
            });

        // Add visual warning progress bar
        const progressBar = generateWarningBar(warningCount, threshold);
        embed.addFields({
            name: '📊 Warning Status',
            value: progressBar,
            inline: false
        });

        // Add timeout warning or notification based on status
        if (willTimeout) {
            embed.addFields({
                name: '🔇 Timeout Applied',
                value: `You have been **timed out for 1 hour** due to reaching ${threshold} warnings.\nYour warnings have been reset.`,
                inline: false
            });
            embed.setColor(0xFF4444); // Red for timeout
        } else if (warningsRemaining <= 1) {
            embed.addFields({
                name: '🚨 Final Warning',
                value: `**This is your final warning!**\nOne more violation will result in a timeout.`,
                inline: false
            });
            embed.setColor(0xFF8800); // Orange for final warning
        } else {
            embed.addFields({
                name: '💡 Note',
                value: `You have **${warningsRemaining}** warning(s) remaining before a timeout.\nWarnings expire after **24 hours** of good behavior.`,
                inline: false
            });
        }

        await message.author.send({ embeds: [embed] });
        logger.info('MODERATION', `Sent warning DM to ${user.tag} (${warningCount}/${threshold})`);

    } catch (err) {
        // User may have DMs disabled
        logger.warn('MODERATION', `Could not DM ${message.author.tag}: ${err.message}`);

        // Try to send in channel instead
        try {
            await message.channel.send({
                content: `⚠️ <@${message.author.id}> You have received a warning (${getWarningCount(message.guild.id, message.author.id)}/${MODERATION_CONFIG.WARNING_THRESHOLD}). Please follow the server rules.`,
            });
        } catch (channelErr) {
            logger.error('MODERATION', `Could not send warning in channel: ${channelErr.message}`);
        }
    }
}

/**
 * Generate a visual warning progress bar
 * @param {number} count - Current warning count
 * @param {number} threshold - Max warnings before timeout
 * @returns {string} Visual progress bar
 */
function generateWarningBar(count, threshold) {
    const filled = '🔴';
    const empty = '⚪';

    let bar = '';
    for (let i = 0; i < threshold; i++) {
        bar += i < count ? filled : empty;
    }

    // Add status text
    if (count >= threshold) {
        return `${bar} **TIMEOUT**`;
    } else if (count === threshold - 1) {
        return `${bar} ⚠️ **FINAL WARNING**`;
    } else {
        return `${bar}`;
    }
}

/**
 * Get embed color based on warning count
 */
function getWarningColor(count, threshold) {
    const ratio = count / threshold;
    if (ratio >= 1) return 0xFF0000;      // Red - timed out
    if (ratio >= 0.66) return 0xFF6600;   // Orange - final warning
    if (ratio >= 0.33) return 0xFFCC00;   // Yellow - getting close
    return 0xFFFF00;                       // Light yellow - first warning
}
