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
    removeWarning,
    getWarning,
    getWarningCount,
    clearWarnings,
    getUserWarnings,
    getWarningThreshold,
    getWarningDecayHours
} from './warningTracker.js';

// Action Executor
export {
    executeActions
} from './actionExecutor.js';

// Analyzer
export {
    analyzeMessage,
    handleModerationMessage
} from './analyzer.js';

// Mod Log
export {
    sendModLogViolation,
    sendModLogTimeout,
    handleModActionButton
} from './modLog.js';

// Internal imports
import { handleModerationMessage } from './analyzer.js';
import { clearRulesCache } from './rulesManager.js';
import { handleModActionButton } from './modLog.js';

/**
 * Setup moderation on bot manager
 */
export function setupModeration(botManager) {
    // Check if moderation is enabled via env var (defaults to true if not set)
    const moderationEnabled = process.env.MODERATION_ENABLED?.toLowerCase() !== 'false';

    if (!moderationEnabled) {
        logger.info('MODERATION', 'Auto-moderation is DISABLED via MODERATION_ENABLED=false');
        return;
    }

    for (const bot of botManager.bots) {
        // Handle message moderation
        bot.client.on('messageCreate', async (message) => {
            handleModerationMessage(message, bot);
        });

        // Handle mod action buttons
        bot.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            if (!interaction.customId.startsWith('mod_')) return;

            await handleModActionButton(interaction);
        });
    }

    // Refresh rules cache periodically
    setInterval(() => {
        clearRulesCache();
        logger.debug('MODERATION', 'Rules cache cleared');
    }, MODERATION_CONFIG.RULES_CACHE_MINUTES * 60 * 1000);

    logger.info('MODERATION', 'Initialized - auto-moderation active');
}
