/**
 * Server Setup Script
 * Runs when the bot joins a new Discord server
 * 
 * This module handles initial setup tasks like:
 * - Sending a welcome message to the server owner
 * - Creating default CheapShot channels
 * - Storing channel IDs in database (primary) and guild data (fallback)
 * - Logging the join event
 */

import { EmbedBuilder, ChannelType, PermissionFlagsBits, AuditLogEvent } from 'discord.js';
import { logger } from '../ai/logger.js';
import db from '../shared/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to guild data directory (legacy fallback)
const GUILD_DATA_PATH = path.join(__dirname, '../../data/guild');

// Channel names to check/create
const CHANNEL_NAMES = {
    public: 'cheapshot',
    private: 'cheapshot-private',
    moderation: 'cheapshot-moderation'
};

/**
 * Ensure the guild data directory exists
 * @param {string} guildId - Guild ID
 * @returns {string} Path to the guild's data directory
 */
function ensureGuildDirectory(guildId) {
    const guildDir = path.join(GUILD_DATA_PATH, guildId);

    if (!fs.existsSync(GUILD_DATA_PATH)) {
        fs.mkdirSync(GUILD_DATA_PATH, { recursive: true });
    }

    if (!fs.existsSync(guildDir)) {
        fs.mkdirSync(guildDir, { recursive: true });
    }

    return guildDir;
}

/**
 * Save channel data to both database and file (for redundancy)
 * Database is primary (dashboard reads from it), file is fallback
 * @param {string} guildId - Guild ID
 * @param {Object} channels - Object with channel names as keys, each containing {id, type}
 */
async function saveChannelData(guildId, channels) {
    // 1. Save to database (primary - dashboard reads this)
    try {
        await db.saveChannelConfig(guildId, channels);
        logger.info('SERVER_SETUP', `Saved channel data to database for guild ${guildId}`);
    } catch (dbError) {
        logger.error('SERVER_SETUP', `Failed to save to database: ${dbError.message}`);
    }

    // 2. Also save to file (fallback for when database is unavailable)
    try {
        const guildDir = ensureGuildDirectory(guildId);
        const channelsFile = path.join(guildDir, 'channels.json');

        const data = {
            channels: channels
        };

        fs.writeFileSync(channelsFile, JSON.stringify(data, null, 2));
        logger.info('SERVER_SETUP', `Saved channel data to ${channelsFile}`);
    } catch (fileError) {
        logger.error('SERVER_SETUP', `Failed to save channel data to file: ${fileError.message}`);
    }
}

/**
 * Load channel data from the guild's channels.json file
 * @param {string} guildId - Guild ID
 * @returns {Object|null} Channel data or null if not found
 */
export function loadChannelData(guildId) {
    try {
        const channelsFile = path.join(GUILD_DATA_PATH, guildId, 'channels.json');

        if (fs.existsSync(channelsFile)) {
            const data = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
            return data;
        }

        return null;
    } catch (error) {
        logger.error('SERVER_SETUP', `Failed to load channel data: ${error.message}`);
        return null;
    }
}

/**
 * Handle bot joining a new server
 * @param {Object} guild - Discord.js Guild object
 * @param {Object} bot - The bot that received the event
 */
export async function handleGuildCreate(guild, bot) {
    logger.info('SERVER_SETUP', `Joined new server: ${guild.name} (${guild.id})`);
    logger.info('SERVER_SETUP', `Server has ${guild.memberCount} members`);

    try {
        // Create CheapShot channels first (so we have IDs for the welcome message)
        const channelIds = await createCheapShotChannels(guild, bot);

        // Send a welcome message to whoever invited the bot (via audit logs)
        await sendInviterWelcome(guild, channelIds, bot);

        // Log successful setup
        logger.info('SERVER_SETUP', `Setup complete for ${guild.name}`);

    } catch (error) {
        logger.error('SERVER_SETUP', `Error during server setup for ${guild.name}`, error);
    }
}

/**
 * Send a welcome DM to whoever invited the bot (via audit logs)
 * Falls back to server owner if audit log check fails
 * @param {Object} guild - Discord.js Guild object
 * @param {Object} channelIds - Object with public, private, moderation channel IDs
 * @param {Object} bot - The bot object
 */
