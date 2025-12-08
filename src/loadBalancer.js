import { botManager } from './botManager.js';
import { logger } from './logger.js';

/**
 * Load Balancer - Select optimal bot for each request
 * Considers rate limits and current load
 */
class LoadBalancer {
    constructor() {
        this.roundRobinIndex = 0;
    }

    /**
     * Pick the best available bot for a channel
     * @param {string} channelId 
     * @returns {Object|null} Bot object or null if all bots are maxed
     */
    pickBot(channelId) {
        const readyBots = botManager.getReadyBots();
        
        if (readyBots.length === 0) {
            logger.warn('LOAD_BALANCER', 'No ready bots available');
            return null;
        }

        // Find all bots with capacity
        const availableBots = readyBots.filter(bot => 
            botManager.canBotSend(bot, channelId)
        );

        if (availableBots.length === 0) {
            logger.debug('LOAD_BALANCER', `All bots at capacity for channel ${channelId}`);
            return null;
        }

        // If only one available, use it
        if (availableBots.length === 1) {
            return availableBots[0];
        }

        // Pick bot with lowest current load
        let bestBot = availableBots[0];
        
        for (const bot of availableBots) {
            if (bot.activeRequests < bestBot.activeRequests) {
                bestBot = bot;
            } else if (bot.activeRequests === bestBot.activeRequests) {
                // Tie-breaker: round-robin
                if (bot.index === this.roundRobinIndex % readyBots.length) {
                    bestBot = bot;
                }
            }
        }

        // Update round-robin index for next tie-breaker
        this.roundRobinIndex++;

        logger.debug('LOAD_BALANCER', `Selected bot ${bestBot.id} for channel ${channelId} (active: ${bestBot.activeRequests})`);
        
        return bestBot;
    }

    /**
     * Get load balancer stats
     * @returns {Object}
     */
    getStats() {
        const bots = botManager.getReadyBots();
        
        return {
            totalBots: bots.length,
            totalActiveRequests: bots.reduce((sum, bot) => sum + bot.activeRequests, 0),
            botLoads: bots.map(bot => ({
                id: bot.id,
                tag: bot.client.user?.tag,
                activeRequests: bot.activeRequests,
                globalRequests: bot.rateLimit.globalRequests
            }))
        };
    }

    /**
     * Check if any bot is available
     * @param {string} channelId 
     * @returns {boolean}
     */
    hasAvailableBot(channelId) {
        const readyBots = botManager.getReadyBots();
        return readyBots.some(bot => botManager.canBotSend(bot, channelId));
    }

    /**
     * Get the bot with the most capacity
     * @returns {Object|null}
     */
    getMostAvailableBot() {
        const readyBots = botManager.getReadyBots();
        
        if (readyBots.length === 0) {
            return null;
        }

        return readyBots.reduce((best, bot) => {
            const botScore = 45 - bot.rateLimit.globalRequests - (bot.activeRequests * 5);
            const bestScore = 45 - best.rateLimit.globalRequests - (best.activeRequests * 5);
            return botScore > bestScore ? bot : best;
        });
    }
}

// Singleton instance
export const loadBalancer = new LoadBalancer();
