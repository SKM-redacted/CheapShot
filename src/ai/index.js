import { EmbedBuilder, AttachmentBuilder, REST, Routes } from 'discord.js';
import { config, getSystemPromptWithRules } from './config.js';
import { AIClient } from './aiClient.js';
import { RequestQueue } from './queue.js';
import { ImageQueue } from './imageQueue.js';
import { ImageClient, TOOLS } from './imageClient.js';
import { handleCreateVoiceChannel, handleCreateTextChannel, handleCreateCategory, handleDeleteChannel, handleDeleteChannelsBulk, handleListChannels, handleGetServerInfo, handleSetupServerStructure, handleConfigureChannelPermissions, handleEditTextChannel, handleEditVoiceChannel, handleEditCategory, handleEditChannelsBulk, handleCreateRole, handleDeleteRole, handleDeleteRolesBulk, handleEditRole, handleListRoles, handleAssignRole, handleSetupRoles, handleJoinVoice, handleLeaveVoice, handleVoiceConversation, handleMoveMember, handleMoveMembersBulk, handleListVoiceChannels, handleCheckPerms, handleListRolePermissions, handleSearchMembers, handleKickMember, handleBanMember, handleTimeoutMember, handleManageMessages, handleRenameChannel, handleMoveChannel, handleDeleteMessage, handleDeleteMessagesBulk, handleCreateSticker, handleDeleteSticker, handleListStickers, handleCreateStickersBulk, handleDeleteStickersBulk, handlePinMessage, handleUnpinMessage, handleListPinnedMessages, handlePublishMessage, handlePinMessagesBulk, handleUnpinMessagesBulk, handlePublishMessagesBulk, handleListMessages, handleCreateEmoji, handleDeleteEmoji, handleListEmojis, handleCreateEmojisBulk, handleDeleteEmojisBulk, handleCreateInvite, handleListInvites, handleCreateWebhook, handleDeleteWebhook, handleListWebhooks, handleCreateWebhooksBulk, handleDeleteWebhooksBulk, handleCreateThread, handleArchiveThread, handleListThreads, handleCreateThreadsBulk, handleArchiveThreadsBulk, handleCreateEvent, handleDeleteEvent, handleListEvents, handleCreateEventsBulk, handleDeleteEventsBulk } from './discordTools.js';
import { checkToolPermission } from './permissionChecker.js';
import { executeToolLoop, buildActionsContext } from './toolExecutionLoop.js';
// Note: Server setup is now handled through AI tool calling (setup_server_structure)
// Note: Cleanup is now handled through AI tool calling (list_channels -> delete_channels_bulk)
import { logger } from './logger.js';
import { botManager } from './botManager.js';
import { loadBalancer } from './loadBalancer.js';
import { contextStore } from './contextStore.js';
import { voiceClient } from './voiceClient.js';
import { ttsClient } from './ttsClient.js';
import { voiceCommands, handleVoiceCommand } from './voiceCommands.js';
import { voiceMemory } from './voiceMemory.js';
import { extractImagesFromMessage, hasImages } from './imageUtils.js';
import { generationTracker } from './generationTracker.js';
import { setupModeration } from '../essentials/moderation/index.js';
import { setupServerEvents } from '../essentials/serverSetup.js';
import { isChannelAllowed, getAllowedChannelIds } from '../essentials/channelConfig.js';

// Initialize clients and queues
const aiClient = new AIClient();
const imageClient = new ImageClient();
const requestQueue = new RequestQueue(config.maxConcurrentRequests);
const imageQueue = new ImageQueue(100);

/**
 * Execute a single tool call and return the result
 * This is used by both single and multi-step tool execution
 * 
 * @param {Object} toolCall - The tool call {name, arguments}
 * @param {Object} context - Context {guild, member, message (optional)}
 * @returns {Promise<{success: boolean, ...}>}
 */