async function sendInviterWelcome(guild, channelIds, bot) {
    try {
        // Try to find who added the bot via audit logs
        let inviter = null;

        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.BotAdd,
                limit: 5
            });

            // Find the log entry for this bot being added
            const botAddEntry = auditLogs.entries.find(
                entry => entry.target?.id === bot.client.user.id
            );

            if (botAddEntry && botAddEntry.executor) {
                inviter = botAddEntry.executor;
                logger.info('SERVER_SETUP', `Found inviter via audit logs: ${inviter.tag}`);
            }
        } catch (auditError) {
            logger.warn('SERVER_SETUP', `Could not fetch audit logs: ${auditError.message}`);
        }

        // Fall back to server owner if we couldn't find the inviter
        if (!inviter) {
            const owner = await guild.fetchOwner();
            inviter = owner.user;
            logger.info('SERVER_SETUP', `Falling back to owner: ${inviter.tag}`);
        }

        // Build channel links using full Discord URLs (works in DMs)
        const baseUrl = `https://discord.com/channels/${guild.id}`;
        const publicLink = channelIds?.public ? `${baseUrl}/${channelIds.public}` : '#cheapshot';
        const privateLink = channelIds?.private ? `${baseUrl}/${channelIds.private}` : '#cheapshot-private';
        const moderationLink = channelIds?.moderation ? `${baseUrl}/${channelIds.moderation}` : '#cheapshot-moderation';

        const welcomeEmbed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('👋 Thanks for adding CheapShot!')
            .setDescription(
                `Hey **${inviter.displayName || inviter.username}**! Thanks for adding me to **${guild.name}**!\n\n` +
                `I've created some channels for you to interact with me:`
            )
            .addFields(
                {
                    name: '💬 Your CheapShot Channels',
                    value: `**Public:** ${publicLink}\nEveryone can chat with me here\n\n` +
                        `**Private:** ${privateLink}\nFor requests you want to keep off the books\n\n` +
                        `**Moderation:** ${moderationLink}\nModeration logs and alerts (moderators only)`,
                    inline: false
                },
                {
                    name: '🤖 AI Assistant',
                    value: `Chat with me in ${publicLink} or ${privateLink} - no need to @ mention me there!`,
                    inline: false
                },
                {
                    name: '🎨 Image Generation',
                    value: `Ask me to generate images in ${publicLink} or ${privateLink}!`,
                    inline: false
                },
                {
                    name: '🎤 Voice Chat',
                    value: `Ask me to join voice in ${publicLink}`,
                    inline: false
                },
                {
                    name: '🛠️ Server Management',
                    value: `Just ask me naturally in ${privateLink} - "create a channel", "give @user a role", etc.`,
                    inline: false
                },
                {
                    name: '⚠️ Important: Role Setup',
                    value: 'For moderation features to work properly, please move my role **above** other roles in Server Settings → Roles. This allows me to manage members and roles below me.',
                    inline: false
                },
                {
                    name: '🚧⚠️ AI MODERATION - EXPERIMENTAL ⚠️🚧',
                    value: '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**\n' +
                        '⛔ **WE HIGHLY RECOMMEND NOT ENABLING THIS FEATURE** ⛔\n\n' +
                        '**This is a DEVELOPMENTAL feature that is actively being tested.**\n\n' +
                        '⚠️ AI moderation may produce **false positives** and incorrectly flag innocent messages\n' +
                        '⚠️ May cause **unexpected timeouts/warnings** that could harm your community\n' +
                        '⚠️ Not thoroughly tested in production environments\n' +
                        '⚠️ Could miss actual violations while flagging harmless content\n\n' +
                        `If you still wish to proceed, configure AI moderation in ${moderationLink} or via the dashboard. **Use at your own risk.**\n\n` +
                        '📢 *All servers will receive a notification when this feature is production ready.*\n' +
                        '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**',
                    inline: false
                }
            )
            .setFooter({ text: 'CheapShot AI Bot' })
            .setTimestamp();

        await inviter.send({ embeds: [welcomeEmbed] });
        logger.info('SERVER_SETUP', `Sent welcome DM to inviter: ${inviter.tag}`);

    } catch (error) {
        logger.warn('SERVER_SETUP', `Could not DM inviter: ${error.message}`);
        // This is okay - user might have DMs disabled
    }
}

/**
 * Create CheapShot channels if they don't already exist
 * @param {Object} guild - Discord.js Guild object
 * @param {Object} bot - The bot object
 * @returns {Object} Object with public, private, moderation channel IDs
 */
