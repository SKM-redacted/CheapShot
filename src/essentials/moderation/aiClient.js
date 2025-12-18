/**
 * Moderation AI Client
 * 
 * Fully AI-powered content moderation.
 * The AI decides what violates rules based on each server's specific rules.
 * If the rules don't prohibit something, it's allowed.
 */

import { config } from '../../ai/config.js';
import { logger } from '../../ai/logger.js';
import { MODERATION_CONFIG } from './constants.js';

/**
 * Build the moderation system prompt with server rules
 */
export function buildSystemPrompt(rules) {
    return `You are a content moderator. Analyze the message and respond with ONLY "N|reason" where N is 0-4.

SEVERITY LEVELS:
0 = No violation (message is fine)
1 = Minor issue (no action needed)
2 = Warning needed (mild rule violation)
3 = Delete + Warning (clear rule violation)
4 = Delete + Warning + Timeout (severe violation)

SERVER RULES:
${rules}

IMPORTANT GUIDELINES:
- ONLY flag content that ACTUALLY violates the server rules above
- If the rules don't prohibit something, it's ALLOWED (severity 0)
- Links are allowed unless rules explicitly prohibit them
- Profanity/swearing is allowed unless rules explicitly prohibit it
- Banter and trash talk between friends is usually fine
- Focus on ACTUAL harm: hate speech, threats, harassment, doxxing
- Scams/phishing should only be flagged if they're OBVIOUS scams (fake discord links, "free nitro", crypto scams)
- When in doubt, lean towards 0 (no violation)

RESPOND WITH ONLY THE FORMAT. NO OTHER TEXT.
Examples:
- "0|none" (no violation)
- "2|Spam" (warning for spam)
- "4|Hate Speech" (severe - slurs)`;
}

/**
 * Send a moderation request to the AI
 * Returns "severity|reason" string
 */
export async function sendModerationRequest(content, rules) {
    const url = `${config.onyxApiBase}/v1/chat/completions`;

    const body = {
        model: config.gatekeeperModel || config.aiModel,
        messages: [
            { role: 'system', content: buildSystemPrompt(rules) },
            { role: 'user', content: `Analyze this message: "${content}"` }
        ],
        stream: false,
        max_tokens: 30
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
        // On error, don't flag anything
        return '0|error';
    }
}

// Legacy export for compatibility (no longer used)
export function checkPatterns(content) {
    return null; // All decisions are now made by AI
}
