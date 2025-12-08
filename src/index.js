import { EmbedBuilder, AttachmentBuilder, REST, Routes } from 'discord.js';
import { config } from './config.js';
import { AIClient } from './aiClient.js';
import { RequestQueue } from './queue.js';
import { ImageQueue } from './imageQueue.js';
import { ImageClient } from './imageClient.js';
import { logger } from './logger.js';
import { botManager } from './botManager.js';
import { loadBalancer } from './loadBalancer.js';
import { contextStore } from './contextStore.js';
import { voiceClient } from './voiceClient.js';
import { voiceCommands, handleVoiceCommand } from './voiceCommands.js';

// Initialize clients and queues
const aiClient = new AIClient();
const imageClient = new ImageClient();
const requestQueue = new RequestQueue(config.maxConcurrentRequests);
const imageQueue = new ImageQueue(100);

/**
 * Split a long message into multiple chunks at natural breakpoints
 * Uses recursive character splitting with prioritized separators
 * Preserves code blocks, lists, and sentence integrity
 * 
 * @param {string} text - The text to split
 * @param {number} maxLength - Maximum length per chunk (default 1900 for safety margin)
 * @returns {string[]} Array of text chunks
 */
function splitMessage(text, maxLength = 1900) {
    if (!text || text.length <= maxLength) {
        return text ? [text] : [];
    }

    const chunks = [];
    let remainingText = text;

    // Extract and protect code blocks from being split
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = [];
    let protectedText = remainingText.replace(codeBlockRegex, (match) => {
        const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
        codeBlocks.push(match);
        return placeholder;
    });

    while (protectedText.length > 0) {
        if (protectedText.length <= maxLength) {
            chunks.push(protectedText);
            break;
        }

        let splitIndex = findBestSplitPoint(protectedText, maxLength);

        // Extract the chunk
        let chunk = protectedText.substring(0, splitIndex).trim();
        protectedText = protectedText.substring(splitIndex).trim();

        if (chunk) {
            chunks.push(chunk);
        }
    }

    // Restore code blocks in all chunks
    const restoredChunks = chunks.map(chunk => {
        let restored = chunk;
        codeBlocks.forEach((block, index) => {
            restored = restored.replace(`__CODE_BLOCK_${index}__`, block);
        });
        return restored;
    });

    // Post-process: if any chunk is still too long (due to large code blocks), split it
    const finalChunks = [];
    for (const chunk of restoredChunks) {
        if (chunk.length <= maxLength) {
            finalChunks.push(chunk);
        } else {
            // Force split long code blocks or text at word boundaries
            finalChunks.push(...forceSplitLongChunk(chunk, maxLength));
        }
    }

    return finalChunks;
}

/**
 * Find the best split point using hierarchical separators
 * Priority: paragraph breaks > markdown headers > line breaks > sentences > clauses > words
 */
function findBestSplitPoint(text, maxLength) {
    const minLength = Math.floor(maxLength * 0.4); // Don't create chunks smaller than 40% of max

    // Separators in priority order (highest to lowest)
    const separators = [
        { pattern: '\n\n', offset: 2 },           // Paragraph break
        { pattern: '\n# ', offset: 1 },           // Markdown H1
        { pattern: '\n## ', offset: 1 },          // Markdown H2
        { pattern: '\n### ', offset: 1 },         // Markdown H3
        { pattern: '\n- ', offset: 1 },           // List item
        { pattern: '\n* ', offset: 1 },           // List item (alt)
        { pattern: '\n', offset: 1 },             // Line break
        { pattern: '. ', offset: 2 },             // Sentence end (period)
        { pattern: '! ', offset: 2 },             // Sentence end (exclamation)
        { pattern: '? ', offset: 2 },             // Sentence end (question)
        { pattern: '; ', offset: 2 },             // Clause break
        { pattern: ', ', offset: 2 },             // Comma
        { pattern: ' ', offset: 1 },              // Word break
    ];

    for (const { pattern, offset } of separators) {
        const index = text.lastIndexOf(pattern, maxLength);
        if (index > minLength) {
            return index + offset;
        }
    }

    // Fallback: hard cut at maxLength (should rarely happen)
    return maxLength;
}

