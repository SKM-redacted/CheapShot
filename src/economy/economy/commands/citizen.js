import {
    SlashCommandBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} from 'discord.js';

/**
 * /citizen register - Register as a citizen of Planet Redacted
 * Uses a modal to collect the citizen's name
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
        // Create the modal
        const modal = new ModalBuilder()
            .setCustomId('citizen_register_modal')
            .setTitle('Citizen Registration');

        // Create the text input for citizen name
        const nameInput = new TextInputBuilder()
            .setCustomId('citizen_name')
            .setLabel("What is your citizen's name?")
            .setPlaceholder('Enter a name for your character...')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(32)
            .setRequired(true);

        // Add input to an action row
        const actionRow = new ActionRowBuilder().addComponents(nameInput);

        // Add the action row to the modal
        modal.addComponents(actionRow);

        // Show the modal
        await interaction.showModal(modal);
        return true;
    }

    return false;
}

/**
 * Handle modal submissions for citizen registration
 * @param {Object} interaction - Modal submit interaction
 */
export async function handleModalSubmit(interaction) {
    if (interaction.customId !== 'citizen_register_modal') return false;

    const citizenName = interaction.fields.getTextInputValue('citizen_name');

    const embed = new EmbedBuilder()
        .setTitle('Citizen Registration')
        .setDescription(`Welcome to Planet Redacted, **${citizenName}**!`)
        .setColor(0x9B59B6);

    await interaction.reply({ embeds: [embed] });
    return true;
}
