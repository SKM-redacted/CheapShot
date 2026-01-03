import {
    SlashCommandBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
} from 'discord.js';

// Store pending registrations (modal -> original interaction mapping)
const pendingRegistrations = new Map();

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
            .setCustomId(`citizen_register_modal_${interaction.user.id}`)
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
    if (!interaction.customId.startsWith('citizen_register_modal_')) return false;

    const citizenName = interaction.fields.getTextInputValue('citizen_name');

    // Create a simple white placeholder image (1x1 white pixel as base64)
    const whitePixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH6AEDFwAAK6W+MQAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAAFElEQVR42u3BAQEAAACCIP+vbkhAAQAAAO8GEuAAAaClvDYAAAAASUVORK5CYII=', 'base64');
    const attachment = new AttachmentBuilder(whitePixel, { name: 'character.png' });

    // Create the welcome embed
    const embed = new EmbedBuilder()
        .setTitle(`⚔️ Welcome, ${citizenName}`)
        .setDescription('**Please create your character**\n\nCustomize your appearance and choose your origin city to begin your journey on Planet Redacted.')
        .setColor(0x9B59B6)
        .setImage('attachment://character.png')
        .setFooter({ text: 'Planet Redacted • Citizen Registration' });

    // Create placeholder buttons
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('citizen_customize_hair')
                .setLabel('Hair Style')
                .setEmoji('💇')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('citizen_customize_face')
                .setLabel('Face')
                .setEmoji('😀')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('citizen_customize_outfit')
                .setLabel('Outfit')
                .setEmoji('👕')
                .setStyle(ButtonStyle.Secondary)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('citizen_select_city')
                .setLabel('Choose City')
                .setEmoji('🏙️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('citizen_confirm')
                .setLabel('Confirm')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true) // Disabled until they customize
        );

    await interaction.reply({
        embeds: [embed],
        files: [attachment],
        components: [row1, row2],
        ephemeral: true
    });

    return true;
}

/**
 * Handle button interactions for citizen customization
 * @param {Object} interaction - Button interaction
 */
export async function handleButtonInteraction(interaction) {
    if (!interaction.customId.startsWith('citizen_')) return false;

    // For now, just acknowledge the button press
    await interaction.reply({
        content: '🚧 This feature is coming soon!',
        ephemeral: true
    });

    return true;
}