async function executeSingleTool(toolCall, context) {
    const { guild, member, message } = context;

    // Check permissions first
    const permCheck = checkToolPermission(member, toolCall.name, guild);
    if (!permCheck.allowed) {
        return {
            success: false,
            error: permCheck.error,
            permissionDenied: true
        };
    }

    // Execute based on tool type
    switch (toolCall.name) {
        case 'generate_image':
        case 'image_generation':
            // Image generation is handled separately (has its own queue)
            if (message) {
                await handleImageGeneration(message, toolCall.arguments);
            }
            return { success: true, type: 'image' };

        case 'create_voice_channel':
            return await handleCreateVoiceChannel(guild, toolCall.arguments);

        case 'create_text_channel':
            return await handleCreateTextChannel(guild, toolCall.arguments);

        case 'create_category':
            return await handleCreateCategory(guild, toolCall.arguments);

        case 'delete_channel':
            return await handleDeleteChannel(guild, toolCall.arguments);

        case 'list_channels':
            return await handleListChannels(guild, toolCall.arguments);

        case 'get_server_info':
            return await handleGetServerInfo(guild, toolCall.arguments);

        case 'delete_channels_bulk':
            return await handleDeleteChannelsBulk(guild, toolCall.arguments);

        case 'setup_server_structure':
            return await handleSetupServerStructure(guild, toolCall.arguments);

        case 'configure_channel_permissions':
            return await handleConfigureChannelPermissions(guild, toolCall.arguments);

        case 'edit_text_channel':
            return await handleEditTextChannel(guild, toolCall.arguments);

        case 'edit_voice_channel':
            return await handleEditVoiceChannel(guild, toolCall.arguments);

        case 'edit_category':
            return await handleEditCategory(guild, toolCall.arguments);

        case 'edit_channels_bulk':
            return await handleEditChannelsBulk(guild, toolCall.arguments);

        case 'create_role':
            return await handleCreateRole(guild, toolCall.arguments);

        case 'delete_role':
            return await handleDeleteRole(guild, toolCall.arguments);

        case 'delete_roles_bulk':
            return await handleDeleteRolesBulk(guild, toolCall.arguments);

        case 'edit_role':
            return await handleEditRole(guild, toolCall.arguments);

        case 'list_roles':
            return await handleListRoles(guild, toolCall.arguments);

        case 'assign_role':
            return await handleAssignRole(guild, toolCall.arguments);

        case 'setup_roles':
            return await handleSetupRoles(guild, toolCall.arguments);

        case 'join_voice':
            return await handleJoinVoice(guild, toolCall.arguments, { member: context.member, message: context.message });

        case 'leave_voice':
            return await handleLeaveVoice(guild, toolCall.arguments);

        case 'voice_conversation':
            return await handleVoiceConversation(guild, toolCall.arguments);

        case 'move_member':
            return await handleMoveMember(guild, toolCall.arguments);

        case 'list_voice_channels':
            return await handleListVoiceChannels(guild, toolCall.arguments);

        case 'move_members_bulk':
            return await handleMoveMembersBulk(guild, toolCall.arguments);

        case 'check_perms':
            return await handleCheckPerms(guild, toolCall.arguments, { member: context.member });

        case 'list_role_permissions':
            return await handleListRolePermissions(guild, toolCall.arguments);

        case 'search_members':
            return await handleSearchMembers(guild, toolCall.arguments);

        case 'kick_member':
            return await handleKickMember(guild, toolCall.arguments);

        case 'ban_member':
            return await handleBanMember(guild, toolCall.arguments);

        case 'timeout_member':
            return await handleTimeoutMember(guild, toolCall.arguments);

        case 'manage_messages':
            return await handleManageMessages(guild, toolCall.arguments, { message: context.message });

        case 'delete_message':
            return await handleDeleteMessage(guild, toolCall.arguments, { message: context.message });

        case 'delete_messages_bulk':
            return await handleDeleteMessagesBulk(guild, toolCall.arguments, { message: context.message });

        case 'rename_channel':
            return await handleRenameChannel(guild, toolCall.arguments, { message: context.message });

        case 'move_channel':
            return await handleMoveChannel(guild, toolCall.arguments);

        case 'create_sticker':
            return await handleCreateSticker(guild, toolCall.arguments);

        case 'delete_sticker':
            return await handleDeleteSticker(guild, toolCall.arguments);

        case 'list_stickers':
            return await handleListStickers(guild, toolCall.arguments);

        case 'create_stickers_bulk':
            return await handleCreateStickersBulk(guild, toolCall.arguments);

        case 'delete_stickers_bulk':
            return await handleDeleteStickersBulk(guild, toolCall.arguments);

        case 'pin_message':
            return await handlePinMessage(guild, toolCall.arguments, { message: context.message });

        case 'unpin_message':
            return await handleUnpinMessage(guild, toolCall.arguments, { message: context.message });

        case 'list_pinned_messages':
            return await handleListPinnedMessages(guild, toolCall.arguments, { message: context.message });

        case 'publish_message':
            return await handlePublishMessage(guild, toolCall.arguments, { message: context.message });

        case 'pin_messages_bulk':
            return await handlePinMessagesBulk(guild, toolCall.arguments, { message: context.message });

        case 'unpin_messages_bulk':
            return await handleUnpinMessagesBulk(guild, toolCall.arguments, { message: context.message });

        case 'list_messages':
            return await handleListMessages(guild, toolCall.arguments, { message: context.message });

        // Emoji tools
        case 'create_emoji':
            return await handleCreateEmoji(guild, toolCall.arguments);

        case 'delete_emoji':
            return await handleDeleteEmoji(guild, toolCall.arguments);

        case 'list_emojis':
            return await handleListEmojis(guild, toolCall.arguments);

        case 'create_emojis_bulk':
            return await handleCreateEmojisBulk(guild, toolCall.arguments);

        case 'delete_emojis_bulk':
            return await handleDeleteEmojisBulk(guild, toolCall.arguments);

        // Invite tools
        case 'create_invite':
            return await handleCreateInvite(guild, toolCall.arguments);

        case 'list_invites':
            return await handleListInvites(guild, toolCall.arguments);

        // Webhook tools
        case 'create_webhook':
            return await handleCreateWebhook(guild, toolCall.arguments);

        case 'delete_webhook':
            return await handleDeleteWebhook(guild, toolCall.arguments);

        case 'list_webhooks':
            return await handleListWebhooks(guild, toolCall.arguments);

        case 'create_webhooks_bulk':
            return await handleCreateWebhooksBulk(guild, toolCall.arguments);

        case 'delete_webhooks_bulk':
            return await handleDeleteWebhooksBulk(guild, toolCall.arguments);

        // Thread tools
        case 'create_thread':
            return await handleCreateThread(guild, toolCall.arguments, { message: context.message });

        case 'archive_thread':
            return await handleArchiveThread(guild, toolCall.arguments);

        case 'list_threads':
            return await handleListThreads(guild, toolCall.arguments);

        case 'create_threads_bulk':
            return await handleCreateThreadsBulk(guild, toolCall.arguments, { message: context.message });

        case 'archive_threads_bulk':
            return await handleArchiveThreadsBulk(guild, toolCall.arguments);

        // Event tools
        case 'create_event':
            return await handleCreateEvent(guild, toolCall.arguments);

        case 'delete_event':
            return await handleDeleteEvent(guild, toolCall.arguments);

        case 'list_events':
            return await handleListEvents(guild, toolCall.arguments);

        case 'create_events_bulk':
            return await handleCreateEventsBulk(guild, toolCall.arguments);

        case 'delete_events_bulk':
            return await handleDeleteEventsBulk(guild, toolCall.arguments);

        default:
            logger.warn('TOOL', `Unknown tool: ${toolCall.name}`);
            return { success: false, error: `Unknown tool: ${toolCall.name}` };
    }
}

