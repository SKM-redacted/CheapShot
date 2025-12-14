import { logger } from './logger.js';
import { config } from './config.js';
import { ChannelType } from 'discord.js';

/**
 * Server Cleanup Planner
 * 
 * Gets the current channel list, sends it to AI with the user's request,
 * AI decides what to delete, then executes deletions in parallel.
 */

/**
 * System prompt for the cleanup AI - asks for structured JSON output
 */
const CLEANUP_PROMPT = `You are a Discord server cleanup assistant. Given a list of current channels and a user request, output a JSON list of channels to DELETE.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "to_delete": [
    {"name": "channel-name", "type": "text|voice|category"}
  ],
  "reason": "Brief explanation of what you're deleting and why"
}

RULES:
- Only include channels that should be DELETED based on the user's request
- Be careful with the user's intent - if they say "keep general", don't delete general
- Match channel names exactly as provided in the list
- If the user says "except" or "keep", those channels should NOT be in to_delete
- Output ONLY valid JSON, no explanation text
- Be conservative - when in doubt, don't delete`;

/**
 * Get a deletion plan from the AI based on current channels and user request
 * @param {string} userRequest - What the user asked to delete
 * @param {Object} channelList - Current channels {categories, text_channels, voice_channels}
 * @returns {Promise<{to_delete: Array, reason: string}>}
 */
export async function getCleanupPlan(userRequest, channelList) {
    const url = `${config.onyxApiBase}/v1/chat/completions`;

    // Build a readable channel list for the AI
    const channelSummary = `CURRENT SERVER CHANNELS:

Categories (${channelList.categories.length}):
${channelList.categories.map(c => `- ${c.name}`).join('\n') || '(none)'}

Text Channels (${channelList.text_channels.length}):
${channelList.text_channels.map(c => `- #${c.name} (in ${c.category})`).join('\n') || '(none)'}

Voice Channels (${channelList.voice_channels.length}):
${channelList.voice_channels.map(c => `- ${c.name} (in ${c.category})`).join('\n') || '(none)'}`;

    const body = {
        model: config.aiModel,
        messages: [
            { role: 'system', content: CLEANUP_PROMPT },
            { role: 'user', content: `${channelSummary}\n\nUSER REQUEST: ${userRequest}` }
        ],
        stream: false,
        temperature: 0.3 // Lower temperature for more precise matching
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-App-Name': 'cheapshot-cleanup'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Parse the JSON plan
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No valid JSON found in response');
        }

        const plan = JSON.parse(jsonMatch[0]);

        // Validate structure
        if (!plan.to_delete) plan.to_delete = [];
        if (!plan.reason) plan.reason = 'Cleanup requested by user';

        logger.info('CLEANUP', `Plan received: ${plan.to_delete.length} items to delete - ${plan.reason}`);

        return plan;

    } catch (error) {
        logger.error('CLEANUP', `Failed to get cleanup plan: ${error.message}`);
        throw error;
    }
}

/**
 * Execute a cleanup plan - delete all specified channels in parallel
 * @param {Object} plan - The plan from getCleanupPlan
 * @param {Object} guild - Discord guild
 * @param {Function} deleteHandler - Function to delete a channel
 * @returns {Promise<{success: number, failed: number, details: Array}>}
 */
export async function executeCleanupPlan(plan, guild, deleteHandler) {
    const results = {
        success: 0,
        failed: 0,
        details: []
    };

    if (plan.to_delete.length === 0) {
        logger.info('CLEANUP', 'Nothing to delete');
        return results;
    }

    logger.info('CLEANUP', `Deleting ${plan.to_delete.length} items in parallel`);

    const deleteResults = await Promise.all(
        plan.to_delete.map(async (item) => {
            try {
                const result = await deleteHandler(guild, {
                    name: item.name,
                    type: item.type || 'any'
                });
                return { ...item, result, success: result.success };
            } catch (error) {
                return { ...item, result: { success: false, error: error.message }, success: false };
            }
        })
    );

    for (const res of deleteResults) {
        if (res.success) {
            results.success++;
            const icon = res.type === 'voice' ? '🔊' : res.type === 'category' ? '📁' : '#';
            results.details.push(`🗑️ ${icon}${res.name}`);
        } else {
            results.failed++;
            results.details.push(`❌ ${res.name} - ${res.result.error}`);
        }
    }

    logger.info('CLEANUP', `Complete: ${results.success} deleted, ${results.failed} failed`);

    return results;
}

/**
 * Check if a message looks like a bulk cleanup/delete request
 * @param {string} content - Message content
 * @returns {boolean}
 */
export function isCleanupRequest(content) {
    const lower = content.toLowerCase();
    const cleanupKeywords = [
        'delete all', 'delete every', 'remove all', 'remove every',
        'clean up', 'cleanup', 'clear all', 'clear the',
        'delete the channels', 'remove the channels',
        'delete channels except', 'delete everything except',
        'get rid of all', 'get rid of every'
    ];
    return cleanupKeywords.some(kw => lower.includes(kw));
}

/**
 * Get the current channel list from a guild
 * @param {Object} guild - Discord guild
 * @returns {Object} Channel list {categories, text_channels, voice_channels}
 */
export function getChannelList(guild) {
    const categories = [];
    const text_channels = [];
    const voice_channels = [];

    for (const [, ch] of guild.channels.cache) {
        if (ch.type === ChannelType.GuildCategory) {
            categories.push({ name: ch.name, id: ch.id });
        } else if (ch.type === ChannelType.GuildText) {
            text_channels.push({
                name: ch.name,
                category: ch.parent?.name || 'No Category',
                id: ch.id
            });
        } else if (ch.type === ChannelType.GuildVoice) {
            voice_channels.push({
                name: ch.name,
                category: ch.parent?.name || 'No Category',
                id: ch.id
            });
        }
    }

    return { categories, text_channels, voice_channels };
}
