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
 * Returns "severity|rule" string if detected, null otherwise
 */
export function checkPatterns(content) {
    // Severity 4 - Immediate timeout (worst violations)

    // Check for racial slurs - multiple variations
    const slurPatterns = [
        /n[i1!l]gg[e3a@]/i,
        /n[i1!l]g+[e3a@]r/i,
        /n[i1!l]g+a/i,
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
    ];

    for (const pattern of slurPatterns) {
        if (pattern.test(content)) {
            logger.debug('MODERATION', `Pattern match (Hate Speech): ${pattern}`);
            return '4|Hate Speech';
        }
    }

    // Check for threats
    const threatPatterns = [
        /\b(kill|murder|shoot|stab)\s*(you|yourself|urself|u|your\s*family)/i,
        /\bkys\b/i,
        /\bkill\s*your\s*self/i,
        /\bdie\s+in\s+a\s+fire/i,
        /\bget\s+cancer/i,
        /\bhope\s+(you|u)\s+(die|get\s+cancer)/i,
    ];

    for (const pattern of threatPatterns) {
        if (pattern.test(content)) {
            logger.debug('MODERATION', `Pattern match (Threats): ${pattern}`);
            return '4|Threats';
        }
    }

    // Check for scam/phishing patterns
    const scamPatterns = [
        /free\s+(nudes?|nitro|robux|vbucks|gift\s*card)/i,
        /click\s+(this|here|the)\s*(link|url)/i,
        /(discord\.gift|discordgift|steamcommunity\.ru|discorde?\.com)/i,
        /\bfree\s+(?:discord\s+)?nitro\b/i,
        /\bsteam\s+gift/i,
    ];

    for (const pattern of scamPatterns) {
        if (pattern.test(content)) {
            logger.debug('MODERATION', `Pattern match (Scam/Phishing): ${pattern}`);
            return '4|Scam/Phishing';
        }
    }

    // Severity 3 - Delete + Warning (actually harmful content)
    const harmfulPatterns = [
        // Ableist slurs (these are never okay)
        /\bretard(ed)?\b/i,
        /\bautist(ic)?\b/i,
        // Self-harm encouragement (the real line)
        /\bkill\s*(yourself|urself)\b/i,
        /\b(go\s+)?die\b.*\b(hole|fire|alone)/i,
        /\bcrying\s*(yourself|urself)?\s*to\s*death/i,
        /\bdig\s*(yourself|urself)?\s*(a|into)\s*(a\s+)?.*\bhole\b/i,
        /\bnobody\s+(loves|likes|cares)/i,
        /\bkill\s+yourself/i,
        /\bharm\s+(yourself|urself)/i,
    ];

    for (const pattern of harmfulPatterns) {
        if (pattern.test(content)) {
            logger.debug('MODERATION', `Pattern match (Harmful): ${pattern}`);
            return '3|Harmful Content';
        }
    }

    // NOTE: Profanity (even targeted like "fuck you") goes to AI
    // AI checks if server rules allow profanity or not

    return null; // Let AI decide for everything else
}

/**
 * Build the moderation system prompt with server rules
 */
export function buildSystemPrompt(rules) {
    return `You are a content filter. Output ONLY "N|rule" where N is 0-4.

0=fine 1=minor 2=warn 3=delete 4=timeout

Server rules: ${rules}

Logic:
- "idiot","stupid","dumb" → 0|none
- Profanity: if rules allow → 0|none, else → 2|Profanity
- Slurs/hate → 4|Hate Speech
- Threats → 4|Threats

RESPOND WITH ONLY THE FORMAT. NO OTHER TEXT. Example: 0|none`;
}

/**
 * Send a moderation request to the AI
 */
export async function sendModerationRequest(content, rules) {
    // First check patterns for obvious violations
    const patternSeverity = checkPatterns(content);
    if (patternSeverity !== null) {
        logger.info('MODERATION', `Pattern detected: ${patternSeverity}`);
        return patternSeverity;
    }

    // Let AI handle ambiguous cases
    const url = `${config.onyxApiBase}/v1/chat/completions`;

    const body = {
        model: config.gatekeeperModel || config.aiModel,
        messages: [
            { role: 'system', content: buildSystemPrompt(rules) },
            { role: 'user', content: `"${content}"` }
        ],
        stream: false,
        max_tokens: 20
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
