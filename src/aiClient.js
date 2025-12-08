import { config } from './config.js';
import { TOOLS } from './imageClient.js';

/**
 * AI Client for streaming chat completions from Onyx API
 * Supports tool calling for image generation
 */
export class AIClient {
    constructor() {
        this.baseUrl = config.onyxApiBase;
        this.model = config.aiModel;
    }

    /**
     * Stream a chat completion response in real-time
     * Supports tool calling for image generation
     * @param {string} userMessage - The user's message
     * @param {Function} onChunk - Callback for each text chunk received (called immediately)
     * @param {Function} onComplete - Callback when stream finishes with text response
     * @param {Function} onError - Callback for errors
     * @param {Function} onToolCall - Callback when AI wants to use a tool
     */
    async streamChat(userMessage, onChunk, onComplete, onError, onToolCall = null) {
        const url = `${this.baseUrl}/v1/chat/completions`;

        const body = {
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: config.systemPrompt
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ],
            stream: true,
            tools: TOOLS,
            tool_choice: "auto" // Let the AI decide when to use tools
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Name': 'cheapshot' // Tracking header
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';
            let toolCalls = [];
            let currentToolCall = null;

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    // Process any remaining buffer
                    if (buffer.trim()) {
                        const result = this.parseSSELine(buffer);
                        if (result) {
                            if (result.content) {
                                fullText += result.content;
                                await onChunk(result.content, fullText);
                            }
                            if (result.toolCall) {
                                toolCalls.push(result.toolCall);
                            }
                        }
                    }
                    break;
                }

                // Decode the chunk and add to buffer
                buffer += decoder.decode(value, { stream: true });

