/**
 * Discord Tools - Voice Channel Operations
 * 
 * Handlers for joining/leaving voice channels, moving members,
 * and listing voice channel status.
 */

import { ChannelType } from 'discord.js';
import { voiceClient } from '../voiceClient.js';
import { voiceMemory } from '../voiceMemory.js';
import {
    logger,
    findVoiceChannel,
    findMemberSmart
} from './helpers.js';

// ============================================================
// VOICE CHANNEL JOIN/LEAVE HANDLERS
// ============================================================

/**
 * Handler for joining a voice channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { channel_name?, start_listening?, conversation_mode? }
 * @param {Object} context - Additional context { member, message }
 * @returns {Promise<{success: boolean, channel?: Object, error?: string}>}
 */
export async function handleJoinVoice(guild, args, context = {}) {
    const { channel_name, start_listening = true, conversation_mode = true } = args;
    const { member, message } = context;

    if (!guild) {
        logger.error('TOOL', 'Cannot join voice: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        let voiceChannel = null;

        // If channel name specified, find it
        if (channel_name) {
            voiceChannel = findVoiceChannel(guild, channel_name);
            if (!voiceChannel) {
                return { success: false, error: `No voice channel found matching "${channel_name}"` };
            }
        }
        // Otherwise, try to join the user's current voice channel
        else if (member?.voice?.channel) {
            voiceChannel = member.voice.channel;
        } else {
            return { success: false, error: "No channel specified and user is not in a voice channel" };
        }

        // Get text channel for transcripts (use the message channel if available)
        const textChannel = message?.channel || null;

        logger.info('TOOL', `Joining voice channel "${voiceChannel.name}" in guild ${guild.name}`);

        // Join the voice channel
        const connection = await voiceClient.join(voiceChannel, textChannel);

        if (!connection) {
            return { success: false, error: 'Failed to join voice channel' };
        }

        // Start listening if requested
        if (start_listening) {
            await voiceClient.startListening(guild.id);
        }

        // Enable conversation mode if requested
        if (conversation_mode) {
            voiceClient.setConversationMode(guild.id, true);
        }

        // Import recent text channel messages for context
        // This gives the AI knowledge of what was being discussed before joining
        let importedContext = 0;
        if (textChannel) {
            // Get the bot's user ID to identify our own messages
            const botId = message?.client?.user?.id || null;
            importedContext = await voiceMemory.importTextChannelContext(
                guild.id,
                textChannel,
                10, // Fetch last 10 messages
                botId
            );
        }

        logger.info('TOOL', `Successfully joined voice channel "${voiceChannel.name}"${importedContext > 0 ? ` with ${importedContext} messages of context` : ''}`);

        return {
            success: true,
            channel: {
                id: voiceChannel.id,
                name: voiceChannel.name
            },
            listening: start_listening,
            conversationMode: conversation_mode,
            contextImported: importedContext,
            message: `Joined "${voiceChannel.name}"${start_listening ? ' and started listening' : ''}${conversation_mode ? ' in conversation mode' : ''}${importedContext > 0 ? ` (loaded ${importedContext} messages of chat context)` : ''}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to join voice channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to join voice channel'
        };
    }
}

/**
 * Handler for leaving a voice channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments (none required)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function handleLeaveVoice(guild, args) {
    if (!guild) {
        logger.error('TOOL', 'Cannot leave voice: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        // Check if we're in a voice channel
        const isConnected = voiceClient.isConnected(guild.id);

        if (!isConnected) {
            return { success: false, error: "I'm not in a voice channel" };
        }

        logger.info('TOOL', `Leaving voice channel in guild ${guild.name}`);

        await voiceClient.leave(guild.id);

        logger.info('TOOL', `Successfully left voice channel`);

        return {
            success: true,
            message: 'Left the voice channel'
        };

    } catch (error) {
        logger.error('TOOL', `Failed to leave voice channel: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to leave voice channel'
        };
    }
}

/**
 * Handler for toggling voice conversation mode
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { enabled }
 * @returns {Promise<{success: boolean, enabled?: boolean, error?: string}>}
 */
export async function handleVoiceConversation(guild, args) {
    const { enabled } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot toggle conversation mode: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (enabled === undefined) {
        return { success: false, error: 'Must specify whether to enable or disable conversation mode' };
    }

    try {
        // Check if we're in a voice channel
        const isConnected = voiceClient.isConnected(guild.id);

        if (!isConnected) {
            return { success: false, error: "I'm not in a voice channel. Use join_voice first." };
        }

        logger.info('TOOL', `${enabled ? 'Enabling' : 'Disabling'} conversation mode in guild ${guild.name}`);

        voiceClient.setConversationMode(guild.id, enabled);

        // Also start/stop listening based on conversation mode
        if (enabled) {
            await voiceClient.startListening(guild.id);
        }

        logger.info('TOOL', `Conversation mode ${enabled ? 'enabled' : 'disabled'}`);

        return {
            success: true,
            enabled: enabled,
            message: `Conversation mode ${enabled ? 'enabled - I will now respond to voice' : 'disabled - I will stop responding to voice'}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to toggle conversation mode: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to toggle conversation mode'
        };
    }
}

// ============================================================
// VOICE MEMBER MOVEMENT HANDLERS
// ============================================================

/**
 * Handler for moving a member to another voice channel
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { member, target_channel }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function handleMoveMember(guild, args) {
    const { member: memberName, target_channel: targetChannelName } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot move member: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!memberName) {
        return { success: false, error: 'Must specify which member to move' };
    }

    if (!targetChannelName) {
        return { success: false, error: 'Must specify target voice channel' };
    }

    try {
        // Find the member using smart lookup (avoids timeouts)
        const targetMember = await findMemberSmart(guild, memberName);

        if (!targetMember) {
            return { success: false, error: `Could not find member "${memberName}"` };
        }

        // Check if member is in a voice channel
        if (!targetMember.voice?.channel) {
            return { success: false, error: `${targetMember.displayName} is not in a voice channel` };
        }

        const currentChannel = targetMember.voice.channel;

        // Find the target voice channel
        const targetChannel = findVoiceChannel(guild, targetChannelName);

        if (!targetChannel) {
            return { success: false, error: `Could not find voice channel "${targetChannelName}"` };
        }

        // Check if they're already in the target channel
        if (currentChannel.id === targetChannel.id) {
            return { success: true, message: `${targetMember.displayName} is already in ${targetChannel.name}` };
        }

        logger.info('TOOL', `Moving ${targetMember.displayName} from "${currentChannel.name}" to "${targetChannel.name}"`);

        // Move the member
        await targetMember.voice.setChannel(targetChannel);

        logger.info('TOOL', `Successfully moved ${targetMember.displayName} to "${targetChannel.name}"`);

        return {
            success: true,
            member: {
                id: targetMember.id,
                name: targetMember.displayName
            },
            from_channel: {
                id: currentChannel.id,
                name: currentChannel.name
            },
            to_channel: {
                id: targetChannel.id,
                name: targetChannel.name
            },
            message: `Moved ${targetMember.displayName} from "${currentChannel.name}" to "${targetChannel.name}"`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to move member: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to move member'
        };
    }
}

/**
 * Handler for moving multiple members to a voice channel at once
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { members: string[], target_channel: string }
 * @returns {Promise<{success: boolean, moved?: Array, failed?: Array, error?: string}>}
 */
export async function handleMoveMembersBulk(guild, args) {
    const { members: memberNames, target_channel: targetChannelName } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot move members: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!memberNames || !Array.isArray(memberNames) || memberNames.length === 0) {
        return { success: false, error: 'Must specify which members to move (array of names)' };
    }

    if (!targetChannelName) {
        return { success: false, error: 'Must specify target voice channel' };
    }

    // Find the target voice channel first
    const targetChannel = findVoiceChannel(guild, targetChannelName);
    if (!targetChannel) {
        return { success: false, error: `Could not find voice channel "${targetChannelName}"` };
    }

    const moved = [];
    const failed = [];

    // Move each member
    for (const memberName of memberNames) {
        try {
            const result = await handleMoveMember(guild, {
                member: memberName,
                target_channel: targetChannelName
            });

            if (result.success) {
                moved.push({
                    name: result.member?.name || memberName,
                    from: result.from_channel?.name,
                    to: result.to_channel?.name
                });
            } else {
                failed.push({
                    name: memberName,
                    error: result.error
                });
            }
        } catch (error) {
            failed.push({
                name: memberName,
                error: error.message
            });
        }
    }

    const success = moved.length > 0;
    let message = '';

    if (moved.length > 0) {
        message = `Moved ${moved.length} member${moved.length !== 1 ? 's' : ''} to "${targetChannel.name}"`;
        if (failed.length > 0) {
            message += `, ${failed.length} failed`;
        }
    } else {
        message = `Failed to move any members: ${failed.map(f => f.error).join('; ')}`;
    }

    logger.info('TOOL', `Bulk move complete: ${moved.length} moved, ${failed.length} failed`);

    return {
        success,
        moved,
        failed,
        target_channel: {
            id: targetChannel.id,
            name: targetChannel.name
        },
        message
    };
}

// ============================================================
// VOICE CHANNEL LISTING HANDLERS
// ============================================================

/**
 * Handler for listing voice channels and their members
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments (none required)
 * @returns {Promise<{success: boolean, channels?: Array, error?: string}>}
 */
export async function handleListVoiceChannels(guild, args) {
    if (!guild) {
        logger.error('TOOL', 'Cannot list voice channels: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        // Get all voice channels
        const voiceChannels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
            .sort((a, b) => a.position - b.position);

        if (voiceChannels.size === 0) {
            return {
                success: true,
                channels: [],
                message: 'No voice channels found in this server'
            };
        }

        // Build list with members
        const channelList = [];

        for (const [id, channel] of voiceChannels) {
            const members = channel.members.map(m => ({
                id: m.id,
                name: m.displayName,
                username: m.user.username
            }));

            channelList.push({
                id: channel.id,
                name: channel.name,
                category: channel.parent?.name || null,
                memberCount: members.length,
                members: members
            });
        }

        // Create a readable summary
        const summary = channelList.map(ch => {
            const membersStr = ch.members.length > 0
                ? ch.members.map(m => m.name).join(', ')
                : '(empty)';
            return `• ${ch.name}: ${membersStr}`;
        }).join('\n');

        logger.info('TOOL', `Listed ${channelList.length} voice channels`);

        return {
            success: true,
            channels: channelList,
            summary: summary,
            message: `Found ${channelList.length} voice channels:\n${summary}`
        };

    } catch (error) {
        logger.error('TOOL', `Failed to list voice channels: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to list voice channels'
        };
    }
}
