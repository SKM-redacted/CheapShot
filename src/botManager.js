import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Bot Manager - Initialize and manage multiple Discord clients
 * Tracks per-bot rate limits and active requests
 */
class BotManager {
    constructor() {
        this.bots = [];
        this.claimedMessages = new Set(); // Prevent duplicate responses
        this.initialized = false;
    }

    /**
     * Initialize all bot clients from tokens
     * @returns {Promise<void>}
     */
    async initialize() {
        const tokens = config.discordTokens;

        if (tokens.length === 0) {
            throw new Error('No Discord tokens configured');
        }

        logger.info('BOT_MANAGER', `Initializing ${tokens.length} bot(s)...`);

        const initPromises = tokens.map((token, index) => this.initializeBot(token, index));

        await Promise.all(initPromises);

        this.initialized = true;
        logger.info('BOT_MANAGER', `Successfully initialized ${this.bots.length} bot(s)`);
    }

    /**
     * Initialize a single bot client
     * @param {string} token 
     * @param {number} index 
     * @returns {Promise<Object>}
     */
    async initializeBot(token, index) {
        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildVoiceStates  // Required for voice channels
            ],
            partials: [Partials.Channel]
        });

        const bot = {
            id: `bot-${index}`,
            index,
            client,
            rateLimit: {
                globalRequests: 0,
                channelEdits: {} // channelId -> [timestamps]
            },
            activeRequests: 0,
            ready: false
        };

        // Setup rate limit reset (every 1 second)
        setInterval(() => {
            bot.rateLimit.globalRequests = 0;
        }, 1000);

        // Cleanup old channel edit timestamps (every 5 seconds)
        setInterval(() => {
            const fiveSecondsAgo = Date.now() - 5000;
            for (const channelId in bot.rateLimit.channelEdits) {
                bot.rateLimit.channelEdits[channelId] =
                    bot.rateLimit.channelEdits[channelId].filter(t => t > fiveSecondsAgo);

                // Remove empty arrays
                if (bot.rateLimit.channelEdits[channelId].length === 0) {
                    delete bot.rateLimit.channelEdits[channelId];
                }
            }
        }, 5000);

        // Error handling
        client.on('error', (error) => {
            logger.error('BOT_MANAGER', `Bot ${index} error`, error);
        });

        // Login and wait for ready
        await client.login(token);

        // Wait for clientReady event
        await new Promise((resolve) => {
            client.once('clientReady', () => {
                bot.ready = true;
                logger.info('BOT_MANAGER', `Bot ${index} ready: ${client.user.tag}`);

                client.user.setPresence({
                    activities: [{ name: `AI + Image Gen | CheapShot (${index + 1}/${config.discordTokens.length})`, type: 3 }],
                    status: 'online'
                });
                resolve();
            });
        });

        this.bots.push(bot);
        return bot;
    }

    /**
     * Try to claim a message (prevent duplicate responses)
     * @param {string} messageId 
     * @returns {boolean} True if claimed successfully
     */
    claimMessage(messageId) {
        if (this.claimedMessages.has(messageId)) {
            return false;
        }

        this.claimedMessages.add(messageId);

        // Cleanup old claims after 1 minute
        setTimeout(() => {
            this.claimedMessages.delete(messageId);
        }, 60000);

        return true;
    }

    /**
     * Check if a bot can send/edit in a channel
     * @param {Object} bot 
     * @param {string} channelId 
     * @returns {boolean}
     */
    canBotSend(bot, channelId) {
        // Check global limit (leave some headroom)
        if (bot.rateLimit.globalRequests >= 45) {
            return false;
        }

        // Check channel-specific limit
        const recentEdits = this.getRecentEdits(bot, channelId);
        if (recentEdits.length >= 4) { // Leave headroom for 5/5sec limit
            return false;
        }

        return true;
    }

    /**
     * Get recent edits for a bot in a channel (last 5 seconds)
     * @param {Object} bot 
     * @param {string} channelId 
     * @returns {number[]} Array of timestamps
     */
    getRecentEdits(bot, channelId) {
        const edits = bot.rateLimit.channelEdits[channelId] || [];
        const fiveSecondsAgo = Date.now() - 5000;
        return edits.filter(t => t > fiveSecondsAgo);
    }

    /**
     * Record a bot action (send/edit)
     * @param {Object} bot 
     * @param {string} channelId 
     */
    recordBotAction(bot, channelId) {
        bot.rateLimit.globalRequests++;

        if (!bot.rateLimit.channelEdits[channelId]) {
            bot.rateLimit.channelEdits[channelId] = [];
        }

        bot.rateLimit.channelEdits[channelId].push(Date.now());
    }

    /**
     * Increment active requests for a bot
     * @param {Object} bot 
     */
    startRequest(bot) {
        bot.activeRequests++;
    }

    /**
     * Decrement active requests for a bot
     * @param {Object} bot 
     */
    endRequest(bot) {
        bot.activeRequests = Math.max(0, bot.activeRequests - 1);
    }

    /**
     * Get all ready bots
     * @returns {Object[]}
     */
    getReadyBots() {
        return this.bots.filter(bot => bot.ready);
    }

    /**
     * Get bot count
     * @returns {number}
     */
    getBotCount() {
        return this.bots.length;
    }

    /**
     * Get status of all bots
     * @returns {Object[]}
     */
    getStatus() {
        return this.bots.map(bot => ({
            id: bot.id,
            ready: bot.ready,
            tag: bot.client.user?.tag || 'Unknown',
            activeRequests: bot.activeRequests,
            globalRequests: bot.rateLimit.globalRequests
        }));
    }

    /**
     * Setup message handler on all bots
     * @param {Function} handler - Async function(message, bot)
     */
    onMessage(handler) {
        for (const bot of this.bots) {
            bot.client.on('messageCreate', async (message) => {
                // Only one bot should handle each message
                if (!this.claimMessage(message.id)) {
                    return;
                }

                await handler(message, bot);
            });
        }
    }

    /**
     * Setup interaction handler on all bots
     * @param {Function} handler - Async function(interaction, bot)
     */
    onInteraction(handler) {
        for (const bot of this.bots) {
            bot.client.on('interactionCreate', async (interaction) => {
                await handler(interaction, bot);
            });
        }
    }

    /**
     * Gracefully shutdown all bots
     */
    async shutdown() {
        logger.info('BOT_MANAGER', 'Shutting down all bots...');

        for (const bot of this.bots) {
            try {
                bot.client.destroy();
            } catch (e) {
                logger.error('BOT_MANAGER', `Error shutting down bot ${bot.id}`, e);
            }
        }

        this.bots = [];
        this.initialized = false;
    }
}

// Singleton instance
export const botManager = new BotManager();
