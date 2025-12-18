/**
 * Mod Log - Sends timeout notifications to mod channel with action buttons
 * 
 * When a user is timed out, sends a detailed embed to the mod log channel
 * with Pardon, Kick, and Ban buttons for moderator review.
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../../ai/logger.js';
import { MODERATION_CONFIG, getTimeoutDurationString } from './constants.js';
import { getUserWarnings } from './warningTracker.js';

/**
 * Send a timeout notification to the mod log channel
 * @param {Object} message - Original Discord message that triggered the timeout
 * @param {Object} result - Moderation result with severity, rule_violated, etc.
 * @param {string} timeoutType - Type of timeout (timeout_short, timeout_medium, timeout_long, or timeout_auto)
 * @param {number} warningCount - Current warning count for the user
 */
export async function sendModLogTimeout(message, result, timeoutType, warningCount) {
    const channelId = MODERATION_CONFIG.MOD_LOG_CHANNEL_ID;

    // Skip if no mod log channel configured
    if (!channelId) {
        logger.debug('MODERATION', 'Mod log channel not configured, skipping mod log');
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

        // Determine timeout reason
        const isAutoTimeout = timeoutType === 'timeout_auto';
        const timeoutReason = isAutoTimeout
            ? `Reached ${MODERATION_CONFIG.WARNING_THRESHOLD} warnings`
            : result.rule_violated || 'Severe violation';

        // Build the mod log embed
        const embed = new EmbedBuilder()
            .setColor(0xFF4444) // Red for timeout
            .setAuthor({
                name: '🔇 User Timed Out',
                iconURL: guild.iconURL({ dynamic: true, size: 64 })
            })
            .setThumbnail(avatarURL)
            .setDescription(`**${user.tag}** has been timed out and requires moderator review.`)
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
                    name: '⏰ Timeout Details',
                    value: [
                        `**Duration:** ${getTimeoutDurationString(timeoutType) || '1 hour'}`,
                        `**Type:** ${isAutoTimeout ? 'Auto (warning threshold)' : 'Immediate (severity)'}`,
                        `**Warnings:** ${warningCount}/${MODERATION_CONFIG.WARNING_THRESHOLD}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '\u200B',
                    value: '\u200B',
                    inline: false
                },
                {
                    name: '📜 Rule Violated',
                    value: `**${timeoutReason}**`,
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
                    name: '📊 Severity',
                    value: `**Level ${result.severity}** / 4`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({
                text: 'Use the buttons below to take action',
                iconURL: guild.iconURL()
            });

        // Add warning history if there are previous warnings
        if (warningHistory.reasons && warningHistory.reasons.length > 0) {
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
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`mod_pardon_${user.id}`)
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

        logger.info('MODERATION', `Sent mod log for ${user.tag} timeout to #${modChannel.name}`);

    } catch (error) {
        logger.error('MODERATION', `Failed to send mod log: ${error.message}`);
    }
}

/**
 * Handle mod action button clicks
 * @param {Object} interaction - Discord button interaction
 */
export async function handleModActionButton(interaction) {
    const customId = interaction.customId;

    // Parse the button action and user ID
    const match = customId.match(/^mod_(pardon|kick|ban)_(\d+)$/);
    if (!match) return false;

    const [, action, userId] = match;
    const guild = interaction.guild;
    const moderator = interaction.member;

    try {
        // Check if user has permission to take this action
        const member = await guild.members.fetch(userId).catch(() => null);

        await interaction.deferReply({ ephemeral: true });

        switch (action) {
            case 'pardon':
                if (member) {
                    // Remove timeout
                    await member.timeout(null, `Pardoned by ${moderator.user.tag}`);
                    await interaction.editReply({
                        content: `✅ **${member.user.tag}** has been pardoned. Timeout removed.`
                    });

                    // Update the original embed
                    await updateModLogEmbed(interaction.message, 'pardoned', moderator);
                } else {
                    await interaction.editReply({
                        content: '❌ User is no longer in the server.'
                    });
                }
                break;

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
