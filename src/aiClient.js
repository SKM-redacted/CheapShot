import { config } from './config.js';
import { TOOLS } from './imageClient.js';
import { voiceMemory } from './voiceMemory.js';

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

    /**
     * Streaming voice chat - calls onSentence for each complete sentence
     * This allows TTS to start speaking immediately while AI is still generating
     * Now includes short-term memory for the last 5 minutes of conversation!
     * @param {string} guildId - Guild ID for memory context
     * @param {string} userMessage - User's message
     * @param {string} username - Username for context
     * @param {Function} onSentence - Callback for each complete sentence
     * @param {Function} onComplete - Callback when fully complete
     * @param {string} systemPromptOverride - Optional system prompt override
     * @param {Function} isCancelled - Optional callback to check if response was cancelled
     * @returns {Promise<string>} Full AI response text
     */
    async streamVoiceChat(guildId, userMessage, username = 'User', onSentence, onComplete, systemPromptOverride = null, isCancelled = null) {
        const url = `${this.baseUrl}/v1/chat/completions`;

        // Voice-optimized system prompt - conversational and concise
        // Framed as "your name is" rather than "you are" to avoid Claude identity resistance
        const voiceSystemPrompt = systemPromptOverride || `Your name in this Discord server is CheapShot. You're a voice assistant chatting with friends.

STYLE:
- Keep responses brief (1-3 sentences max)
- Talk like a chill friend, not a formal assistant
- No lists, bullets, markdown, or numbered points - this is voice chat
- Be warm, casual, and concise - think text message, not essay
- If asked something complex, give the simplest useful answer

IMPORTANT:
- Don't overthink your identity or explain what you are
- Just be helpful and conversational
- If someone greets you, just say hi back naturally
- If you don't understand something, just ask casually

FRAGMENTED SPEECH:
- Messages come from speech-to-text and may be fragmented
- Infer meaning from context rather than asking "what do you mean?"
- Flow naturally with the conversation

You're chatting with ${username}. Keep it casual!`;

        // Store user message in memory BEFORE generating response
        voiceMemory.addUserMessage(guildId, 'voice-user', username, userMessage);

        // Build messages with conversation history from memory
        const messages = voiceMemory.buildMessagesWithHistory(guildId, voiceSystemPrompt, username, userMessage);

        // Use voiceModel for faster responses (usually a smaller/faster model like gatekeeper model)
        const body = {
            model: config.voiceModel || this.model,
            messages: messages,
            stream: true,
            max_tokens: 200
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

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';
            let chunkBuffer = '';

            // Smarter chunking settings - only split on punctuation
            const MIN_WORDS_CLAUSE = 6;     // Min words to send on comma/colon

            // Patterns that indicate an INCOMPLETE chunk - don't send these alone
            const incompleteEndings = [
                /\b(what|who|where|when|why|how|which)\s*$/i,  // Question words
                /\b(the|a|an)\s*$/i,                           // Articles
                /\b(is|are|was|were|am|be|been)\s*$/i,         // Linking verbs
                /\b(to|for|with|at|by|from|in|on|of)\s*$/i,    // Prepositions
                /\b(and|but|or|so|if|that|because)\s*$/i,      // Conjunctions
                /\b(I|you|we|they|he|she|it)\s*$/i,            // Pronouns alone
                /\b(I'm|you're|we're|they're|he's|she's|it's)\s*$/i,  // Contractions
            ];

            // Check if a chunk looks complete enough to send
            const looksComplete = (text) => {
                const trimmed = text.trim();
                // Very short = not complete
                if (trimmed.split(/\s+/).length < 3) return false;
                // Check incomplete endings
                for (const pattern of incompleteEndings) {
                    if (pattern.test(trimmed)) return false;
                }
                return true;
            };

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    // Send any remaining buffer when stream ends
                    if (chunkBuffer.trim()) {
                        await onSentence(chunkBuffer.trim());
                    }
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;

                        if (content) {
                            fullText += content;
                            chunkBuffer += content;

                            // Check for sentence enders (always send on . ! ?)
                            const sentenceMatch = chunkBuffer.match(/^(.*?[.!?]+)\s*(.*)$/s);
                            if (sentenceMatch) {
                                const sentence = sentenceMatch[1].trim();
                                if (sentence) {
                                    await onSentence(sentence);
                                }
                                chunkBuffer = sentenceMatch[2];
                                continue;
                            }

                            // Check for clauses (comma, semicolon, colon) - but only if complete
                            const clauseMatch = chunkBuffer.match(/^(.*?[,;:])\s+(.*)$/s);
                            if (clauseMatch) {
                                const clause = clauseMatch[1].trim();
                                const wordCount = clause.split(/\s+/).length;
                                // Need enough words AND must look complete
                                if (wordCount >= MIN_WORDS_CLAUSE && looksComplete(clause)) {
                                    await onSentence(clause);
                                    chunkBuffer = clauseMatch[2];
                                    continue;
                                }
                            }

                            // NO early timeout - only split on punctuation to avoid mid-word breaks
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }

            // Handle memory based on whether response was cancelled
            const wasCancelled = isCancelled ? isCancelled() : false;
            if (wasCancelled) {
                // Save a note that we chose not to respond - gives AI context if user asks
                voiceMemory.addBotMessage(guildId, '[Did not respond - determined this was not directed at me or was unrelated chatter]');
            } else if (fullText.trim()) {
                voiceMemory.addBotMessage(guildId, fullText.trim());
            }

            await onComplete(fullText);
            return fullText;

        } catch (error) {
            console.error('[AI] Voice streaming error:', error);
            throw error;
        }
    }
}