/**
 * Format a tool result for Discord message
 * Most action tools are SILENT (return null) - the AI will respond naturally
 * Only info/search tools show their results
 * @param {string} toolName - Name of the tool
 * @param {Object} result - Tool result
 * @returns {string|null} Formatted message or null for silent tools
 */
function formatToolResultMessage(toolName, result) {
    if (!result.success) {
        if (result.permissionDenied) {
            return `❌ ${result.error}`;
        }
        return `❌ Failed: ${result.error || 'An error occurred'}`;
    }

    // INFO/SEARCH TOOLS - Show formatted results
    switch (toolName) {
        case 'check_perms':
            return result.summary;

        case 'search_members':
            // Show search results to help identify the right member
            return result.summary || result.message || `Found ${result.count || 0} member(s)`;

        // All other tools are SILENT - AI responds naturally
        default:
            return null;
    }
}

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

    // Allow DMs only from the owner
    if (isDM) {
        if (!config.ownerId || message.author.id !== config.ownerId) {
            return; // Ignore DMs from non-owners
        }
        // Owner DM - proceed with response
        logger.info('DM', `Received DM from owner: ${message.author.tag}`);
    } else {
        // Check if this channel is allowed based on guild directory config
        // If no channels configured, bot won't auto-respond (mention-only mode)
        const guildId = message.guild.id;
        if (!isChannelAllowed(guildId, message.channel.id)) {
            return; // Not an allowed channel for this guild
        }
    }

    let userMessage = message.content.replace(/<@!?\d+>/g, '').trim();

    // Extract images from the message (attachments, embeds, URLs)
    let messageImages = [];
    if (hasImages(message)) {
        logger.info('IMAGE', `Extracting images from message by ${message.author.tag}`);
        messageImages = await extractImagesFromMessage(message);
        if (messageImages.length > 0) {
            logger.info('IMAGE', `Found ${messageImages.length} image(s) to process`);
        }
    }

    // Allow messages with only images (no text) for vision analysis
    if (!userMessage && messageImages.length === 0) {
        await message.reply('Hey! How can I help you? Just ask me anything! 🎯');
        return;
    }

    // If no text but has images, provide a default prompt
    if (!userMessage && messageImages.length > 0) {
        userMessage = 'What\'s in this image?';
    }

    logger.message(message.author.tag, userMessage, message.channel.id);

    // Add to context store (with images if present)
    await contextStore.addUserMessage(
        message.channel.id,
        message.author.id,
        message.author.tag,
        userMessage,
        messageImages.length > 0 ? messageImages : null
    );

    // Add pending request
    const requestId = await contextStore.addPendingRequest(
        message.channel.id,
        message.author.id,
        message.author.tag,
        userMessage
    );

    // Start tracking this generation (will cancel previous tool-calling generation if exists)
    const abortController = generationTracker.startGeneration(
        message.author.id,
        message.channel.id,
        requestId
    );

    await message.channel.sendTyping();

    try {
        // Pick the best bot for this request
        let selectedBot = loadBalancer.pickBot(message.channel.id);

        if (!selectedBot) {
            // All bots at capacity, queue the request
            await requestQueue.enqueue(async () => {
                // Check if cancelled while waiting in queue
                if (abortController.signal.aborted) {
                    logger.info('QUEUE', `Request ${requestId} was cancelled while in queue`);
                    return;
                }
                selectedBot = loadBalancer.pickBot(message.channel.id) || bot;
                await handleAIResponse(message, userMessage, selectedBot, requestId, messageImages, abortController);
            });
        } else {
            // Bot available, process immediately
            botManager.startRequest(selectedBot);
            try {
                await handleAIResponse(message, userMessage, selectedBot, requestId, messageImages, abortController);
            } finally {
                botManager.endRequest(selectedBot);
            }
        }
    } catch (error) {
        logger.error('QUEUE', 'Queue error', error);
        await message.reply('❌ Sorry, I encountered an error. Please try again later.');
    } finally {
        // Remove pending request and end generation tracking
        await contextStore.removePendingRequest(message.channel.id, requestId);
        generationTracker.endGeneration(message.author.id, requestId);
    }
}

