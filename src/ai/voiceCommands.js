import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { voiceClient } from './voiceClient.js';
import { logger } from './logger.js';

/**
 * Voice-related slash commands
 */
export const voiceCommands = [
    // /join - Join user's voice channel
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('Make the bot join your voice channel')
        .toJSON(),

    // /leave - Leave voice channel
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Make the bot leave the voice channel')
        .toJSON(),

    // /listen - Start transcribing voice
    new SlashCommandBuilder()
        .setName('listen')
        .setDescription('Start listening and transcribing voice in the channel')
        .toJSON(),

    // /stoplisten - Stop transcribing
    new SlashCommandBuilder()
        .setName('stoplisten')
        .setDescription('Stop listening and transcribing voice')
        .toJSON(),

    // /converse - Enable conversation mode (AI responds with TTS)
    new SlashCommandBuilder()
        .setName('converse')
        .setDescription('Enable conversation mode - AI will respond to speech with voice')
        .toJSON(),

    // /stopconverse - Disable conversation mode
    new SlashCommandBuilder()
        .setName('stopconverse')
        .setDescription('Disable conversation mode - AI will stop responding with voice')
        .toJSON(),

    // /voice - Combined voice control
    new SlashCommandBuilder()
        .setName('voice')
        .setDescription('Voice channel controls')
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join your voice channel and start listening')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Leave the voice channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('converse')
                .setDescription('Enable conversation mode with AI voice responses')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('quiet')
                .setDescription('Disable conversation mode (listen-only)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('transcripts')
                .setDescription('Toggle showing transcripts in text channel (off by default)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check voice connection status')
        )
        .toJSON(),
];

/**
 * Handle voice-related slash command interactions
 * @param {Object} interaction - Discord interaction
 * @returns {boolean} True if handled, false if not a voice command
 */
export async function handleVoiceCommand(interaction) {
    if (!interaction.isChatInputCommand()) return false;

    const { commandName, options, member, guild, channel } = interaction;

    // Handle /voice subcommands
    if (commandName === 'voice') {
        const subcommand = options.getSubcommand();

        switch (subcommand) {
            case 'join':
                return await handleJoin(interaction);
            case 'leave':
                return await handleLeave(interaction);
            case 'converse':
                return await handleConverse(interaction);
            case 'quiet':
                return await handleStopConverse(interaction);
            case 'transcripts':
                return await handleToggleTranscripts(interaction);
            case 'status':
                return await handleStatus(interaction);
            default:
                return false;
        }
    }

    // Handle individual commands
    switch (commandName) {
        case 'join':
            return await handleJoin(interaction);
        case 'leave':
            return await handleLeave(interaction);
        case 'listen':
            return await handleListen(interaction);
        case 'stoplisten':
            return await handleStopListen(interaction);
        case 'converse':
            return await handleConverse(interaction);
        case 'stopconverse':
            return await handleStopConverse(interaction);
        default:
            return false;
    }
}

/**
 * Handle /join command
 */
async function handleJoin(interaction) {
    const { member, guild, channel } = interaction;

    // Check if user is in a voice channel
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel) {
        await interaction.reply({
            content: '❌ You need to be in a voice channel first!',
            ephemeral: true
        });
        return true;
    }

    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions?.has('Connect') || !permissions?.has('Speak')) {
        await interaction.reply({
            content: '❌ I don\'t have permission to join that voice channel!',
            ephemeral: true
        });
        return true;
    }

    await interaction.deferReply();

    try {
        // Join the voice channel
        const connection = await voiceClient.join(voiceChannel, channel);

        if (!connection) {
            await interaction.editReply('❌ Failed to join the voice channel. Please try again.');
            return true;
        }

        // Auto-start listening
        const listening = await voiceClient.startListening(guild.id);

        if (listening) {
            await interaction.editReply(`✅ Joined **${voiceChannel.name}** and started listening! I'll transcribe what people say.`);
        } else {
            await interaction.editReply(`✅ Joined **${voiceChannel.name}**! Use \`/listen\` to start transcribing.`);
        }

        logger.info('VOICE', `${member.user.tag} requested join to ${voiceChannel.name}`);
    } catch (error) {
        logger.error('VOICE', 'Join command error', error);
        await interaction.editReply('❌ An error occurred while joining the voice channel.');
    }

    return true;
}

/**
 * Handle /leave command
 */
async function handleLeave(interaction) {
    const { guild } = interaction;

    if (!voiceClient.isConnected(guild.id)) {
        await interaction.reply({
            content: '❌ I\'m not in any voice channel!',
            ephemeral: true
        });
        return true;
    }

    await interaction.deferReply();

    try {
        await voiceClient.leave(guild.id);
        await interaction.editReply('👋 Left the voice channel. See you next time!');
        logger.info('VOICE', `Left voice channel in guild ${guild.id} (requested by ${interaction.user.tag})`);
    } catch (error) {
        logger.error('VOICE', 'Leave command error', error);
        await interaction.editReply('❌ An error occurred while leaving the voice channel.');
    }

    return true;
}

/**
 * Handle /listen command
 */
