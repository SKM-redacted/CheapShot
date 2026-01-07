import { logger } from './logger.js';
import { config } from './config.js';

/**
 * Server Setup Planner
 * 
 * Gets a structured plan from the AI, then executes it in parallel batches.
 * Much faster than one-by-one tool calls!
 */

/**
 * System prompt for the planning AI - asks for structured JSON output
 */
const PLANNER_PROMPT = `You are a Discord server structure planner. Given a request, output a JSON plan for setting up the server.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "categories": [
    {"name": "Category Name", "emoji": "📁"}
  ],
  "text_channels": [
    {"name": "channel-name", "category": "Category Name", "topic": "Optional description"}
  ],
  "voice_channels": [
    {"name": "Channel Name", "category": "Category Name"}
  ]
}

RULES:
- Category names should include an emoji prefix
- Text channel names should be lowercase with hyphens
- Voice channel names can have spaces and capitals
- Place channels in appropriate categories
- Create a complete, professional structure
- Output ONLY valid JSON, no explanation text`;

/**
 * Get a server setup plan from the AI
 * @param {string} userRequest - What the user asked for
 * @returns {Promise<{categories: Array, text_channels: Array, voice_channels: Array}>}
 */
export async function getServerPlan(userRequest) {
    const url = `${config.onyxApiBase}/v1/chat/completions`;

    const body = {
        model: config.aiModel,
        messages: [
            { role: 'system', content: PLANNER_PROMPT },
            { role: 'user', content: `Create a Discord server structure for: ${userRequest}` }
        ],
        stream: false,
        temperature: 0.7
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.onyxApiKey}`,
                'X-App-Name': 'cheapshot-planner'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Parse the JSON plan
        // Try to extract JSON from the response (in case there's extra text)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No valid JSON found in response');
        }

        const plan = JSON.parse(jsonMatch[0]);

        // Validate structure
        if (!plan.categories) plan.categories = [];
        if (!plan.text_channels) plan.text_channels = [];
        if (!plan.voice_channels) plan.voice_channels = [];

        logger.info('PLANNER', `Plan received: ${plan.categories.length} categories, ${plan.text_channels.length} text, ${plan.voice_channels.length} voice`);

        return plan;

    } catch (error) {
        logger.error('PLANNER', `Failed to get plan: ${error.message}`);
        throw error;
    }
}

/**
 * Execute a server setup plan in parallel batches
 * @param {Object} plan - The plan from getServerPlan
 * @param {Object} guild - Discord guild
 * @param {Object} handlers - Tool handlers {createCategory, createTextChannel, createVoiceChannel}
 * @param {Function} onProgress - Progress callback (phase, completed, total)
 * @returns {Promise<{success: number, failed: number, details: Array}>}
 */
export async function executePlan(plan, guild, handlers, onProgress) {
    const results = {
        success: 0,
        failed: 0,
        details: []
    };

    const { createCategory, createTextChannel, createVoiceChannel } = handlers;

    // Phase 1: Create all categories in parallel (must be first so channels can reference them)
    if (plan.categories.length > 0) {
        logger.info('PLANNER', `Phase 1: Creating ${plan.categories.length} categories in parallel`);
        onProgress?.('categories', 0, plan.categories.length);

        const categoryResults = await Promise.all(
            plan.categories.map(async (cat) => {
                try {
                    const result = await createCategory(guild, { name: cat.name });
                    return { ...cat, result, success: result.success };
                } catch (error) {
                    return { ...cat, result: { success: false, error: error.message }, success: false };
                }
            })
        );

        for (const res of categoryResults) {
            if (res.success) {
                results.success++;
                results.details.push(`✅ Category: ${res.name}`);
            } else {
                results.failed++;
                results.details.push(`❌ Category: ${res.name} - ${res.result.error}`);
            }
        }

        onProgress?.('categories', plan.categories.length, plan.categories.length);
    }

    // Small delay to let Discord API settle and ensure categories are available
    await new Promise(r => setTimeout(r, 500));

    // Phase 2: Create ALL channels (text + voice) in parallel
    const allChannels = [
        ...plan.text_channels.map(ch => ({ ...ch, type: 'text' })),
        ...plan.voice_channels.map(ch => ({ ...ch, type: 'voice' }))
    ];

    if (allChannels.length > 0) {
        logger.info('PLANNER', `Phase 2: Creating ${allChannels.length} channels in parallel (${plan.text_channels.length} text, ${plan.voice_channels.length} voice)`);
        onProgress?.('channels', 0, allChannels.length);

        const channelResults = await Promise.all(
            allChannels.map(async (ch) => {
                try {
                    let result;
                    if (ch.type === 'text') {
                        result = await createTextChannel(guild, {
                            name: ch.name,
                            category: ch.category,
                            topic: ch.topic
                        });
                    } else {
                        result = await createVoiceChannel(guild, {
                            name: ch.name,
                            category: ch.category
                        });
                    }
                    return { ...ch, result, success: result.success };
                } catch (error) {
                    return { ...ch, result: { success: false, error: error.message }, success: false };
                }
            })
        );

        for (const res of channelResults) {
            if (res.success) {
                results.success++;
                if (res.type === 'text') {
                    results.details.push(`✅ #${res.name}`);
                } else {
                    results.details.push(`✅ 🔊 ${res.name}`);
                }
            } else {
                results.failed++;
                if (res.type === 'text') {
                    results.details.push(`❌ #${res.name} - ${res.result.error}`);
                } else {
                    results.details.push(`❌ 🔊 ${res.name} - ${res.result.error}`);
                }
            }
        }

        onProgress?.('channels', allChannels.length, allChannels.length);
    }

    logger.info('PLANNER', `Complete: ${results.success} success, ${results.failed} failed`);

    return results;
}

/**
 * Check if a message looks like a server setup request
 * @param {string} content - Message content
 * @returns {boolean}
 */
export function isServerSetupRequest(content) {
    const lower = content.toLowerCase();
    const setupKeywords = [
        'set up', 'setup', 'create server', 'make server',
        'build server', 'organize server', 'restructure',
        'server structure', 'channel structure', 'set up my discord',
        'set up the server', 'create channels for'
    ];
    return setupKeywords.some(kw => lower.includes(kw));
}
