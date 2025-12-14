import { logger } from './logger.js';

/**
 * Tool Execution Loop - Handles multi-step tool execution
 * 
 * When the AI needs to perform multiple actions (like setting up a server),
 * this system:
 * 1. Executes tool calls
 * 2. Records what was done
 * 3. Re-prompts the AI with context
 * 4. Continues until complete
 */

/**
 * Maximum number of tool loop iterations to prevent infinite loops
 */
const MAX_ITERATIONS = 20;

/**
 * Execute tools in a loop, re-prompting the AI until no more tools are needed
 * 
 * @param {Object} options
 * @param {Function} options.streamChat - Function to call AI (returns {text, toolCalls})
 * @param {Function} options.executeToolCall - Function to execute a single tool call
 * @param {Array} options.initialMessages - Starting message array for the AI
 * @param {Function} options.onTextChunk - Callback for text chunks (for streaming to user)
 * @param {Function} options.onToolExecuted - Callback when a tool completes (tool, result)
 * @param {Function} options.onComplete - Callback when all done (finalText, actionsSummary)
 * @param {Function} options.onError - Callback for errors
 * @returns {Promise<{text: string, actions: Array}>}
 */
export async function executeToolLoop(options) {
    const {
        streamChat,
        executeToolCall,
        initialMessages,
        onTextChunk,
        onToolExecuted,
        onComplete,
        onError
    } = options;

    const completedActions = [];
    let messages = [...initialMessages];
    let iteration = 0;
    let finalText = '';

    try {
        while (iteration < MAX_ITERATIONS) {
            iteration++;
            logger.debug('TOOL_LOOP', `Starting iteration ${iteration}`);

            // Call the AI
            const result = await streamChat(messages, onTextChunk);

            // Collect any text response
            if (result.text) {
                finalText = result.text;
            }

            // If no tool calls, we're done
            if (!result.toolCalls || result.toolCalls.length === 0) {
                logger.debug('TOOL_LOOP', `No more tool calls after ${iteration} iterations`);
                break;
            }

            // Execute each tool call
            for (const toolCall of result.toolCalls) {
                logger.debug('TOOL_LOOP', `Executing tool: ${toolCall.name}`);

                const toolResult = await executeToolCall(toolCall);

                // Record what was done
                const actionRecord = {
                    tool: toolCall.name,
                    args: toolCall.arguments,
                    result: toolResult,
                    timestamp: Date.now()
                };
                completedActions.push(actionRecord);

                // Notify caller
                if (onToolExecuted) {
                    await onToolExecuted(toolCall, toolResult);
                }
            }

            // Build context of completed actions for the AI
            const actionsContext = buildActionsContext(completedActions);

            // Add assistant's response and tool results to messages
            messages.push({
                role: 'assistant',
                content: result.text || `I've completed ${result.toolCalls.length} action(s).`
            });

            // Add continuation prompt with context
            messages.push({
                role: 'user',
                content: `${actionsContext}

Continue with any remaining tasks. If you're done, just say so - don't call any more tools.`
            });
        }

        if (iteration >= MAX_ITERATIONS) {
            logger.warn('TOOL_LOOP', `Hit max iterations (${MAX_ITERATIONS}), stopping`);
        }

        // Generate summary of actions
        const summary = generateActionsSummary(completedActions);

        if (onComplete) {
            await onComplete(finalText, summary, completedActions);
        }

        return {
            text: finalText,
            actions: completedActions,
            summary
        };

    } catch (error) {
        logger.error('TOOL_LOOP', `Error in tool loop: ${error.message}`);
        if (onError) {
            await onError(error);
        }
        throw error;
    }
}

/**
 * Build a context string of completed actions for the AI
 * @param {Array} actions - Array of action records
 * @returns {string} Formatted context string
 */
