/**
 * Moderation Module
 * 
 * Main entry point - re-exports all submodules.
 */

import { logger } from '../../ai/logger.js';
import { MODERATION_CONFIG } from './constants.js';

// Constants
export {
    ACTION_TYPES,
    SEVERITY,
    MODERATION_CONFIG,
    getTimeoutDuration,
    getTimeoutDurationString
} from './constants.js';

// Rules
export { DEFAULT_RULES } from './defaultRules.js';
export {
    getGuildRules,
    findRulesChannel,
    extractRulesFromChannel,
    invalidateRulesCache,
    clearRulesCache,
    hasCustomRules
} from './rulesManager.js';

// AI Client
export {
    buildSystemPrompt,
    sendModerationRequest
} from './aiClient.js';

// Parser
export {
    parseResponse,
    hasViolation,
    hasTimeout,
    getTimeoutAction
} from './responseParser.js';

// Warnings
export {
    addWarning,
    getWarningCount,
    clearWarnings,
    getUserWarnings,
    getWarningThreshold,
    getWarningDecayHours
} from './warningTracker.js';

// Analyzer
export {
    analyzeMessage,
    handleModerationMessage
} from './analyzer.js';

// Internal imports
import { handleModerationMessage } from './analyzer.js';
import { clearRulesCache } from './rulesManager.js';

/**
 * Setup moderation on bot manager
 */
export function setupModeration(botManager) {
    for (const bot of botManager.bots) {
        bot.client.on('messageCreate', async (message) => {
            handleModerationMessage(message, bot);
        });
    }

    // Refresh rules cache periodically
    setInterval(() => {
        clearRulesCache();
        logger.debug('MODERATION', 'Rules cache cleared');
    }, MODERATION_CONFIG.RULES_CACHE_MINUTES * 60 * 1000);

    logger.info('MODERATION', 'Initialized - warning system active');
}