async function handleListen(interaction) {
    const { guild } = interaction;

    if (!voiceClient.isConnected(guild.id)) {
        await interaction.reply({
            content: '❌ I\'m not in any voice channel! Use `/join` first.',
            ephemeral: true
        });
        return true;
    }

    if (voiceClient.isListening(guild.id)) {
        await interaction.reply({
            content: '🎤 I\'m already listening!',
            ephemeral: true
        });
        return true;
    }

    await interaction.deferReply();

    try {
        const success = await voiceClient.startListening(guild.id);

        if (success) {
            await interaction.editReply('🎤 **Started listening!** I\'ll transcribe what people say.');
        } else {
            await interaction.editReply('❌ Failed to start listening. Check if Deepgram API is configured.');
        }
    } catch (error) {
        logger.error('VOICE', 'Listen command error', error);
        await interaction.editReply('❌ An error occurred while starting to listen.');
    }

    return true;
}

/**
 * Handle /stoplisten command
 */
async function handleStopListen(interaction) {
    const { guild } = interaction;

    if (!voiceClient.isConnected(guild.id)) {
        await interaction.reply({
            content: '❌ I\'m not in any voice channel!',
            ephemeral: true
        });
        return true;
    }

    if (!voiceClient.isListening(guild.id)) {
        await interaction.reply({
            content: '🔇 I\'m not currently listening.',
            ephemeral: true
        });
        return true;
    }

    await interaction.deferReply();

    try {
        await voiceClient.stopListening(guild.id);
        await interaction.editReply('🔇 **Stopped listening.** I\'m still in the voice channel.');
    } catch (error) {
        logger.error('VOICE', 'Stop listen command error', error);
        await interaction.editReply('❌ An error occurred while stopping.');
    }

    return true;
}

/**
 * Handle /voice status subcommand
 */
async function handleStatus(interaction) {
    const { guild } = interaction;

    const isConnected = voiceClient.isConnected(guild.id);
    const isListening = voiceClient.isListening(guild.id);
    const isConversing = voiceClient.isConversationMode(guild.id);
    const isShowingTranscripts = voiceClient.isShowingTranscripts(guild.id);
    const connectionInfo = voiceClient.getConnectionInfo(guild.id);
    const activeUsers = voiceClient.getActiveUserCount(guild.id);

    let status = '📊 **Voice Status**\n\n';

    if (!isConnected) {
        status += '🔴 Not connected to any voice channel';
    } else {
        status += `🟢 Connected to: **${connectionInfo?.voiceChannel?.name || 'Unknown'}**\n`;
        status += `🎤 Listening: ${isListening ? '**Yes**' : '**No**'}\n`;
        status += `💬 Conversation Mode: ${isConversing ? '**Enabled** (AI responds with voice)' : '**Disabled**'}\n`;
        status += `📝 Text Transcripts: ${isShowingTranscripts ? '**On** (shown in chat)' : '**Off** (voice only)'}\n`;
        status += `👥 Users being transcribed: **${activeUsers}**`;
    }

    await interaction.reply({
        content: status,
        ephemeral: true
    });

    return true;
}

/**
 * Handle /converse command - Enable conversation mode
 */
async function handleConverse(interaction) {
    const { member, guild, channel } = interaction;

    if (!voiceClient.isConnected(guild.id)) {
        // Try to join first
        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) {
            await interaction.reply({
                content: '❌ You need to be in a voice channel first!',
                ephemeral: true
            });
            return true;
        }

        await interaction.deferReply();

        // Join the voice channel
        const connection = await voiceClient.join(voiceChannel, channel);
        if (!connection) {
            await interaction.editReply('❌ Failed to join the voice channel.');
            return true;
        }

        // Start listening
        await voiceClient.startListening(guild.id);
    } else {
        await interaction.deferReply();

        // Make sure we're listening
        if (!voiceClient.isListening(guild.id)) {
            await voiceClient.startListening(guild.id);
        }
    }

    // Enable conversation mode
    voiceClient.setConversationMode(guild.id, true);

    await interaction.editReply('💬 **Conversation mode enabled!** I\'ll listen and respond with voice. Just speak naturally!');
    logger.info('VOICE', `Conversation mode enabled by ${member.user.tag}`);

    return true;
}

/**
 * Handle /stopconverse command - Disable conversation mode
 */
async function handleStopConverse(interaction) {
    const { guild } = interaction;

    if (!voiceClient.isConnected(guild.id)) {
        await interaction.reply({
            content: '❌ I\'m not in any voice channel!',
            ephemeral: true
        });
        return true;
    }

    // Disable conversation mode but keep listening
    voiceClient.setConversationMode(guild.id, false);

    await interaction.reply('🔇 **Conversation mode disabled.** I\'ll still transcribe but won\'t respond with voice.');
    logger.info('VOICE', `Conversation mode disabled by ${interaction.user.tag}`);

    return true;
}

/**
 * Handle /voice transcripts - Toggle text channel transcripts
 */
async function handleToggleTranscripts(interaction) {
    const { guild } = interaction;

    if (!voiceClient.isConnected(guild.id)) {
        await interaction.reply({
            content: '❌ I\'m not in any voice channel!',
            ephemeral: true
        });
        return true;
    }

    // Toggle the current state
    const currentState = voiceClient.isShowingTranscripts(guild.id);
    const newState = !currentState;

    voiceClient.setShowTranscripts(guild.id, newState);

    if (newState) {
        await interaction.reply('📝 **Transcripts enabled!** I\'ll now show what people say in this text channel.');
    } else {
        await interaction.reply('📝 **Transcripts disabled.** Voice-only mode - nothing will be posted in chat.');
    }

    logger.info('VOICE', `Transcripts ${newState ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);

    return true;
}