/**
 * Force split a chunk that's still too long (e.g., large code block or URL)
 */
function forceSplitLongChunk(chunk, maxLength) {
    const result = [];
    let remaining = chunk;

    while (remaining.length > maxLength) {
        // Try to find a newline within the chunk
        let splitAt = remaining.lastIndexOf('\n', maxLength);
        if (splitAt < maxLength * 0.3) {
            // Try space
            splitAt = remaining.lastIndexOf(' ', maxLength);
        }
        if (splitAt < maxLength * 0.3) {
            // Hard cut as last resort
            splitAt = maxLength;
        }

        result.push(remaining.substring(0, splitAt).trim());
        remaining = remaining.substring(splitAt).trim();
    }

    if (remaining) {
        result.push(remaining);
    }

    return result;
}

/**
 * Handle incoming messages (called by bot manager)
 * @param {Object} message - Discord message
 * @param {Object} bot - The bot that claimed this message
 */
async function handleMessage(message, bot) {
    if (message.author.bot) return;

    const isDM = !message.guild;

    if (!isDM && config.allowedChannelId && message.channel.id !== config.allowedChannelId) {
        return;
    }

    let userMessage = message.content.replace(/<@!?\d+>/g, '').trim();

    if (!userMessage) {
        await message.reply('Hey! How can I help you? Just ask me anything! 🎯');
        return;
    }

    logger.message(message.author.tag, userMessage, message.channel.id);

    // Add to context store
    await contextStore.addUserMessage(
        message.channel.id,
        message.author.id,
        message.author.tag,
        userMessage
    );

    // Add pending request
    const requestId = await contextStore.addPendingRequest(
        message.channel.id,
        message.author.id,
        message.author.tag,
        userMessage
    );

    await message.channel.sendTyping();

    try {
        // Pick the best bot for this request
        let selectedBot = loadBalancer.pickBot(message.channel.id);

        if (!selectedBot) {
            // All bots at capacity, queue the request
            await requestQueue.enqueue(async () => {
                selectedBot = loadBalancer.pickBot(message.channel.id) || bot;
                await handleAIResponse(message, userMessage, selectedBot, requestId);
            });
        } else {
            // Bot available, process immediately
            botManager.startRequest(selectedBot);
            try {
                await handleAIResponse(message, userMessage, selectedBot, requestId);
            } finally {
                botManager.endRequest(selectedBot);
            }
        }
    } catch (error) {
        logger.error('QUEUE', 'Queue error', error);
        await message.reply('❌ Sorry, I encountered an error. Please try again later.');
    } finally {
        // Remove pending request
        await contextStore.removePendingRequest(message.channel.id, requestId);
    }
}

/**
 * Handle AI response with real-time streaming
 * @param {Object} message - Discord message
 * @param {string} userMessage - User's message content
 * @param {Object} bot - Selected bot for this request
 * @param {string} requestId - Pending request ID
 */
