import { config, getSystemPrompt } from './config.js';
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
        this._systemPrompt = null; // Cache for system prompt
    }

    /**
     * Get the system prompt (cached after first call)
     * @returns {Promise<string>}
     */
    async getPrompt() {
        if (!this._systemPrompt) {
            this._systemPrompt = await getSystemPrompt();
        }
        return this._systemPrompt;
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
        const systemPrompt = await this.getPrompt();

        const body = {
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
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
                    'Authorization': `Bearer ${config.onyxApiKey}`,
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
                        'Authorization': `Bearer ${config.onyxApiKey}`,
                        'X-App-Name': 'cheapshot'
                    },
                    body: JSON.stringify(body)
                });

                // Retry on 5xx server errors
                if (response.status >= 500 && attempt < MAX_RETRIES) {
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
- NEVER use lists, bullets, markdown, numbered points, or bold text.
- NEVER use emojis - they sound weird when spoken.
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
                    'Authorization': `Bearer ${config.onyxApiKey}`,
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
     * @param {Object} sentimentData - Optional sentiment data { sentiment, score, intensity, description }
     * @param {Array} tools - Optional array of tool definitions
     * @param {Function} onToolCall - Optional callback when AI wants to use a tool
     * @returns {Promise<{text: string, toolCalls: Array}>} Full AI response text and any tool calls
     */
    async streamVoiceChat(guildId, userMessage, username = 'User', onSentence, onComplete, systemPromptOverride = null, isCancelled = null, sentimentData = null, tools = null, onToolCall = null) {
        const url = `${this.baseUrl}/v1/chat/completions`;

        // Build sentiment-aware tone guide if sentiment data is available
        let sentimentContext = '';
        if (sentimentData && sentimentData.description) {
            sentimentContext = `\n\nTONE AWARENESS:
- The user's voice sounds: ${sentimentData.description} (score: ${sentimentData.score})
- Match their energy appropriately - if they sound excited, be more upbeat; if frustrated, be understanding; if neutral, be chill`;
        }

        // Add tool instructions if tools are provided
        let toolContext = '';
        if (tools && tools.length > 0) {
            toolContext = `\n\nTOOLS - CRITICAL:
- You have tools for managing Discord channels (create, delete, list) and voice.
- For setting up a server (multiple categories/channels): Use setup_server_structure with all your planned items
- For deletions: First list_channels, then delete_channels_bulk with ALL channels to delete
- For creating a SINGLE channel: Use create_text_channel, create_voice_channel, or create_category
- For moving users between voice channels: Use move_member with the person's name and target channel
- After tools execute, briefly confirm what was done.`;
        }

        // Voice-optimized system prompt - conversational and concise
        // Framed as "your name is" rather than "you are" to avoid Claude identity resistance
        const voiceSystemPrompt = systemPromptOverride || `Your name in this Discord server is CheapShot. You're chatting with friends in a voice channel.

HOW THIS WORKS:
- Users are SPEAKING to you with their voice (converted to text via speech-to-text)
- Your responses are SPOKEN BACK to them via text-to-speech
- This is a real-time voice conversation, not a text chat

STYLE - CRITICAL:
- Keep responses brief (1-3 sentences max) - long responses are annoying to listen to
- Talk like a chill friend, not a formal assistant
- NEVER use emojis - they get spoken as "emoji" by TTS and sound weird
- NEVER use bold (**text**), italics, or any markdown - these break the natural speech flow
- No lists, bullets, numbered points, or formatting of any kind
- Just plain conversational text that sounds natural when spoken aloud
- Be warm, casual, and concise
- If asked something complex, give the simplest useful answer

IMPORTANT:
- Don't overthink your identity or explain what you are
- Just be helpful and conversational
- If someone greets you, just say hi back naturally
- If you don't understand something, just ask casually

FRAGMENTED SPEECH:
- Messages come from speech-to-text and may be fragmented or slightly garbled
- Infer meaning from context rather than asking "what do you mean?"
- Flow naturally with the conversation${sentimentContext}${toolContext}

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
            // More tokens when tools are involved (tool calls need space)
            max_tokens: (tools && tools.length > 0) ? 500 : 200
        };

        // Add tools if provided
        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = "auto";
        }

        try {
            const apiStartTime = Date.now();
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.onyxApiKey}`,
                    'X-App-Name': 'cheapshot-voice'
                },
                body: JSON.stringify(body)
            });
            console.log(`[TIMING] Voice API first byte: ${Date.now() - apiStartTime}ms (model: ${config.voiceModel || this.model})`);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';
            let chunkBuffer = '';
            let toolCalls = [];
            let currentToolCall = null;

            // Smarter chunking settings - only split on punctuation
            const MIN_WORDS_CLAUSE = 6;     // Min words to send on comma/colon
            let firstSentenceSent = false;
            const streamStartTime = Date.now();

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
                    // Handle any final tool call
                    if (currentToolCall && currentToolCall.name) {
                        const argString = (currentToolCall.arguments || '').trim();
                        if (argString && argString.startsWith('{') && argString.endsWith('}')) {
                            try {
                                const args = JSON.parse(argString);
                                toolCalls.push({
                                    name: currentToolCall.name,
                                    arguments: args
                                });
                            } catch (e) {
                                console.warn('Failed to parse final tool call arguments:', e.message);
                            }
                        }
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
                        const choice = parsed.choices?.[0];
                        if (!choice) continue;

                        const content = choice.delta?.content;

                        // Handle tool call deltas
                        if (choice.delta?.tool_calls) {
                            for (const tc of choice.delta.tool_calls) {
                                if (tc.function) {
                                    if (!currentToolCall) {
                                        currentToolCall = { name: '', arguments: '' };
                                    }
                                    if (tc.function.name) {
                                        currentToolCall.name = tc.function.name;
                                    }
                                    if (tc.function.arguments) {
                                        currentToolCall.arguments += tc.function.arguments;
                                    }
                                }
                            }
                        }

                        // Check for finish reason
                        if (choice.finish_reason === 'tool_calls' && currentToolCall) {
                            const argString = (currentToolCall.arguments || '').trim();
                            // Only parse if we have a valid JSON-looking string
                            if (argString && argString.startsWith('{') && argString.endsWith('}')) {
                                try {
                                    const args = JSON.parse(argString);
                                    toolCalls.push({
                                        name: currentToolCall.name,
                                        arguments: args
                                    });
                                } catch (e) {
                                    console.warn('Failed to parse tool call arguments:', e.message, 'Raw:', argString.substring(0, 100));
                                }
                            } else if (argString) {
                                console.warn('Tool call arguments not valid JSON:', argString.substring(0, 100));
                            }
                            currentToolCall = null;
                        }

                        if (content) {
                            fullText += content;
                            chunkBuffer += content;

                            // Check for sentence enders (always send on . ! ?)
                            const sentenceMatch = chunkBuffer.match(/^(.*?[.!?]+)\s*(.*)$/s);
                            if (sentenceMatch) {
                                const sentence = sentenceMatch[1].trim();
                                // Skip pure emoji sentences - they don't speak well
                                const hasWords = sentence.replace(/[\p{Emoji}\s.,!?]/gu, '').length > 0;
                                if (sentence && hasWords) {
                                    if (!firstSentenceSent) {
                                        console.log(`[TIMING] First sentence ready: ${Date.now() - streamStartTime}ms`);
                                        firstSentenceSent = true;
                                    }
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

            // Execute tool calls if we have any
            if (toolCalls.length > 0 && onToolCall) {
                for (const toolCall of toolCalls) {
                    await onToolCall(toolCall);
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
            return { text: fullText, toolCalls };

        } catch (error) {
            console.error('[AI] Voice streaming error:', error);
            throw error;
        }
    }
}

