import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

/**
 * /citizen register - Basic citizen registration command
 * Returns an embed with just a title for now
 */
export const data = new SlashCommandBuilder()
    .setName('citizen')
    .setDescription('Citizen commands for Planet Redacted')
    .addSubcommand(subcommand =>
        subcommand
            .setName('register')
            .setDescription('Register as a citizen of Planet Redacted')
    );

/**
 * Handle the citizen command
 * @param {Object} interaction - Discord interaction
 */
export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'register') {
        const embed = new EmbedBuilder()
            .setTitle('Citizen Registration');

        await interaction.reply({ embeds: [embed] });
        return true;
    }

    return false;
}