async function handleAIResponse(message, userMessage, bot, requestId) {
    let replyMessage = null;
    let lastUpdateLength = 0;
    let pendingContent = '';
    let pendingToolCalls = [];

    const botCount = botManager.getBotCount();

    // Discord rate limit: 5 edits per 5 seconds per channel (burst with refill)
    // Strategy: Start with fast burst updates (100ms), then slow to 1/sec after burst depleted
    const CHAR_BATCH_SIZE = 2; // Near instant character-by-character feel
    const BURST_INTERVAL = 100; // 100ms for burst mode (feels instant)
    const SUSTAINED_INTERVAL = 1050; // ~1 sec after burst depleted
    const BURST_LIMIT = 4; // Use 4 of 5 burst slots, leave 1 for safety
    const MAX_LENGTH = 1900;

    let burstEditsUsed = 0;
    let burstStartTime = Date.now();

    let lastEditTime = 0;
    let editTimer = null;
    let forceUpdateTimer = null;
    let editCount = 0;
    const streamingCursors = ['▌', '▍', '▎', '▏', '▐', '▕']; // Animated cursor

    // Calculate current interval based on burst state
    const getCurrentInterval = () => {
        const now = Date.now();
        const timeSinceBurstStart = now - burstStartTime;

        // Reset burst bucket every 5 seconds
        if (timeSinceBurstStart >= 5000) {
            burstEditsUsed = 0;
            burstStartTime = now;
        }

        // If we have burst capacity, use fast interval
        if (burstEditsUsed < BURST_LIMIT) {
            return BURST_INTERVAL;
        }

        // Otherwise, use sustained interval
        return SUSTAINED_INTERVAL;
    };

    const fireEdit = async (text, isFinal = false) => {
        if (!replyMessage) return;

        let displayText = text;
        if (displayText.length > MAX_LENGTH) {
            displayText = displayText.substring(0, MAX_LENGTH - 50) + '\n\n*...continued below when complete*';
        }

        if (!isFinal) {
            // Fast-cycling animated cursor for visual feedback
            displayText += ' ' + streamingCursors[editCount % streamingCursors.length];
        }

        // Track for bot rate limiting
        if (bot) {
            botManager.recordBotAction(bot, message.channel.id);
        }

        editCount++;
        burstEditsUsed++;

        try {
            await replyMessage.edit(displayText);
        } catch (e) {
            // Rate limited - force sustained mode
            burstEditsUsed = BURST_LIMIT;
        }
    };

    const scheduleEdit = () => {
        if (editTimer) return;

        const now = Date.now();
        const timeSinceLastEdit = now - lastEditTime;
        const interval = getCurrentInterval();
        const delay = Math.max(0, interval - timeSinceLastEdit);

        editTimer = setTimeout(async () => {
            editTimer = null;
            lastEditTime = Date.now();
            await fireEdit(pendingContent, false);
        }, delay);
    };

    // Log bot count for parallel request capacity
    if (botCount > 1) {
        logger.debug('STREAM', `Burst streaming enabled, ${botCount} bots available for parallel requests`);
    }

    try {
        replyMessage = await message.reply('🤔 *Thinking...*');
        lastEditTime = Date.now();

        // Record the initial send
        if (bot) {
            botManager.recordBotAction(bot, message.channel.id);
        }

        logger.aiRequest(message.author.tag, userMessage);

        // Get context-aware messages for AI
        const contextMessages = await contextStore.getContextSnapshot(
            message.channel.id,
            config.systemPrompt,
            {
                userId: message.author.id,
                username: message.author.tag,
                content: userMessage
            }
        );

        await aiClient.streamChatWithContext(
            contextMessages,
            // onChunk - called for each piece of streaming content
            async (chunk, fullText) => {
                pendingContent = fullText;

                // Reset burst timer on first content (streaming just started)
                if (editCount === 0) {
                    burstStartTime = Date.now();
                    burstEditsUsed = 0;
                }

                // Clear any pending force update
                if (forceUpdateTimer) {
                    clearTimeout(forceUpdateTimer);
                    forceUpdateTimer = null;
                }

                // Update immediately on first chunk, then batch
                const newChars = fullText.length - lastUpdateLength;
                if (editCount === 0 || newChars >= CHAR_BATCH_SIZE) {
                    lastUpdateLength = fullText.length;
                    scheduleEdit();
                } else {
                    // Force update after 150ms if no threshold met
                    forceUpdateTimer = setTimeout(() => {
                        if (pendingContent.length > lastUpdateLength) {
                            lastUpdateLength = pendingContent.length;
                            scheduleEdit();
                        }
                    }, 150);
                }
            },
            // onComplete
            async (fullText) => {
                if (editTimer) {
                    clearTimeout(editTimer);
                    editTimer = null;
                }
                if (forceUpdateTimer) {
                    clearTimeout(forceUpdateTimer);
                    forceUpdateTimer = null;
                }

                let finalText = fullText || "Let me help you with that!";

                // Strip any trailing streaming cursor characters
                const cursorPattern = /\s*[▌▍▎▏▐▕]+\s*$/;
                finalText = finalText.replace(cursorPattern, '').trim();

                // Split message into chunks if it exceeds the limit
                const chunks = splitMessage(finalText, MAX_LENGTH);
                const totalChunks = chunks.length;

                // Update the first message (the reply)
                try {
                    if (totalChunks > 1) {
                        // Add a part indicator for multi-part messages
                        await replyMessage.edit(`${chunks[0]}\n\n*— (1/${totalChunks})*`);
                    } else {
                        await replyMessage.edit(chunks[0]);
                    }
                } catch (e) { }

                // Send additional messages for remaining chunks
                for (let i = 1; i < totalChunks; i++) {
                    try {
                        // Small delay to ensure messages arrive in order
                        await new Promise(resolve => setTimeout(resolve, 300));

                        const partIndicator = `*— (${i + 1}/${totalChunks})*`;
                        await message.channel.send(`${chunks[i]}\n\n${partIndicator}`);
                    } catch (e) {
                        logger.error('AI', `Failed to send message part ${i + 1}`, e);
                    }
                }

                logger.aiComplete(message.author.tag, finalText.length, pendingToolCalls.length > 0);

                // Log which bot responded
                const botTag = bot?.client?.user?.tag || `Bot ${bot?.id || 'Unknown'}`;
                logger.info('RESPONSE', `Bot "${botTag}" responded to ${message.author.tag}`);

                // Execute pending tool calls
                for (const toolCall of pendingToolCalls) {
                    if (toolCall.name === 'generate_image' || toolCall.name === 'image_generation') {
                        await handleImageGeneration(message, toolCall.arguments);
                    }
                }
            },
            // onError
            async (error) => {
                logger.error('AI', 'Streaming error', error);
                if (editTimer) clearTimeout(editTimer);

                try {
                    await replyMessage.edit('❌ Sorry, I encountered an error. Please try again.');
                } catch (e) { }
            },
            // onToolCall
            async (toolCall) => {
                logger.toolCall(toolCall.name, toolCall.arguments);
                pendingToolCalls.push(toolCall);
            }
        );
    } catch (error) {
        logger.error('AI', 'Response handler error', error);
        if (editTimer) clearTimeout(editTimer);

        if (replyMessage) {
            try {
                await replyMessage.edit('❌ Sorry, something went wrong. Please try again.');
            } catch (e) { }
        } else {
            await message.reply('❌ Sorry, something went wrong. Please try again.');
        }
    }
}