async function createCheapShotChannels(guild, bot) {
    try {
        // Check if any CheapShot channels already exist
        const existingPublic = guild.channels.cache.find(c => c.name === CHANNEL_NAMES.public);
        const existingPrivate = guild.channels.cache.find(c => c.name === CHANNEL_NAMES.private);
        const existingModeration = guild.channels.cache.find(c => c.name === CHANNEL_NAMES.moderation);

        // If all channels exist, skip creation but still save IDs
        if (existingPublic && existingPrivate && existingModeration) {
            logger.info('SERVER_SETUP', `CheapShot channels already exist in ${guild.name}, saving IDs`);

            // Save existing channel IDs with type field
            const channelData = {
                [CHANNEL_NAMES.public]: { id: existingPublic.id, type: 'public' },
                [CHANNEL_NAMES.private]: { id: existingPrivate.id, type: 'private' },
                [CHANNEL_NAMES.moderation]: { id: existingModeration.id, type: 'moderation' }
            };
            await saveChannelData(guild.id, channelData);

            return {
                public: existingPublic.id,
                private: existingPrivate.id,
                moderation: existingModeration.id
            };
        }

        logger.info('SERVER_SETUP', `Creating CheapShot channels in ${guild.name}...`);

        // Track channel IDs for saving (object structure)
        const channelData = {};

        // Get the bot's member object for permission overwrites
        const botMember = guild.members.cache.get(bot.client.user.id)
            || await guild.members.fetch(bot.client.user.id);

        // 1. Create public CheapShot channel (everyone can use)
        let publicChannelId;
        if (!existingPublic) {
            const publicChannel = await guild.channels.create({
                name: CHANNEL_NAMES.public,
                type: ChannelType.GuildText,
                topic: '🤖 Chat with CheapShot AI! Ask questions, generate images, and more.',
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                    {
                        id: bot.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ReadMessageHistory
                        ],
                    },
                ],
            });

            publicChannelId = publicChannel.id;

            // Send description
            const publicEmbed = new EmbedBuilder()
                .setColor(0x00AE86)
                .setTitle('🤖 Welcome to CheapShot!')
                .setDescription(
                    'This is the public CheapShot channel where everyone can interact with me!\n\n' +
                    '**What you can do here:**\n' +
                    '• Ask me questions\n' +
                    '• Generate images\n' +
                    '• Get help with anything\n\n' +
                    '*Just send a message and we can get started!*'
                )
                .setFooter({ text: 'CheapShot AI' });

            await publicChannel.send({ embeds: [publicEmbed] });
            logger.info('SERVER_SETUP', `Created public channel: #${CHANNEL_NAMES.public}`);
        } else {
            publicChannelId = existingPublic.id;
        }
        channelData[CHANNEL_NAMES.public] = { id: publicChannelId, type: 'public' };

        // 2. Create private CheapShot channel (for private tool calling)
        let privateChannelId;
        if (!existingPrivate) {
            const privateChannel = await guild.channels.create({
                name: CHANNEL_NAMES.private,
                type: ChannelType.GuildText,
                topic: '🔒 Private CheapShot channel - just ask me anything in plain English!',
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone - deny by default
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: bot.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageMessages
                        ],
                    },
                ],
            });

            privateChannelId = privateChannel.id;

            // Send description
            const privateEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔒 Private CheapShot Channel')
                .setDescription(
                    'This is the private channel for CheapShot - keep sensitive requests off the public logs.\n\n' +
                    '**No commands needed!** Just ask me in plain English:\n' +
                    '*"Create a channel called announcements"*\n' +
                    '*"Give @user the Moderator role"*\n' +
                    '*"Timeout that guy for 10 minutes"*\n\n' +
                    '**Note:** You can also make these requests in the public channel!\n\n' +
                    '**Permission System:**\n' +
                    'Your Discord role permissions determine what you can ask me to do:\n' +
                    '• Creating channels → requires **Manage Channels**\n' +
                    '• Managing roles → requires **Manage Roles**\n' +
                    '• Kicking/banning → requires **Kick/Ban Members**\n\n' +
                    '*Admins can grant channel access to trusted members via channel permissions.*'
                )
                .setFooter({ text: 'CheapShot AI - Private' });

            await privateChannel.send({ embeds: [privateEmbed] });
            logger.info('SERVER_SETUP', `Created private channel: #${CHANNEL_NAMES.private}`);
        } else {
            privateChannelId = existingPrivate.id;
        }
        channelData[CHANNEL_NAMES.private] = { id: privateChannelId, type: 'private' };

        // 3. Create moderation channel (moderators only)
        let modChannelId;
        if (!existingModeration) {
            const modChannel = await guild.channels.create({
                name: CHANNEL_NAMES.moderation,
                type: ChannelType.GuildText,
                topic: '🛡️ CheapShot moderation logs and alerts. Moderators only.',
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone - deny by default
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: bot.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ReadMessageHistory
                        ],
                    },
                ],
            });

            modChannelId = modChannel.id;

            // Send description with prominent developmental warning
            const modEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('🛡️ CheapShot Moderation')
                .setDescription(
                    'This channel receives moderation alerts and logs from CheapShot.\n\n' +
                    '**What appears here:**\n' +
                    '• AI-detected rule violations\n' +
                    '• Warning notifications\n' +
                    '• Moderation action logs\n\n' +
                    '*Grant access to your moderators via channel permissions.*'
                )
                .setFooter({ text: 'CheapShot AI - Moderation' });

            // Separate warning embed for maximum visibility
            const warningEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🚨⚠️ EXPERIMENTAL FEATURE - NOT RECOMMENDED ⚠️🚨')
                .setDescription(
                    '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**\n\n' +
                    '# ⛔ WE HIGHLY RECOMMEND NOT ENABLING AI MODERATION ⛔\n\n' +
                    '**This is a DEVELOPMENTAL feature that is actively being tested and may cause serious issues in your server.**\n\n' +
                    '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**\n\n' +
                    '### ⚠️ Known Risks:\n' +
                    '• **False Positives** - May incorrectly flag innocent messages\n' +
                    '• **Unexpected Actions** - Could timeout/warn users incorrectly\n' +
                    '• **Not Production Ready** - Still under active development\n' +
                    '• **Missed Violations** - May fail to catch actual rule-breaking\n' +
                    '• **Community Damage** - Could harm your server\'s reputation\n\n' +
                    '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**\n\n' +
                    '### If you still wish to proceed:\n' +
                    'Configure AI moderation via the CheapShot dashboard.\n' +
                    '**You are proceeding entirely at your own risk.**\n\n' +
                    '📢 *All servers will receive a notification when this feature is production ready.*\n\n' +
                    '**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**'
                )
                .setFooter({ text: '⚠️ DEVELOPMENTAL FEATURE - USE AT YOUR OWN RISK ⚠️' })
                .setTimestamp();

            await modChannel.send({ embeds: [modEmbed, warningEmbed] });
            logger.info('SERVER_SETUP', `Created moderation channel: #${CHANNEL_NAMES.moderation}`);
        } else {
            modChannelId = existingModeration.id;
        }
        channelData[CHANNEL_NAMES.moderation] = { id: modChannelId, type: 'moderation' };

        // Save all channel IDs to database and file
        await saveChannelData(guild.id, channelData);

        logger.info('SERVER_SETUP', `CheapShot channels created successfully in ${guild.name}`);

        // Return channel IDs for use in welcome message
        return {
            public: publicChannelId,
            private: privateChannelId,
            moderation: modChannelId
        };

    } catch (error) {
        logger.error('SERVER_SETUP', `Failed to create CheapShot channels: ${error.message}`);
        return null;
    }
}

/**
 * Handle bot leaving/being removed from a server
 * @param {Object} guild - Discord.js Guild object
 */
export async function handleGuildDelete(guild) {
    logger.info('SERVER_SETUP', `Left server: ${guild.name} (${guild.id})`);

    // Add any cleanup tasks here
    // For example: remove server data, clean up configs, etc.
}

/**
 * Setup the guildCreate and guildDelete handlers on the bot manager
 * @param {Object} botManager - The bot manager instance
 */
export function setupServerEvents(botManager) {
    for (const bot of botManager.bots) {
        // When bot joins a new server
        bot.client.on('guildCreate', async (guild) => {
            await handleGuildCreate(guild, bot);
        });

        // When bot leaves/is removed from a server
        bot.client.on('guildDelete', async (guild) => {
            await handleGuildDelete(guild);
        });
    }

    logger.info('SERVER_SETUP', 'Server join/leave handlers registered');
}
