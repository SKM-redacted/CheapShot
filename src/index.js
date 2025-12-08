import { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { config } from './config.js';
import { AIClient } from './aiClient.js';
import { RequestQueue } from './queue.js';
import { ImageQueue } from './imageQueue.js';
import { ImageClient } from './imageClient.js';
import { logger } from './logger.js';

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// Initialize clients and queues
const aiClient = new AIClient();
const imageClient = new ImageClient();
const requestQueue = new RequestQueue(config.maxConcurrentRequests);
const imageQueue = new ImageQueue(100);

/**
 * Handle incoming messages
 */
client.on('messageCreate', async (message) => {
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

    await message.channel.sendTyping();

    try {
        await requestQueue.enqueue(async () => {
            logger.requestQueue(requestQueue.activeCount, requestQueue.maxConcurrent);
            await handleAIResponse(message, userMessage);
        });
    } catch (error) {
        logger.error('QUEUE', 'Queue error', error);
        await message.reply('❌ Sorry, I encountered an error. Please try again later.');
    }
});

/**
 * Handle AI response with real-time streaming
 */
async function handleAIResponse(message, userMessage) {
    let replyMessage = null;
    let lastUpdateLength = 0;
    let pendingContent = '';
    let pendingToolCalls = [];

    const CHAR_BATCH_SIZE = 20; // Update every 20 characters (faster, more real-time)
    const MIN_UPDATE_INTERVAL = 400; // 400ms between edits (2.5 updates/sec max)
    const MAX_LENGTH = 1900;

    let lastEditTime = 0;
    let editTimer = null;
    let forceUpdateTimer = null;

    const fireEdit = (text, isFinal = false) => {
        if (!replyMessage) return;

        let displayText = text;
        if (displayText.length > MAX_LENGTH) {
            displayText = displayText.substring(0, MAX_LENGTH) + '... *(truncated)*';
        }

        if (!isFinal) {
            displayText += ' ▌';
        }

        replyMessage.edit(displayText).catch(() => { });
    };

    const scheduleEdit = () => {
        if (editTimer) return;

        const now = Date.now();
        const timeSinceLastEdit = now - lastEditTime;
        const delay = Math.max(0, MIN_UPDATE_INTERVAL - timeSinceLastEdit);

        editTimer = setTimeout(() => {
            editTimer = null;
            lastEditTime = Date.now();
            fireEdit(pendingContent, false);
        }, delay);
    };

    try {
        replyMessage = await message.reply('🤔 *Thinking...*');
        lastEditTime = Date.now();

        logger.aiRequest(message.author.tag, userMessage);

        await aiClient.streamChat(
            userMessage,
            // onChunk
            (chunk, fullText) => {
                pendingContent = fullText;

                // Clear any pending force update
                if (forceUpdateTimer) {
                    clearTimeout(forceUpdateTimer);
                    forceUpdateTimer = null;
                }

                // Update if character threshold reached
                const newChars = fullText.length - lastUpdateLength;
                if (newChars >= CHAR_BATCH_SIZE) {
                    lastUpdateLength = fullText.length;
                    scheduleEdit();
                } else {
                    // Force update after 600ms if no threshold met (for short messages)
                    forceUpdateTimer = setTimeout(() => {
                        if (pendingContent.length > lastUpdateLength) {
                            lastUpdateLength = pendingContent.length;
                            scheduleEdit();
                        }
                    }, 600);
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

                if (finalText.length > MAX_LENGTH) {
                    finalText = finalText.substring(0, MAX_LENGTH) + '\n\n... *(truncated)*';
                }

                try {
                    await replyMessage.edit(finalText);
                } catch (e) { }

                logger.aiComplete(message.author.tag, finalText.length, pendingToolCalls.length > 0);

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
 * Bot ready event
 */
client.on('clientReady', () => {
    logger.startup(
        client.user.tag,
        config.aiModel,
        config.onyxApiBase,
        config.maxConcurrentRequests
    );

    client.user.setPresence({
        activities: [{ name: 'AI + Image Gen | CheapShot', type: 3 }],
        status: 'online'
    });
});

/**
 * Handle errors
 */
client.on('error', (error) => {
    logger.error('DISCORD', 'Client error', error);
});

process.on('unhandledRejection', (error) => {
    logger.error('SYSTEM', 'Unhandled rejection', error);
});

// Login
console.log('🔄 Starting CheapShot Discord Bot...');
client.login(config.discordToken);