/**
 * Handle image generation
 */
async function handleImageGeneration(originalMessage, args) {
    const { prompt } = args;

    let size = args.size || "1024x1024";
    if (args.shape) {
        const shapeMap = {
            'square': '1024x1024',
            'landscape': '1792x1024',
            'portrait': '1024x1792'
        };
        size = shapeMap[args.shape] || '1024x1024';
    }

    logger.imageStart(prompt, size);

    let genMessage;
    try {
        genMessage = await originalMessage.channel.send(`🎨 *Generating image...*\n\n**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`);
    } catch (e) {
        logger.error('IMAGE', 'Failed to send generating message', e);
        return;
    }

    try {
        const result = await imageQueue.enqueue(async () => {
            return await imageClient.generateImage(prompt, size);
        });

        // Download the image from the API
        const imageResponse = await fetch(result.url);
        if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.status}`);
        }

        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

        // Create attachment from buffer
        const attachment = new AttachmentBuilder(imageBuffer, {
            name: 'generated-image.png',
            description: prompt.substring(0, 100)
        });

        // Create embed (image will be from attachment, not URL)
        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('🎨 Generated Image')
            .setDescription(`**Prompt:** ${prompt.substring(0, 300)}${prompt.length > 300 ? '...' : ''}`)
            .setImage('attachment://generated-image.png')
            .setFooter({ text: 'Generated by CheapShot AI' })
            .setTimestamp();

        try {
            await genMessage.edit({ content: null, embeds: [embed], files: [attachment] });
        } catch (e) {
            await originalMessage.channel.send({ embeds: [embed], files: [attachment] });
        }

        logger.imageComplete(originalMessage.author.tag, result.url, prompt);

    } catch (error) {
        logger.error('IMAGE', 'Image generation failed', error);

        try {
            await genMessage.edit(`❌ Sorry, I couldn't generate the image.`);
        } catch (e) {
            await originalMessage.channel.send(`❌ Sorry, I couldn't generate the image.`);
        }
    }
}

