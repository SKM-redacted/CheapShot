/**
 * Response Parser
 * 
 * Parses AI moderation responses - now just a severity number.
 */

import { logger } from '../../ai/logger.js';
import { MODERATION_CONFIG, ACTION_TYPES } from './constants.js';

/**
 * Parse AI moderation response (format: "severity|rule" e.g. "2|Harassment")
 * @param {string} response - Raw AI response
 * @returns {Object|null}
 */
export function parseResponse(response) {
    if (!response) {
        // No response = assume safe
        return { severity: 0, actions: [ACTION_TYPES.NONE], rule_violated: null, reason: 'No violation', delete_message_count: 0 };
    }

    let severity = 0;
    let ruleViolated = null;

    // Try to parse "severity|rule" format
    if (response.includes('|')) {
        const parts = response.split('|');
        const numMatch = parts[0].match(/[0-4]/);
        if (numMatch) {
            severity = parseInt(numMatch[0]);
            ruleViolated = parts[1]?.trim();
            // Clean up the rule name
            if (ruleViolated && ruleViolated.toLowerCase() === 'none') {
                ruleViolated = null;
            }
        }
    } else {
        // Fallback: just extract any number 0-4
        const numMatch = response.match(/[0-4]/);
        if (numMatch) {
            severity = parseInt(numMatch[0]);
        } else {
            // Can't parse = assume safe (fail-safe, no false positives)
            logger.debug('MODERATION', `Parse failed, defaulting to 0: ${response.substring(0, 50)}`);
            severity = 0;
        }
    }

    // Build actions based on severity
    const actions = getActionsForSeverity(severity);

    return {
        severity,
        actions,
        rule_violated: ruleViolated,
        reason: ruleViolated ? `${ruleViolated}` : getSeverityReason(severity),
        delete_message_count: severity >= 4 ? 10 : 0
    };
}

/**
 * Get actions based on severity level
 */
function getActionsForSeverity(severity) {
    switch (severity) {
        case 0:
        case 1:
            return [ACTION_TYPES.NONE];
        case 2:
            return [ACTION_TYPES.WARN];
        case 3:
            return [ACTION_TYPES.WARN, ACTION_TYPES.DELETE];
        case 4:
            return [ACTION_TYPES.WARN, ACTION_TYPES.DELETE, ACTION_TYPES.TIMEOUT_MEDIUM];
        default:
            return [ACTION_TYPES.NONE];
    }
}

/**
 * Get a simple reason string based on severity
 */
function getSeverityReason(severity) {
    switch (severity) {
        case 0: return 'No violation';
        case 1: return 'Minor issue';
        case 2: return 'Rule violation - warning';
        case 3: return 'Serious violation - delete';
        case 4: return 'Severe violation - timeout';
        default: return 'Unknown';
    }
}

/**
 * Check if response indicates a violation
 * @param {Object} result - Parsed result
 * @returns {boolean}
 */
export function hasViolation(result) {
    return result && result.severity >= 2;
}

/**
 * Check if response recommends a timeout
 * @param {Object} result - Parsed result
 * @returns {boolean}
 */
export function hasTimeout(result) {
    if (!result || !result.actions) return false;
    return result.actions.some(a => a.startsWith('timeout_'));
}

/**
 * Get the timeout action from result
 * @param {Object} result - Parsed result
 * @returns {string|null}
 */
export function getTimeoutAction(result) {
    if (!result || !result.actions) return null;
    return result.actions.find(a => a.startsWith('timeout_')) || null;
}