/**
 * Handle AI response with real-time streaming
 * @param {Object} message - Discord message
 * @param {string} userMessage - User's message content
 * @param {Object} bot - Selected bot for this request
 * @param {string} requestId - Pending request ID
 * @param {Array} images - Optional array of images extracted from the message
 * @param {AbortController} abortController - Controller for cancellation
 */
async function handleAIResponse(message, userMessage, bot, requestId, images = [], abortController) {
    // NOTE: Server setup is now handled naturally through AI tool calling
    // The AI will use setup_server_structure for bulk creation, which executes in parallel
    // This allows the AI to reason about what structure to create rather than forcing keyword-based actions

    // NOTE: Cleanup/deletion requests are also handled naturally through AI tool calling
    // The AI will use list_channels to see what exists, then delete_channels_bulk to delete


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

    // Show different thinking message if processing images
    const thinkingMessage = images.length > 0
        ? `🖼️ *Analyzing ${images.length} image${images.length > 1 ? 's' : ''}...*`
        : '🤔 *Thinking...*';

    try {
        replyMessage = await message.reply(thinkingMessage);
        lastEditTime = Date.now();

        // Record the initial send
        if (bot) {
            botManager.recordBotAction(bot, message.channel.id);
        }

        logger.aiRequest(message.author.tag, userMessage + (images.length > 0 ? ` [+${images.length} images]` : ''));

        // Get system prompt with server rules (custom rules take priority)
        const systemPromptWithRules = await getSystemPromptWithRules(message.guild);

        // Get context-aware messages for AI (includes images if present)
        const contextMessages = await contextStore.getContextSnapshot(
            message.channel.id,
            systemPromptWithRules,
            {
                userId: message.author.id,
                username: message.author.tag,
                content: userMessage,
                images: images.length > 0 ? images : undefined
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

                // Strip any trailing streaming cursor characters (including regular pipe |)
                const cursorPattern = /\s*[▌▍▎▏▐▕|]+\s*$/;
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

                // Execute pending tool calls with multi-step loop
                if (pendingToolCalls.length > 0) {
                    // Check if cancelled before starting tool execution
                    if (abortController?.signal?.aborted) {
                        logger.info('TOOL_LOOP', `Generation ${requestId} was cancelled before tool execution`);
                        await message.channel.send('\u26a0\ufe0f *Previous request cancelled - processing your new message instead*');
                        return;
                    }

                    // Get member for permission checks
                    const member = message.guild?.members?.cache?.get(message.author.id)
                        || await message.guild?.members?.fetch(message.author.id).catch(() => null);

                    const toolContext = {
                        guild: message.guild,
                        member,
                        message
                    };

                    // Track all actions for context
                    const completedActions = [];
                    let currentToolCalls = [...pendingToolCalls];
                    let loopIteration = 0;
                    const MAX_LOOP_ITERATIONS = 15;

                    // Execute tool loop
                    while (currentToolCalls.length > 0 && loopIteration < MAX_LOOP_ITERATIONS) {
                        // Check for cancellation at the start of each iteration
                        if (abortController?.signal?.aborted) {
                            logger.info('TOOL_LOOP', `Generation ${requestId} was cancelled, stopping tool loop`);
                            await message.channel.send('⚠️ *Previous request cancelled - processing your new message instead*');
                            break;
                        }

                        loopIteration++;
                        logger.debug('TOOL_LOOP', `Iteration ${loopIteration}, executing ${currentToolCalls.length} tool(s) in parallel`);

                        // Log all tool calls first
                        for (const toolCall of currentToolCalls) {
                            logger.toolCall(toolCall.name, toolCall.arguments);
                        }

                        // Execute all current tool calls IN PARALLEL for speed
                        const toolPromises = currentToolCalls.map(async (toolCall) => {
                            const result = await executeSingleTool(toolCall, toolContext);
                            return { toolCall, result };
                        });

                        const results = await Promise.all(toolPromises);

                        // Process results and send messages
                        const resultMessages = [];
                        for (const { toolCall, result } of results) {
                            // Record action
                            completedActions.push({
                                tool: toolCall.name,
                                args: toolCall.arguments,
                                result,
                                timestamp: Date.now()
                            });

                            // Collect result message
                            const resultMsg = formatToolResultMessage(toolCall.name, result);
                            if (resultMsg) {
                                resultMessages.push(resultMsg);
                            }
                        }

                        // Send all results in a single message for cleaner output
                        if (resultMessages.length > 0) {
                            const combinedMessage = resultMessages.join('\n');

                            // Use splitMessage if the combined result is too long
                            if (combinedMessage.length > 1900) {
                                const chunks = splitMessage(combinedMessage, 1900);
                                for (const chunk of chunks) {
                                    try {
                                        await message.channel.send(chunk);
                                        // Small delay between chunks to ensure order
                                        await new Promise(resolve => setTimeout(resolve, 200));
                                    } catch (sendError) {
                                        logger.error('TOOL', `Failed to send result chunk: ${sendError.message}`);
                                    }
                                }
                            } else {
                                await message.channel.send(combinedMessage);
                            }
                        }

                        // ALWAYS re-prompt the AI with what happened and let IT decide whether to continue
                        // No keyword matching - the AI is smart enough to know if it needs to do more

                        // Build context of what's been done (includes channel lists, etc.)
                        const actionsContext = buildActionsContext(completedActions);

                        // Always include the original request so AI has full context
                        // Check if we just did a bulk delete - suggest verification
                        const didBulkDeleteChannels = completedActions.some(a =>
                            a.tool === 'delete_channels_bulk' && a.result?.success
                        );
                        const didBulkDeleteRoles = completedActions.some(a =>
                            a.tool === 'delete_roles_bulk' && a.result?.success
                        );

                        let verificationHint = '';
                        if (didBulkDeleteChannels) {
                            verificationHint += `\n- IMPORTANT: You just performed bulk channel deletions. Call list_channels to verify the final state before responding.`;
                        }
                        if (didBulkDeleteRoles) {
                            verificationHint += `\n- IMPORTANT: You just performed bulk role deletions. Call list_roles to verify the final state before responding.`;
                        }

                        const continuePrompt = `${actionsContext}

ORIGINAL USER REQUEST: "${message.content}"

You have completed the above action(s). Based on the results and the user's original request:
- IMPORTANT: Call ALL remaining tools at once in a SINGLE response. Don't call one tool at a time.
- For example, if you need to delete 5 roles, call delete_roles_bulk with all 5 role names in ONE response.
- If you listed roles/channels and now need to delete some, call delete_roles_bulk or delete_channels_bulk with all the names${verificationHint}
- If you're completely done fulfilling the request, just respond with a brief confirmation - don't call any more tools
- DO NOT create any channels or roles unless the user explicitly asked you to create something`;

                        // Re-prompt the AI to continue
                        const continueMessages = [
                            ...contextMessages,
                            { role: 'assistant', content: finalText },
                            { role: 'user', content: continuePrompt }
                        ];

                        // Call AI again for continuation with retry logic
                        let newToolCalls = [];
                        let continueText = '';
                        let continuationSucceeded = false;
                        const MAX_CONTINUATION_RETRIES = 2;

                        for (let retryAttempt = 0; retryAttempt <= MAX_CONTINUATION_RETRIES; retryAttempt++) {
                            try {
                                newToolCalls = [];
                                continueText = '';

                                await aiClient.streamChatWithContext(
                                    continueMessages,
                                    async (chunk) => { continueText += chunk; },
                                    async (complete) => { continueText = complete; },
                                    async (error) => { throw error; }, // Throw so we can catch and retry
                                    async (toolCall) => { newToolCalls.push(toolCall); }
                                );

                                continuationSucceeded = true;
                                break; // Success, exit retry loop

                            } catch (retryError) {
                                logger.error('TOOL_LOOP', `Continuation attempt ${retryAttempt + 1} failed: ${retryError.message}`);
                                if (retryAttempt < MAX_CONTINUATION_RETRIES) {
                                    // Exponential backoff before retry
                                    await new Promise(r => setTimeout(r, 1000 * (retryAttempt + 1)));
                                }
                            }
                        }

                        // If all retries failed, log and break (don't leave user hanging)
                        if (!continuationSucceeded) {
                            logger.error('TOOL_LOOP', `All ${MAX_CONTINUATION_RETRIES + 1} continuation attempts failed, stopping tool loop`);
                            await message.channel.send('⚠️ I ran into an API issue while processing. The actions above completed, but I couldn\'t continue.');
                            break;
                        }

                        // Check if AI is done
                        if (newToolCalls.length === 0) {
                            // AI didn't call any more tools, we're done
                            if (continueText && !continueText.toLowerCase().includes('all done')) {
                                await message.channel.send(continueText);
                            }
                            break;
                        }

                        // Continue with new tools
                        currentToolCalls = newToolCalls;
                        finalText = continueText;
                    }

                    // Send summary if multiple actions were taken (exclude list_channels from count)
                    const actionableActions = completedActions.filter(a =>
                        a.tool !== 'list_channels' && a.result?.success
                    );

                    if (actionableActions.length > 1) {
                        const created = actionableActions.filter(a =>
                            a.tool.startsWith('create_')
                        ).length;
                        const deleted = actionableActions.filter(a =>
                            a.tool === 'delete_channel' || a.tool === 'delete_channels_bulk'
                        ).length;
                        const failed = completedActions.filter(a => !a.result?.success).length;

                        let summaryParts = [];
                        if (created > 0) summaryParts.push(`created ${created}`);
                        if (deleted > 0) summaryParts.push(`deleted ${deleted}`);

                        if (summaryParts.length > 0) {
                            let summary = `\n📋 **Summary:** ${summaryParts.join(', ')} item${actionableActions.length !== 1 ? 's' : ''}`;
                            if (failed > 0) {
                                summary += `, ${failed} failed`;
                            }
                            await message.channel.send(summary);
                        }
                    }

                    // IMPORTANT: Save the AI response with tool results to context for cross-message memory
                    // This allows the AI to reference previous actions in follow-up messages
                    const actionsContextForStorage = buildActionsContext(completedActions);
                    const assistantResponse = `${finalText || ''}\n\n[Tool Actions Completed]\n${actionsContextForStorage}`.trim();
                    await contextStore.addAssistantMessage(message.channel.id, assistantResponse);
                    logger.debug('CONTEXT', `Saved assistant response with ${completedActions.length} tool action(s) to context`);
                } else {
                    // No tool calls - save regular AI response to context
                    await contextStore.addAssistantMessage(message.channel.id, finalText);
                    logger.debug('CONTEXT', `Saved assistant response to context`);
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
                // Mark this generation as having tool calls (makes it eligible for cancellation)
                generationTracker.markHasToolCalls(message.author.id);
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

        // Initialize TTS client early so it's ready when we join voice
        ttsClient.initialize();

        // Register slash commands on first bot
        await registerSlashCommands();

        // Setup message handler on all bots
        botManager.onMessage(handleMessage);

        // Setup interaction handler for slash commands
        botManager.onInteraction(handleInteraction);

        // Setup moderation module - analyzes all messages via AI (results go into limbo)
        setupModeration(botManager);

        // Setup server join/leave handlers (welcome messages, etc.)
        setupServerEvents(botManager);

        // Setup AI response callback for voice conversations - now with streaming and memory!
        // Also includes sentiment analysis for tone-aware responses!
        // Now supports tool calling (e.g., creating voice channels)!
        voiceClient.setAIResponseCallback(async (guildId, userId, username, transcript, onSentence, isCancelled, sentimentData) => {
            try {
                // Log sentiment if available
                if (sentimentData && sentimentData.description) {
                    logger.debug('VOICE', `[SENTIMENT] ${username}'s tone: ${sentimentData.description}`);
                }

                // Get guild for tool execution
                const primaryBot = botManager.bots[0];
                const guild = primaryBot?.client?.guilds?.cache?.get(guildId);

                // NOTE: Server setup and cleanup requests now go through the streaming voice chat with tools
                // The AI will use setup_server_structure, list_channels, delete_channels_bulk, etc.


                // Use streaming voice chat for faster response
                // Now includes 5-minute short-term memory!
                // Also passes isCancelled so cancelled responses don't pollute memory
                // sentimentData provides emotional context for smarter AI responses
                // Tools allow voice commands to trigger Discord actions!
                // Multi-step loop allows complex actions like setting up a full server

                let fullResponse = '';
                let voiceToolActions = []; // Track what tools we've called
                const MAX_VOICE_ITERATIONS = 10;

                // Helper to execute a voice tool and return the result
                const executeVoiceTool = async (toolCall) => {
                    logger.toolCall(toolCall.name, toolCall.arguments);

                    // ALWAYS fetch fresh member data for permission checks (don't use cache)
                    // This ensures permission changes take effect immediately
                    const member = await guild?.members?.fetch(userId).catch(() => null);

                    const permCheck = checkToolPermission(member, toolCall.name, guild);
                    if (!permCheck.allowed) {
                        if (onSentence) {
                            await onSentence(permCheck.error);
                        }
                        return { success: false, error: permCheck.error };
                    }

                    let toolResult;
                    switch (toolCall.name) {
                        case 'create_voice_channel':
                            toolResult = await handleCreateVoiceChannel(guild, toolCall.arguments);
                            break;
                        case 'create_text_channel':
                            toolResult = await handleCreateTextChannel(guild, toolCall.arguments);
                            break;
                        case 'create_category':
                            toolResult = await handleCreateCategory(guild, toolCall.arguments);
                            break;
                        case 'list_channels':
                            toolResult = await handleListChannels(guild, toolCall.arguments);
                            break;
                        case 'get_server_info':
                            toolResult = await handleGetServerInfo(guild, toolCall.arguments);
                            break;
                        case 'delete_channel':
                            toolResult = await handleDeleteChannel(guild, toolCall.arguments);
                            break;
                        case 'delete_channels_bulk':
                            toolResult = await handleDeleteChannelsBulk(guild, toolCall.arguments);
                            break;
                        case 'setup_server_structure':
                            toolResult = await handleSetupServerStructure(guild, toolCall.arguments);
                            break;
                        case 'configure_channel_permissions':
                            toolResult = await handleConfigureChannelPermissions(guild, toolCall.arguments);
                            break;
                        // Role tools
                        case 'create_role':
                            toolResult = await handleCreateRole(guild, toolCall.arguments);
                            break;
                        case 'delete_role':
                            toolResult = await handleDeleteRole(guild, toolCall.arguments);
                            break;
                        case 'delete_roles_bulk':
                            toolResult = await handleDeleteRolesBulk(guild, toolCall.arguments);
                            break;
                        case 'edit_role':
                            toolResult = await handleEditRole(guild, toolCall.arguments);
                            break;
                        case 'list_roles':
                            toolResult = await handleListRoles(guild, toolCall.arguments);
                            break;
                        case 'assign_role':
                            toolResult = await handleAssignRole(guild, toolCall.arguments);
                            break;
                        case 'setup_roles':
                            toolResult = await handleSetupRoles(guild, toolCall.arguments);
                            break;
                        // Voice tools - but handle gracefully when already in voice
                        case 'join_voice':
                            // If we're in voice, we're already there!
                            if (voiceClient.isConnected(guildId)) {
                                toolResult = { success: true, message: "Already in voice channel - listening and ready!" };
                            } else {
                                // Not in voice yet, try to join
                                toolResult = await handleJoinVoice(guild, toolCall.arguments, { member, message: null });
                            }
                            break;
                        case 'leave_voice':
                            toolResult = await handleLeaveVoice(guild, toolCall.arguments);
                            break;
                        case 'voice_conversation':
                            toolResult = await handleVoiceConversation(guild, toolCall.arguments);
                            break;
                        case 'move_member':
                            toolResult = await handleMoveMember(guild, toolCall.arguments);
                            break;
                        case 'list_voice_channels':
                            toolResult = await handleListVoiceChannels(guild, toolCall.arguments);
                            break;
                        default:
                            toolResult = { success: false, error: `Unknown tool: ${toolCall.name}` };
                    }

                    // Record action
                    voiceToolActions.push({
                        tool: toolCall.name,
                        args: toolCall.arguments,
                        result: toolResult
                    });

                    return toolResult;
                };

                // First call - initial AI response with potential tools
                let currentToolCalls = [];
                const result = await aiClient.streamVoiceChat(
                    guildId,
                    transcript,
                    username,
                    async (sentence) => {
                        if (onSentence && sentence.trim()) {
                            await onSentence(sentence);
                        }
                    },
                    async (complete) => {
                        fullResponse = complete;
                    },
                    null,
                    isCancelled,
                    sentimentData,
                    TOOLS,
                    async (toolCall) => {
                        currentToolCalls.push(toolCall);
                    }
                );

                // Multi-step tool execution loop
                let permissionDenied = false;
                for (let iteration = 0; iteration < MAX_VOICE_ITERATIONS && currentToolCalls.length > 0 && !permissionDenied; iteration++) {
                    logger.info('VOICE', `Tool iteration ${iteration + 1}: ${currentToolCalls.length} tool(s) to execute`);

                    // Execute all pending tool calls
                    for (const toolCall of currentToolCalls) {
                        const toolResult = await executeVoiceTool(toolCall);

                        // Check for permission error - if so, break out of loop
                        if (!toolResult.success && toolResult.error?.includes('permission')) {
                            logger.info('VOICE', `Permission denied, stopping tool loop`);
                            permissionDenied = true;
                            break;
                        }

                        // Speak confirmation for important actions (but not list_channels)
                        if (onSentence && toolResult.success && toolCall.name !== 'list_channels') {
                            if (toolCall.name === 'create_category') {
                                await onSentence(`Created ${toolResult.category?.name || 'category'}.`);
                            } else if (toolCall.name === 'create_text_channel') {
                                await onSentence(`Created text channel ${toolResult.channel?.name}.`);
                            } else if (toolCall.name === 'create_voice_channel') {
                                await onSentence(`Created voice channel ${toolResult.channel?.name}.`);
                            } else if (toolCall.name === 'delete_channels_bulk') {
                                await onSentence(toolResult.summary);
                            } else if (toolCall.name === 'setup_server_structure') {
                                await onSentence(toolResult.summary);
                            }
                        }
                    }

                    // If permission was denied, don't continue the loop
                    if (permissionDenied) break;

                    // Build context of what we've done
                    const actionsContext = buildActionsContext(voiceToolActions);

                    // Re-prompt AI to continue
                    currentToolCalls = [];
                    let continueResponse = '';

                    await aiClient.streamVoiceChat(
                        guildId,
                        `${actionsContext}\n\nORIGINAL REQUEST: "${transcript}"\n\nContinue if there's more to do, or confirm you're done.`,
                        username,
                        async (sentence) => {
                            if (onSentence && sentence.trim()) {
                                await onSentence(sentence);
                            }
                        },
                        async (complete) => {
                            continueResponse = complete;
                            fullResponse = complete;
                        },
                        null,
                        isCancelled,
                        null, // No sentiment for continuation
                        TOOLS,
                        async (toolCall) => {
                            currentToolCalls.push(toolCall);
                        }
                    );

                    // If no more tool calls, we're done
                    if (currentToolCalls.length === 0) {
                        break;
                    }
                }

                // Log summary if multiple tools were used
                if (voiceToolActions.length > 0) {
                    const created = voiceToolActions.filter(a => a.tool.startsWith('create_') && a.result?.success).length;
                    const deleted = voiceToolActions.filter(a => (a.tool === 'delete_channel' || a.tool === 'delete_channels_bulk') && a.result?.success).length;
                    logger.info('VOICE', `Voice tools complete: ${created} created, ${deleted} deleted`);
                }

                return result.text || fullResponse;
            } catch (error) {
                logger.error('VOICE', `Failed to generate AI response: ${error.message}`);
                if (onSentence) {
                    await onSentence("Sorry, I had trouble thinking of a response.");
                }
                return "Sorry, I had trouble thinking of a response.";
            }
        });

        // Update dashboard with bot info
        const primaryBot = botManager.bots[0];
        const botTag = primaryBot?.client?.user?.tag || `CheapShot (${botManager.getBotCount()} bots)`;
        logger.startup(botTag, config.aiModel, config.onyxApiBase, config.maxConcurrentRequests);

        logger.info('STARTUP', `CheapShot Multi-Bot System ready with ${botManager.getBotCount()} bot(s)`);
        logger.info('STARTUP', `AI Model: ${config.aiModel}`);
        logger.info('STARTUP', `API Base: ${config.onyxApiBase}`);
        logger.info('STARTUP', `Voice transcription: ${config.deepgramApiKey ? 'Enabled' : 'Disabled (no API key)'}`);

        logger.info('STARTUP', `Channel restrictions: Loaded from guild directories (data/guild/{guildId}/channels.json)`);
        logger.info('STARTUP', `Bot responds in: public + private channels | Moderation channel: excluded`);
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
    voiceMemory.shutdown();
    ttsClient.cleanupAll();
    await voiceClient.leaveAll();
    await botManager.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('SHUTDOWN', 'Received SIGTERM, shutting down...');
    voiceMemory.shutdown();
    ttsClient.cleanupAll();
    await voiceClient.leaveAll();
    await botManager.shutdown();
    process.exit(0);
});

// Start the bot system
start();