function buildActionsContext(actions) {
    if (actions.length === 0) {
        return '';
    }

    const lines = ['Here\'s what you\'ve done so far:'];

    for (const action of actions) {
        const status = action.result?.success ? '✓' : '✗';
        let description = '';

        switch (action.tool) {
            case 'create_category':
                description = `Created category "${action.args.name}"`;
                if (action.result?.category?.id) {
                    description += ` (ID: ${action.result.category.id})`;
                }
                break;
            case 'create_text_channel':
                description = `Created text channel #${action.args.name}`;
                if (action.result?.channel?.category) {
                    description += ` in ${action.result.channel.category}`;
                }
                break;
            case 'create_voice_channel':
                description = `Created voice channel "${action.args.name}"`;
                if (action.result?.channel?.category) {
                    description += ` in ${action.result.channel.category}`;
                }
                break;
            case 'list_channels':
                // Include the full channel list with category info so AI can understand the structure
                description = 'Listed server channels:';

                // Show categories first
                if (action.result?.categories?.length > 0) {
                    description += `\n  CATEGORIES: ${action.result.categories.map(c => c.name).join(', ')}`;
                }

                // Show text channels with their parent category
                if (action.result?.text_channels?.length > 0) {
                    description += `\n  TEXT CHANNELS:`;
                    // Group by category
                    const byCategory = {};
                    for (const ch of action.result.text_channels) {
                        const cat = ch.category || 'No Category';
                        if (!byCategory[cat]) byCategory[cat] = [];
                        byCategory[cat].push(`#${ch.name}`);
                    }
                    for (const [cat, channels] of Object.entries(byCategory)) {
                        description += `\n    [${cat}]: ${channels.join(', ')}`;
                    }
                }

                // Show voice channels with their parent category
                if (action.result?.voice_channels?.length > 0) {
                    description += `\n  VOICE CHANNELS:`;
                    // Group by category
                    const byCategory = {};
                    for (const ch of action.result.voice_channels) {
                        const cat = ch.category || 'No Category';
                        if (!byCategory[cat]) byCategory[cat] = [];
                        byCategory[cat].push(ch.name);
                    }
                    for (const [cat, channels] of Object.entries(byCategory)) {
                        description += `\n    [${cat}]: ${channels.join(', ')}`;
                    }
                }
                break;
            case 'delete_channel':
                description = `Deleted ${action.result?.deleted?.type || 'channel'} "${action.result?.deleted?.name || action.args.name}"`;
                break;
            case 'delete_channels_bulk':
                description = `Bulk deleted: ${action.result?.summary || `${action.result?.deleted?.length || 0} channels`}`;
                break;
            case 'setup_server_structure':
                description = `Server structure setup: ${action.result?.summary || 'completed'}`;
                break;
            default:
                description = `${action.tool}: ${JSON.stringify(action.args)}`;
        }

        lines.push(`${status} ${description}`);
    }

    return lines.join('\n');
}

/**
 * Generate a human-readable summary of actions
 * @param {Array} actions - Array of action records
 * @returns {string} Summary text
 */
function generateActionsSummary(actions) {
    if (actions.length === 0) {
        return 'No actions were performed.';
    }

    const successful = actions.filter(a => a.result?.success);
    const failed = actions.filter(a => !a.result?.success);

    const counts = {};
    for (const action of successful) {
        counts[action.tool] = (counts[action.tool] || 0) + 1;
    }

    const parts = [];
    if (counts.create_category) {
        parts.push(`${counts.create_category} categor${counts.create_category === 1 ? 'y' : 'ies'}`);
    }
    if (counts.create_text_channel) {
        parts.push(`${counts.create_text_channel} text channel${counts.create_text_channel === 1 ? '' : 's'}`);
    }
    if (counts.create_voice_channel) {
        parts.push(`${counts.create_voice_channel} voice channel${counts.create_voice_channel === 1 ? '' : 's'}`);
    }

    let summary = `Created ${parts.join(', ')}.`;

    if (failed.length > 0) {
        summary += ` ${failed.length} action${failed.length === 1 ? '' : 's'} failed.`;
    }

    return summary;
}

/**
 * Simple wrapper for single-iteration tool execution (for voice)
 * Voice doesn't need a full loop - just execute what's returned
 * 
 * @param {Object} toolCall - The tool call to execute
 * @param {Function} executeToolCall - Function to execute the tool
 * @param {Array} sessionActions - Running list of actions in this session
 * @returns {Promise<Object>} Tool result
 */
export function addToSessionActions(toolCall, result, sessionActions) {
    sessionActions.push({
        tool: toolCall.name,
        args: toolCall.arguments,
        result,
        timestamp: Date.now()
    });
    return sessionActions;
}

export { buildActionsContext, generateActionsSummary };
