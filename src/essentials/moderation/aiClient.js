/**
 * Moderation AI Client
 * 
 * Handles AI API calls for moderation analysis.
 * Uses pattern matching for obvious violations, AI for ambiguous cases.
 */

import { config } from '../../ai/config.js';
import { logger } from '../../ai/logger.js';
import { MODERATION_CONFIG } from './constants.js';

/**
 * Check for obvious violations using patterns (before AI)
 * Returns severity if detected, null otherwise
 */
export function checkPatterns(content) {
    // Severity 4 - Immediate timeout (worst violations)
    const severity4Patterns = [
        // Racial slurs - multiple variations
        /n[i1!l]gg[e3a@]/i,
        /n[i1!l]g+[e3a@]r/i,
        /n[i1!l]g+a/i,
        // Other severe slurs
        /f[a@4]gg?[o0]t/i,
        /f[a@4]g\b/i,
        /\bk[i1!]ke\b/i,
        /\bch[i1!]nk\b/i,
        /\bsp[i1!]c\b/i,
        /\bsp[i1!]ck\b/i,
        /\btr[a@4]nn[yi1!e]/i,
        /\btr[o0]on\b/i,
        /\bc[o0][o0]n\b/i,
        /\bgook\b/i,
        /\bwetback/i,
        /\bbeaner/i,
        // Threats
        /\b(kill|murder|shoot|stab)\s*(you|yourself|urself|u|your\s*family)/i,
        /\bkys\b/i,
        /\bkill\s*your\s*self/i,
        /\bdie\s+in\s+a\s+fire/i,
        /\bget\s+cancer/i,
        /\bhope\s+(you|u)\s+(die|get\s+cancer)/i,
        // Scam/phishing patterns
        /free\s+(nudes?|nitro|robux|vbucks|gift\s*card)/i,
        /click\s+(this|here|the)\s*(link|url)/i,
        /(discord\.gift|discordgift|steamcommunity\.ru|discorde?\.com)/i,
        /\bfree\s+(?:discord\s+)?nitro\b/i,
        /\bsteam\s+gift/i,
    ];

    for (const pattern of severity4Patterns) {
        if (pattern.test(content)) {
            logger.debug('MODERATION', `Pattern match (severity 4): ${pattern}`);
            return 4;
        }
    }

    // Severity 3 - Delete + Warning (serious but not extreme)
    const severity3Patterns = [
        /\b(fuck|shit|bitch)\s*(you|off|u)\b/i,
        /\bstfu\b/i,
        /\bretard(ed)?\b/i,
        /\bautist(ic)?\b/i,
        /\bkill\s*(myself|yourself)/i,
        /\bgo\s+fuck\s+(yourself|urself)/i,
        /\bpiece\s+of\s+shit\b/i,
        /\bfuck\s+off\b/i,
        /\bshut\s+(the\s+)?fuck\s+up\b/i,
    ];

    for (const pattern of severity3Patterns) {
        if (pattern.test(content)) {
            logger.debug('MODERATION', `Pattern match (severity 3): ${pattern}`);
            return 3;
        }
    }

    // Severity 2 - Warning (rude but not severe)
    const severity2Patterns = [
        /\bidiot\b/i,
        /\bstupid\b/i,
        /\bdumbass\b/i,
        /\bmoron\b/i,
        /\bloser\b/i,
        /\bpathetic\b/i,
    ];

    for (const pattern of severity2Patterns) {
        if (pattern.test(content)) {
            logger.debug('MODERATION', `Pattern match (severity 2): ${pattern}`);
            return 2;
        }
    }

    return null; // Let AI decide
}

/**
 * Build the moderation system prompt
 */
export function buildSystemPrompt(rules) {
    return `Rate Discord message severity 0-4. Reply with just the number.
0=fine 1=minor 2=rude 3=harassment 4=extreme
Most normal messages are 0.`;
}

/**
 * Send a moderation request to the AI
 */
export async function sendModerationRequest(content, rules) {
    // First check patterns for obvious violations
    const patternSeverity = checkPatterns(content);
    if (patternSeverity !== null) {
        logger.info('MODERATION', `Pattern detected severity ${patternSeverity}`);
        return patternSeverity.toString();
    }

    // Let AI handle ambiguous cases
    const url = `${config.onyxApiBase}/v1/chat/completions`;

    const body = {
        model: config.gatekeeperModel || config.aiModel,
        messages: [
            { role: 'system', content: buildSystemPrompt(rules) },
            { role: 'user', content: `Rate: "${content}"` }
        ],
        stream: false,
        max_tokens: 5
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-App-Name': 'cheapshot-moderation'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`Moderation API failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
}
