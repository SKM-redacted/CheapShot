/**
 * Moderation Module
 * 
 * Main entry point for the moderation system.
 * - Analyzes every message via AI against server rules
 * - Custom rules (from rules channel) take priority over defaults
 * - Results go into limbo (logged but not acted upon)
 */

import { logger } from '../../ai/logger.js';

// Re-export everything from submodules
export { DEFAULT_RULES } from './defaultRules.js';
export {
    getGuildRules,
    findRulesChannel,
    createRulesChannel,
    extractRulesFromChannel,
    invalidateRulesCache,
    clearRulesCache,
    hasCustomRules
} from './rulesManager.js';
export {
    analyzeMessage,
    handleModerationMessage,
    parseModerationResponse
} from './analyzer.js';

// Import for internal use
import { handleModerationMessage } from './analyzer.js';
import { clearRulesCache } from './rulesManager.js';

/**
 * Setup moderation on the bot manager
 * Call this from the main index.js start() function
 * 
 * @param {Object} botManager - BotManager instance
 */
export function setupModeration(botManager) {
    // Register a separate message handler for moderation
    // This runs in parallel with the main AI response handler
    for (const bot of botManager.bots) {
        bot.client.on('messageCreate', async (message) => {
            // Fire and forget - moderation analysis runs independently
            handleModerationMessage(message, bot);
        });
    }

    // Set up cache refresh every 30 minutes
    setInterval(() => {
        clearRulesCache();
        logger.debug('MODERATION', 'Cleared rules cache for refresh');
    }, 30 * 60 * 1000);

    logger.info('MODERATION', 'Moderation module initialized - analyzing all messages');
}
