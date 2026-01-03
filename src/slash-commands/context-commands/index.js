import { SlashCommandBuilder } from 'discord.js';
import { contextStore } from '../../ai/contextStore.js';
import { logger } from '../../ai/logger.js';

/**
 * Context management slash commands
 */
export const contextCommands = [
    new SlashCommandBuilder()
        .setName('context')
        .setDescription('Manage conversation context/memory')
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear your own conversation context with the bot')
        )
        .toJSON(),
];

/**
 * Handle context-related slash command interactions
 * @param {Object} interaction - Discord interaction
 * @returns {boolean} True if handled, false if not a context command
 */
export async function handleContextCommand(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName !== 'context') return false;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'clear') {
        return await handleClearUser(interaction);
    }

    return false;
}

/**
 * Handle /context clear - User clears their own context
 */
async function handleClearUser(interaction) {
    const { user } = interaction;

    try {
        const cleared = await contextStore.clearUserContext(user.id);

        await interaction.reply({
            content: `🧹 Cleared your conversation context! (${cleared} conversation${cleared !== 1 ? 's' : ''} removed)\n\nI won't remember our previous chats anymore.`,
            ephemeral: true
        });

        logger.info('CONTEXT_CMD', `${user.tag} cleared their own context (${cleared} cleared)`);
    } catch (error) {
        logger.error('CONTEXT_CMD', 'Error clearing user context', error);
        await interaction.reply({
            content: '❌ Failed to clear your context. Please try again.',
            ephemeral: true
        });
    }

    return true;
}