/**
 * Start the multi-bot system
 */
async function start() {
    console.log('🔄 Starting CheapShot Multi-Bot System...');
    console.log(`📊 Configured tokens: ${config.discordTokens.length}`);

    try {
        // Initialize all bots
        await botManager.initialize();

        // Register slash commands on first bot
        await registerSlashCommands();

        // Setup message handler on all bots
        botManager.onMessage(handleMessage);

        // Setup interaction handler for slash commands
        botManager.onInteraction(handleInteraction);

        // Update dashboard with bot info
        const primaryBot = botManager.bots[0];
        const botTag = primaryBot?.client?.user?.tag || `CheapShot (${botManager.getBotCount()} bots)`;
        logger.startup(botTag, config.aiModel, config.onyxApiBase, config.maxConcurrentRequests);

        logger.info('STARTUP', `CheapShot Multi-Bot System ready with ${botManager.getBotCount()} bot(s)`);
        logger.info('STARTUP', `AI Model: ${config.aiModel}`);
        logger.info('STARTUP', `API Base: ${config.onyxApiBase}`);
        logger.info('STARTUP', `Voice transcription: ${config.deepgramApiKey ? 'Enabled' : 'Disabled (no API key)'}`);

        if (config.allowedChannelId) {
            logger.info('STARTUP', `Restricted to channel: ${config.allowedChannelId}`);
        }
    } catch (error) {
        logger.error('STARTUP', 'Failed to start bot system', error);
        process.exit(1);
    }
}

/**
 * Register slash commands with Discord
 */
async function registerSlashCommands() {
    const primaryBot = botManager.bots[0];
    if (!primaryBot) return;

    try {
        const rest = new REST({ version: '10' }).setToken(config.discordTokens[0]);

        logger.info('STARTUP', 'Registering slash commands...');

        // Register commands globally
        await rest.put(
            Routes.applicationCommands(primaryBot.client.user.id),
            { body: voiceCommands }
        );

        logger.info('STARTUP', `Registered ${voiceCommands.length} slash commands`);
    } catch (error) {
        logger.error('STARTUP', 'Failed to register slash commands', error);
    }
}

/**
 * Handle slash command interactions
 * @param {Object} interaction - Discord interaction
 * @param {Object} bot - The bot that received the interaction
 */
async function handleInteraction(interaction, bot) {
    if (!interaction.isChatInputCommand()) return;

    try {
        // Try voice commands first
        const handled = await handleVoiceCommand(interaction);
        if (handled) return;

        // Add more command handlers here in the future
    } catch (error) {
        logger.error('INTERACTION', 'Error handling interaction', error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply('❌ An error occurred processing your command.');
            } else {
                await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
            }
        } catch (e) { }
    }
}

/**
 * Handle errors
 */
process.on('unhandledRejection', (error) => {
    logger.error('SYSTEM', 'Unhandled rejection', error);
});

process.on('SIGINT', async () => {
    logger.info('SHUTDOWN', 'Received SIGINT, shutting down...');
    await voiceClient.leaveAll();
    await botManager.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('SHUTDOWN', 'Received SIGTERM, shutting down...');
    await voiceClient.leaveAll();
    await botManager.shutdown();
    process.exit(0);
});

// Start the bot system
start();
