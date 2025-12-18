/**
 * Mod Log - Sends moderation notifications to mod channel with action buttons
 * 
 * When a user violates rules, sends a detailed embed to the mod log channel
 * with Pardon, Kick, and Ban buttons for moderator review.
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../../ai/logger.js';
import { MODERATION_CONFIG, getTimeoutDurationString } from './constants.js';
import { getUserWarnings, clearWarnings, removeWarning, getWarningCount } from './warningTracker.js';
import { getModerationChannelId } from '../channelConfig.js';

/**
 * Send a violation notification to the mod log channel
 * Called for ANY moderation action (warn, delete, timeout, etc.)
 * @param {Object} message - Original Discord message that triggered the action
 * @param {Object} result - Moderation result with severity, rule_violated, etc.
 * @param {string[]} actionsExecuted - Array of actions that were executed (e.g., ['deleted', 'warned'])
 * @param {number} warningCount - Current warning count for the user
 * @param {string|null} warningId - Unique ID of the warning (for pardon button)
 */
export async function sendModLogViolation(message, result, actionsExecuted, warningCount, warningId = null) {
    // Get the moderation channel ID for this guild from channel config
    const channelId = getModerationChannelId(message.guild.id);

    // Skip if no mod log channel configured for this guild
    if (!channelId) {
        logger.debug('MODERATION', `Mod log channel not configured for guild ${message.guild.id}, skipping mod log`);
        return;
    }

    // Skip if no actions were executed
    if (!actionsExecuted || actionsExecuted.length === 0) {
        return;
    }

    try {
        const guild = message.guild;
        const modChannel = await guild.channels.fetch(channelId).catch(() => null);

        if (!modChannel) {
            logger.warn('MODERATION', `Mod log channel ${channelId} not found in ${guild.name}`);
            return;
        }

        const user = message.author;
        const member = message.member;
        const avatarURL = user.displayAvatarURL({ dynamic: true, size: 128 });

        // Get user's warning history
        const warningHistory = getUserWarnings(guild.id, user.id);

        // Truncate message content
        const originalMessage = message.content?.length > 500
            ? message.content.substring(0, 500) + '...'
            : message.content || '*[No text content]*';

        // Determine the action type for the title
        const hasTimeout = actionsExecuted.some(a => a.startsWith('timeout'));
        const hasWarning = actionsExecuted.includes('warned');
        const hasDelete = actionsExecuted.includes('deleted');

        // Determine embed color and title based on severity
        let embedColor, embedTitle, embedEmoji;
        if (hasTimeout) {
            embedColor = 0xFF4444; // Red for timeout
            embedTitle = 'User Timed Out';
            embedEmoji = '🔇';
        } else if (result.severity >= 4) {
            embedColor = 0xFF4444; // Red for severe
            embedTitle = 'Severe Violation';
            embedEmoji = '🚨';
        } else if (result.severity >= 3) {
            embedColor = 0xFF8800; // Orange for high
            embedTitle = 'Rule Violation';
            embedEmoji = '⚠️';
        } else {
            embedColor = 0xFFCC00; // Yellow for warning
            embedTitle = 'Warning Issued';
            embedEmoji = '⚡';
        }

        // Format actions list
        const actionsText = actionsExecuted.map(action => {
            switch (action) {
                case 'deleted': return '🗑️ Message deleted';
                case 'warned': return '⚠️ Warning issued';
                case 'timeout_short': return '🔇 Timed out (5 min)';
                case 'timeout_medium': return '🔇 Timed out (1 hour)';
                case 'timeout_long': return '🔇 Timed out (24 hours)';
                case 'timeout_auto': return '🔇 Auto-timeout (warning threshold)';
                default: return `📋 ${action}`;
            }
        }).join('\n');

        // Build the mod log embed
        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setAuthor({
                name: `${embedEmoji} ${embedTitle}`,
                iconURL: guild.iconURL({ dynamic: true, size: 64 })
            })
            .setThumbnail(avatarURL)
            .setDescription(`**${user.tag}** violated server rules and requires moderator attention.`)
            .addFields(
                {
                    name: '👤 User Information',
                    value: [
                        `**Username:** ${user.username}`,
                        member?.nickname ? `**Nickname:** ${member.nickname}` : null,
                        `**User ID:** \`${user.id}\``,
                        `**Account Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`
                    ].filter(Boolean).join('\n'),
                    inline: true
                },
                {
                    name: '⚡ Actions Taken',
                    value: actionsText,
                    inline: true
                },
                {
                    name: '\u200B',
                    value: '\u200B',
                    inline: false
                },
                {
                    name: '📜 Rule Violated',
                    value: `**${result.rule_violated || 'General violation'}**`,
                    inline: false
                },
                {
                    name: '❌ Offensive Message',
                    value: `\`\`\`${originalMessage}\`\`\``,
                    inline: false
                },
                {
                    name: '📍 Context',
                    value: [
                        `**Channel:** <#${message.channel.id}>`,
                        `**Time:** <t:${Math.floor(message.createdTimestamp / 1000)}:f>`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '📊 Status',
                    value: [
                        `**Severity:** Level ${result.severity}/4`,
                        `**Warnings:** ${warningCount}/${MODERATION_CONFIG.WARNING_THRESHOLD}`
                    ].join('\n'),
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({
                text: 'Use the buttons below to take action',
                iconURL: guild.iconURL()
            });

        // Add warning history if there are previous warnings
        if (warningHistory.reasons && warningHistory.reasons.length > 1) {
            const historyText = warningHistory.reasons
                .slice(-5) // Last 5 warnings
                .map((reason, i) => `${i + 1}. ${reason}`)
                .join('\n');

            embed.addFields({
                name: '📋 Recent Warning History',
                value: historyText || '*No previous warnings*',
                inline: false
            });
        }

        // Create action buttons
        // Include warning ID in pardon button so we can remove just that specific warning
        const pardonCustomId = warningId
            ? `mod_pardon_${user.id}_${warningId}`
            : `mod_pardon_${user.id}_all`;

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(pardonCustomId)
                    .setLabel('Pardon')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`mod_kick_${user.id}`)
                    .setLabel('Kick')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('👢'),
                new ButtonBuilder()
                    .setCustomId(`mod_ban_${user.id}`)
                    .setLabel('Ban')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔨')
            );

        // Send to mod channel
        await modChannel.send({ embeds: [embed], components: [actionRow] });

        logger.info('MODERATION', `Sent mod log for ${user.tag} to #${modChannel.name} (actions: ${actionsExecuted.join(', ')})`);

    } catch (error) {
        logger.error('MODERATION', `Failed to send mod log: ${error.message}`);
    }
}

/**
 * Send a timeout notification to the mod log channel (legacy, kept for compatibility)
 * @deprecated Use sendModLogViolation instead
 */
export async function sendModLogTimeout(message, result, timeoutType, warningCount) {
    // Convert to the new format
    const actionsExecuted = [timeoutType];
    await sendModLogViolation(message, result, actionsExecuted, warningCount);
}

/**
 * Handle mod action button clicks
 * @param {Object} interaction - Discord button interaction
 */
export async function handleModActionButton(interaction) {
    const customId = interaction.customId;
    const guild = interaction.guild;
    const moderator = interaction.member;

    // Parse pardon button: mod_pardon_{userId}_{warningId} or mod_pardon_{userId}_all
    const pardonMatch = customId.match(/^mod_pardon_(\d+)_(.+)$/);
    if (pardonMatch) {
        const [, userId, warningIdOrAll] = pardonMatch;
        return await handlePardon(interaction, guild, moderator, userId, warningIdOrAll);
    }

    // Parse kick/ban buttons: mod_{action}_{userId}
    const actionMatch = customId.match(/^mod_(kick|ban)_(\d+)$/);
    if (!actionMatch) return false;

    const [, action, userId] = actionMatch;
    const member = await guild.members.fetch(userId).catch(() => null);

    await interaction.deferReply({ ephemeral: true });

    try {
        switch (action) {
            case 'kick':
                if (member) {
                    if (!member.kickable) {
                        await interaction.editReply({
                            content: '❌ Cannot kick this user - they may have higher permissions.'
                        });
                        return true;
                    }

                    await member.kick(`Kicked by ${moderator.user.tag} via mod review`);
                    await interaction.editReply({
                        content: `👢 **${member.user.tag}** has been kicked from the server.`
                    });

                    await updateModLogEmbed(interaction.message, 'kicked', moderator);
                } else {
                    await interaction.editReply({
                        content: '❌ User is no longer in the server.'
                    });
                }
                break;

            case 'ban':
                if (member) {
                    if (!member.bannable) {
                        await interaction.editReply({
                            content: '❌ Cannot ban this user - they may have higher permissions.'
                        });
                        return true;
                    }

                    await member.ban({ reason: `Banned by ${moderator.user.tag} via mod review` });
                    await interaction.editReply({
                        content: `🔨 **${member.user.tag}** has been banned from the server.`
                    });

                    await updateModLogEmbed(interaction.message, 'banned', moderator);
                } else {
                    // User left but we can still ban by ID
                    await guild.members.ban(userId, { reason: `Banned by ${moderator.user.tag} via mod review` });
                    await interaction.editReply({
                        content: `🔨 User \`${userId}\` has been banned from the server.`
                    });

                    await updateModLogEmbed(interaction.message, 'banned', moderator);
                }
                break;
        }

        logger.info('MODERATION', `${moderator.user.tag} used mod action: ${action} on user ${userId}`);
        return true;

    } catch (error) {
        logger.error('MODERATION', `Mod action ${action} failed: ${error.message}`);
        await interaction.editReply({
            content: `❌ Action failed: ${error.message}`
        }).catch(() => { });
        return true;
    }
}

/**
 * Handle the pardon button click
 * @param {Object} interaction - Discord button interaction
 * @param {Object} guild - Discord guild
 * @param {Object} moderator - Moderator member who clicked
 * @param {string} userId - User ID to pardon
 * @param {string} warningIdOrAll - Warning ID to remove, or 'all' to clear all warnings
 */
async function handlePardon(interaction, guild, moderator, userId, warningIdOrAll) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const member = await guild.members.fetch(userId).catch(() => null);

        // Remove timeout if user is still in server
        if (member) {
            try {
                await member.timeout(null, `Pardoned by ${moderator.user.tag}`);
            } catch (err) {
                // Timeout removal may fail if user wasn't timed out
                logger.debug('MODERATION', `Could not remove timeout for ${userId}: ${err.message}`);
            }
        }

        // Remove the specific warning or all warnings
        let warningsRemoved = 0;
        let remainingWarnings = 0;

        if (warningIdOrAll === 'all') {
            // Clear ALL warnings (legacy behavior)
            warningsRemoved = clearWarnings(guild.id, userId);
            remainingWarnings = 0;
        } else {
            // Remove only the specific warning
            const removed = removeWarning(guild.id, warningIdOrAll);
            warningsRemoved = removed ? 1 : 0;
            remainingWarnings = getWarningCount(guild.id, userId);
        }

        // Build response message
        let responseContent;
        if (member) {
            if (warningIdOrAll === 'all') {
                responseContent = `✅ **${member.user.tag}** has been pardoned.\n• Timeout removed\n• All warnings cleared`;
            } else if (warningsRemoved > 0) {
                responseContent = `✅ **${member.user.tag}** has been pardoned.\n• Timeout removed\n• Warning removed (${remainingWarnings} remaining)`;
            } else {
                responseContent = `⚠️ **${member.user.tag}**'s timeout was removed, but the warning was already expired or removed.`;
            }
        } else {
            if (warningsRemoved > 0) {
                responseContent = `⚠️ User is no longer in the server.\n• Warning removed (${remainingWarnings} remaining on record)`;
            } else {
                responseContent = `⚠️ User is no longer in the server and the warning was already expired or removed.`;
            }
        }

        await interaction.editReply({ content: responseContent });

        // Update the original embed
        await updateModLogEmbed(interaction.message, 'pardoned', moderator);

        logger.info('MODERATION', `${moderator.user.tag} pardoned user ${userId} (warning: ${warningIdOrAll})`);
        return true;

    } catch (error) {
        logger.error('MODERATION', `Pardon failed for ${userId}: ${error.message}`);
        await interaction.editReply({
            content: `❌ Pardon failed: ${error.message}`
        }).catch(() => { });
        return true;
    }
}

/**
 * Update the mod log embed after an action is taken
 */
async function updateModLogEmbed(message, action, moderator) {
    try {
        const embed = EmbedBuilder.from(message.embeds[0]);

        // Change color based on action
        const colors = {
            pardoned: 0x00FF00,  // Green
            kicked: 0xFFA500,   // Orange
            banned: 0x8B0000    // Dark red
        };

        embed.setColor(colors[action] || 0x808080);

        // Add resolution field
        embed.addFields({
            name: '✅ Resolution',
            value: `**${action.charAt(0).toUpperCase() + action.slice(1)}** by ${moderator.user.tag}`,
            inline: false
        });

        // Disable all buttons
        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('mod_pardon_disabled')
                    .setLabel('Pardon')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✅')
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('mod_kick_disabled')
                    .setLabel('Kick')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👢')
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('mod_ban_disabled')
                    .setLabel('Ban')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔨')
                    .setDisabled(true)
            );

        await message.edit({ embeds: [embed], components: [disabledRow] });
    } catch (error) {
        logger.error('MODERATION', `Failed to update mod log embed: ${error.message}`);
    }
}