                // Process complete lines immediately for real-time streaming
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    const result = this.parseSSELine(line);
                    if (result) {
                        if (result.content) {
                            fullText += result.content;
                            // Call onChunk IMMEDIATELY for real-time effect
                            await onChunk(result.content, fullText);
                        }
                        if (result.toolCall) {
                            toolCalls.push(result.toolCall);
                        }
                        if (result.toolCallDelta) {
                            // Handle streaming tool calls (arguments come in chunks)
                            if (!currentToolCall) {
                                currentToolCall = { name: '', arguments: '' };
                            }
                            if (result.toolCallDelta.name) {
                                currentToolCall.name = result.toolCallDelta.name;
                            }
                            if (result.toolCallDelta.arguments) {
                                currentToolCall.arguments += result.toolCallDelta.arguments;
                            }
                        }
                        if (result.finishReason === 'tool_calls' && currentToolCall) {
                            try {
                                const args = JSON.parse(currentToolCall.arguments);
                                toolCalls.push({
                                    name: currentToolCall.name,
                                    arguments: args
                                });
                            } catch (e) {
                                console.warn('Failed to parse tool call arguments:', e);
                            }
                            currentToolCall = null;
                        }
                    }
                }
            }

            // Check if we have tool calls
            if (toolCalls.length > 0 && onToolCall) {
                for (const toolCall of toolCalls) {
                    await onToolCall(toolCall);
                }
            }

            // Complete with text (might be empty if only tool calls)
            await onComplete(fullText);
            return { text: fullText, toolCalls };

        } catch (error) {
            console.error('[AI] Streaming error:', error);
            await onError(error);
            throw error;
        }
    }

    /**
     * Stream a chat completion with a pre-built context array
     * Used for multi-bot context-aware conversations
     * @param {Array} messages - Pre-built messages array with context
     * @param {Function} onChunk - Callback for each text chunk received
     * @param {Function} onComplete - Callback when stream finishes
     * @param {Function} onError - Callback for errors
     * @param {Function} onToolCall - Callback when AI wants to use a tool
     */
    async streamChatWithContext(messages, onChunk, onComplete, onError, onToolCall = null) {
        const url = `${this.baseUrl}/v1/chat/completions`;

        const body = {
            model: this.model,
            messages: messages,
            stream: true,
            tools: TOOLS,
            tool_choice: "auto"
        };

        const MAX_RETRIES = 2;
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-App-Name': 'cheapshot'
                    },
                    body: JSON.stringify(body)
                });

                // Retry on 5xx server errors
                if (response.status >= 500 && attempt < MAX_RETRIES) {
                    console.warn(`[AI] Server error ${response.status}, retrying (${attempt + 1}/${MAX_RETRIES})...`);
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                let buffer = '';
                let toolCalls = [];
                let currentToolCall = null;

                while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                        if (buffer.trim()) {
                            const result = this.parseSSELine(buffer);
                            if (result) {
                                if (result.content) {
                                    fullText += result.content;
                                    await onChunk(result.content, fullText);
                                }
                                if (result.toolCall) {
                                    toolCalls.push(result.toolCall);
                                }
                            }
                        }
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });

                    // Debug: log chunk sizes to verify streaming
                    if (buffer.length > 0) {
                        console.log(`[AI] Received chunk: ${value.length} bytes, buffer: ${buffer.length} chars`);
                    }

                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const result = this.parseSSELine(line);
                        if (result) {
                            if (result.content) {
                                fullText += result.content;
                                await onChunk(result.content, fullText);
                            }
                            if (result.toolCall) {
                                toolCalls.push(result.toolCall);
                            }
                            if (result.toolCallDelta) {
                                if (!currentToolCall) {
                                    currentToolCall = { name: '', arguments: '' };
                                }
                                if (result.toolCallDelta.name) {
                                    currentToolCall.name = result.toolCallDelta.name;
                                }
                                if (result.toolCallDelta.arguments) {
                                    currentToolCall.arguments += result.toolCallDelta.arguments;
                                }
                            }
                            if (result.finishReason === 'tool_calls' && currentToolCall) {
                                try {
                                    const args = JSON.parse(currentToolCall.arguments);
                                    toolCalls.push({
                                        name: currentToolCall.name,
                                        arguments: args
                                    });
                                } catch (e) {
                                    console.warn('Failed to parse tool call arguments:', e);
                                }
                                currentToolCall = null;
                            }
                        }
                    }
                }

                if (toolCalls.length > 0 && onToolCall) {
                    for (const toolCall of toolCalls) {
                        await onToolCall(toolCall);
                    }
                }

                await onComplete(fullText);
                return { text: fullText, toolCalls };

            } catch (error) {
                lastError = error;
                if (attempt < MAX_RETRIES) {
                    console.warn(`[AI] Request failed, retrying (${attempt + 1}/${MAX_RETRIES})...`);
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                console.error('[AI] Context streaming error:', error);
                await onError(error);
                throw error;
            }
        }

        // Should not reach here, but just in case
        if (lastError) {
            throw lastError;
        }
    }

    /**
     * Parse a single SSE line and extract content or tool calls
     * @param {string} line - SSE line to parse
     * @returns {object|null} - Extracted content, tool call, or null
     */
    parseSSELine(line) {
        if (!line.startsWith('data: ')) {
            return null;
        }

        const data = line.slice(6).trim();

        if (data === '[DONE]') {
            return null;
        }

        try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];

            if (!choice) return null;

            const result = {};

            // Get content from delta (streaming format)
            const delta = choice.delta;
            if (delta?.content) {
                result.content = delta.content;
            }

            // Check for tool calls in delta
            if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                    if (tc.function) {
                        result.toolCallDelta = {
                            name: tc.function.name,
                            arguments: tc.function.arguments
                        };
                    }
                }
            }

            // Check finish reason
            if (choice.finish_reason) {
                result.finishReason = choice.finish_reason;
            }

            // Also check message format (non-streaming)
            const message = choice.message;
            if (message?.content) {
                result.content = message.content;
            }
            if (message?.tool_calls) {
                for (const tc of message.tool_calls) {
                    if (tc.function) {
                        try {
                            result.toolCall = {
                                name: tc.function.name,
                                arguments: JSON.parse(tc.function.arguments)
                            };
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            return Object.keys(result).length > 0 ? result : null;
        } catch (e) {
            // Invalid JSON, skip
            return null;
        }
    }

    /**
     * Simple non-streaming chat for voice responses
     * Returns the complete response text (better for TTS)
     * @param {string} userMessage - User's message
     * @param {string} username - Username for context
     * @param {string} systemPromptOverride - Optional system prompt override
     * @returns {Promise<string>} AI response text
     */
    async simpleChat(userMessage, username = 'User', systemPromptOverride = null) {
        const url = `${this.baseUrl}/v1/chat/completions`;

        // Voice-optimized system prompt - VERY SHORT responses
        const voiceSystemPrompt = systemPromptOverride || `You are CheapShot, chatting by voice in Discord.

CRITICAL RULES:
- Reply in ONE sentence only. Maximum TWO if absolutely necessary.
- Talk like a friend, not an assistant.
- NEVER use lists, bullets, markdown, or numbered points.
- NEVER say "as an AI" or mention being an AI.
- Be warm but brief. Think text message, not essay.
- If asked a complex question, give the simplest useful answer.

You're talking to ${username}. Keep it casual and SHORT.`;

        const body = {
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: voiceSystemPrompt
                },
                {
                    role: 'user',
                    content: `${username}: "${userMessage}"`
                }
            ],
            stream: false,
            max_tokens: 150 // Even shorter for voice
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Name': 'cheapshot-voice'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "I didn't catch that, could you repeat?";

        } catch (error) {
            console.error('[AI] Voice chat error:', error);
            throw error;
        }
    }
}
