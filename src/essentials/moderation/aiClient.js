/**
 * Moderation AI Client
 * 
 * Handles AI API calls for moderation analysis.
 * Uses simplified response format to avoid refusals.
 */

import { config } from '../../ai/config.js';
import { MODERATION_CONFIG } from './constants.js';

/**
 * Build the moderation system prompt
 * @param {string} rules - Server rules
 * @returns {string}
 */
export function buildSystemPrompt(rules) {
    return `You are a content moderation classifier. Rate message severity 0-4:

0 = Normal/fine message
1 = Mildly rude or off-topic  
2 = Insults, minor harassment
3 = Serious harassment, hate, slurs
4 = Extreme: racial slurs, death threats, doxxing, CSAM

CRITICAL: Racial slurs (n-word, etc) = ALWAYS 4
Homophobic/transphobic slurs = ALWAYS 3-4
Direct threats = ALWAYS 4

Server rules summary: Be respectful, no hate speech, no harassment.

Reply with ONLY the number 0-4. Nothing else.`;
}

/**
 * Send a moderation request to the AI
 * @param {string} content - Message to analyze
 * @param {string} rules - Server rules
 * @returns {Promise<string|null>}
 */
export async function sendModerationRequest(content, rules) {
    const url = `${config.onyxApiBase}/v1/chat/completions`;

    const body = {
        model: config.gatekeeperModel || config.aiModel,
        messages: [
            { role: 'system', content: buildSystemPrompt(rules) },
            { role: 'user', content: `Rate this message: "${content}"` }
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
