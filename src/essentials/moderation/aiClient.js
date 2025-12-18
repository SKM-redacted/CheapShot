/**
 * Moderation AI Client
 * 
 * Hybrid moderation: Pattern matching for slurs/threats (always catch),
 * AI for nuanced rule-based decisions.
 */

import { config } from '../../ai/config.js';
import { logger } from '../../ai/logger.js';
import { MODERATION_CONFIG } from './constants.js';

/**
 * Pattern check for ABSOLUTE violations that should ALWAYS be caught
 * These bypass AI entirely - slurs, death threats, and child endangerment are never okay
 */
export function checkPatterns(content) {
    const lowerContent = content.toLowerCase();

    // Racial slurs - ALWAYS severity 4, no exceptions
    const slurPatterns = [
        /\bn[i1!l][g9][g9]+[e3a@]?[r]?\b/i,
        /\bn[i1!l][g9]+[a@]\b/i,
        /\bf[a@4]gg?[o0]t/i,
        /\bk[i1!]ke\b/i,
        /\bch[i1!]nk\b/i,
        /\bsp[i1!]c\b/i,
        /\btr[a@4]nn[yi1!e]/i,
        /\bgook\b/i,
        /\bwetback\b/i,
        /\bbeaner\b/i,
        /\bcoon\b/i,
    ];

    for (const pattern of slurPatterns) {
        if (pattern.test(content)) {
            logger.info('MODERATION', `Pattern: Slur detected`);
            return '4|Hate Speech';
        }
    }

    // Death threats - ALWAYS severity 4
    const threatPatterns = [
        /\bkys\b/i,
        /\bkill\s*(your\s*self|yourself|urself)\b/i,
        /\b(i'll|ima|i\s*will)\s*kill\s*(you|u)\b/i,
        /\bhope\s*(you|u)\s*die\b/i,
    ];

    for (const pattern of threatPatterns) {
        if (pattern.test(content)) {
            logger.info('MODERATION', `Pattern: Threat detected`);
            return '4|Threats';
        }
    }

    // Child endangerment - promoting drugs/harmful activities to kids/minors
    // ALWAYS severity 4, no exceptions - this is never acceptable
    const childEndangermentPatterns = [
        // Promoting drugs to kids/children/minors
        /\b(drug|cocaine|meth|heroin|fentanyl|crack|weed|marijuana|ecstasy|mdma|lsd|shrooms|xanax|oxy|pills?).{0,30}(kid|kids|child|children|minor|minors|youth|young|teen|teens)\b/i,
        /\b(kid|kids|child|children|minor|minors|youth|young|teen|teens).{0,30}(try|use|take|do|smoke|snort|inject).{0,15}(drug|cocaine|meth|heroin|fentanyl|crack|weed|ecstasy|mdma|lsd|shrooms)/i,
        // "drugs are good for you kids" pattern
        /\b(drug|drugs).{0,20}(good|great|awesome|cool|fun).{0,20}(kid|kids|child|children|minor|minors)\b/i,
        // Direct encouragement to minors
        /\b(kid|kids|child|children).{0,15}(try|should try|need to try).{0,15}(cocaine|meth|heroin|drugs|crack|weed)\b/i,
        // Grooming patterns - inappropriate content targeting minors
        /\b(send|show)\s*(me|us)?\s*(pics?|pictures?|photos?|nudes?).{0,20}(kid|kids|child|children|minor|minors|teen|teens)\b/i,
        /\b(kid|kids|child|children|minor|minors|teen|teens).{0,20}(send|show).{0,10}(pics?|pictures?|photos?|nudes?)\b/i,
    ];

    for (const pattern of childEndangermentPatterns) {
        if (pattern.test(lowerContent)) {
            logger.info('MODERATION', `Pattern: Child endangerment detected`);
            return '4|Child Endangerment';
        }
    }

    // Let AI handle everything else
    return null;
}

/**
 * Build the moderation system prompt with server rules
 */
export function buildSystemPrompt(rules) {
    return `You are a rule enforcement bot. Check if the message violates the server rules.

=== SERVER RULES ===
${rules}
=== END RULES ===

RESPONSE: "N|reason" where N is 0-4.
0 = No violation (default)
2 = Warning needed
3 = Delete message  
4 = Timeout (reserved for pattern matching)

INSTRUCTIONS:
- Only flag what the rules ACTUALLY prohibit
- If rules allow profanity, profanity is fine (0|none)
- If rules don't mention something, it's allowed (0|none)
- Normal messages ("what", "ok", "lol") = 0|none
- Slurs/threats are handled separately, focus on other rule violations

Reply ONLY with format. Example: 0|none`;
}

/**
 * Send a moderation request to the AI
 */
export async function sendModerationRequest(content, rules) {
    // First check patterns for slurs/threats (always catch these)
    const patternResult = checkPatterns(content);
    if (patternResult !== null) {
        return patternResult;
    }

    // Let AI handle nuanced rule-based decisions
    const url = `${config.onyxApiBase}/v1/chat/completions`;

    const body = {
        model: config.gatekeeperModel || config.aiModel,
        messages: [
            { role: 'system', content: buildSystemPrompt(rules) },
            { role: 'user', content: `Message: "${content}"` }
        ],
        stream: false,
        max_tokens: 20,
        temperature: 0.1
    };

    try {
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
        const result = data.choices?.[0]?.message?.content?.trim() || '0|none';

        logger.debug('MODERATION', `AI response: ${result}`);
        return result;

    } catch (error) {
        logger.error('MODERATION', `AI request failed: ${error.message}`);
        return '0|error';
    }
}
