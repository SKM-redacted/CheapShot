import dotenv from 'dotenv';

dotenv.config();

/**
 * Parse Discord tokens from environment
 * Uses DISCORD_TOKEN_1, DISCORD_TOKEN_2, etc.
 */
function parseDiscordTokens() {
    const tokens = [];

    for (let i = 1; i <= 20; i++) {
        const token = process.env[`DISCORD_TOKEN_${i}`];
        if (token && token.trim()) {
            tokens.push(token.trim());
        }
    }

    return tokens;
}

/**
 * Parse Deepgram API keys from environment
 * Uses DEEPGRAM_API_KEY_1, DEEPGRAM_API_KEY_2, etc.
 * Falls back to single DEEPGRAM_API_KEY for backwards compatibility
 */
function parseDeepgramApiKeys() {
    const keys = [];

    // First, check for numbered keys (up to 100 accounts as user mentioned ~50)
    for (let i = 1; i <= 100; i++) {
        const key = process.env[`DEEPGRAM_API_KEY_${i}`];
        if (key && key.trim()) {
            keys.push(key.trim());
        }
    }

    // If no numbered keys found, fall back to single key for backwards compatibility
    if (keys.length === 0 && process.env.DEEPGRAM_API_KEY) {
        keys.push(process.env.DEEPGRAM_API_KEY.trim());
    }

    return keys;
}

export const config = {
    // Discord - Multiple tokens support
    discordTokens: parseDiscordTokens(),

    // OpenAI-compatible API
    onyxApiBase: process.env.API_BASE,
    onyxApiKey: process.env.API_KEY,

    // AI Model
    aiModel: process.env.AI_MODEL,
    gatekeeperModel: process.env.GATEKEEPER_MODEL,
    // Voice uses gatekeeper model for faster responses (usually a smaller/faster model)
    voiceModel: process.env.VOICE_MODEL || process.env.GATEKEEPER_MODEL || process.env.AI_MODEL,

    // Deepgram API keys for voice transcription/TTS (multiple key support)
    deepgramApiKeys: parseDeepgramApiKeys(),
    // Legacy single key support (uses first key from pool)
    deepgramApiKey: parseDeepgramApiKeys()[0] || null,

    // Queue settings (less relevant with multi-bot, but kept for compatibility)
    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 3,

    // DEPRECATED: Channel restrictions are now loaded from guild directories
    // See: data/guild/{guildId}/channels.json
    // This is kept for backwards compatibility but no longer used
    allowedChannelIds: [],  // Now managed per-guild via directory structure

    // Owner ID - user who can DM the bot directly
    ownerId: process.env.OWNER_ID,

    // System prompt for the AI - use getSystemPrompt() for the full prompt with tools
    baseSystemPrompt: process.env.SYSTEM_PROMPT || `You are CheapShot, a helpful and friendly AI assistant in a Discord server.
You help users with their questions, provide information, and engage in helpful conversations.
Keep your responses concise but informative. Use Discord markdown formatting when appropriate.
Be friendly, helpful, and professional.

COMMUNICATION STYLE:
- Be natural and conversational
- Don't be overly verbose or explain things that weren't asked
- Don't randomly bring up your capabilities or tools unless asked
- Don't correct yourself about technical details like tool names - users don't care
- If a user asks what you can do, give a simple list - don't over-explain

TOOL USAGE GUIDELINES:
- For bulk operations (multiple channels/roles), use the bulk tools like setup_server_structure, setup_roles, delete_channels_bulk, delete_roles_bulk
- For single items, use the individual tools
- Before deleting, use list_channels or list_roles to see what exists
- Plan ahead: think about everything needed, then use the appropriate tool

VOICE CAPABILITIES (IMPORTANT - YOU CAN DO THIS):
- You CAN join voice channels using the join_voice tool! When someone asks you to "join vc", "hop in voice", "come talk", etc., USE the join_voice tool
- Once in a voice channel, you can LISTEN to users speaking and RESPOND with your own voice
- Use join_voice with no arguments to join the channel the requesting user is in
- Use join_voice with a channel_name to join a specific voice channel
- Use leave_voice to disconnect from the voice channel
- Use voice_conversation to enable/disable voice conversation mode (listening and responding)
- You have FULL voice capabilities - text-to-speech and speech-to-text

VOICE CHANNEL MANAGEMENT:
- You CAN move users between voice channels using the move_member tool
- If someone asks to move a user to a channel, use list_voice_channels first to see all channels and who is in them
- Then use move_member with the member's name and the target channel name
- The target channel can be any voice channel in the server (e.g., "Timeout Corner", "AFK", "Gaming", etc.)
- You can also use move_members_bulk to move multiple people at once

SERVER SETUP (IMPORTANT):
- When asked to set up or create server structure, ALWAYS call get_server_info FIRST to see what exists
- get_server_info shows you ALL categories, channels, and roles in one call
- Only create items that don't already exist - never duplicate existing channels/categories/roles
- This ensures you're ADDING to the server, not recreating it from scratch
- If user asks for a "gaming" category and one already exists, skip creating it

IMAGE GENERATION:
When someone asks you to create/generate/draw/make an image, just do it. Don't explain the process.
Write detailed, creative prompts with style, lighting, colors, composition, and mood.

VISION/IMAGE ANALYSIS:
- Users can send images (attachments, embedded images, or image URLs) along with their messages
- When you receive an image, analyze it and respond to the user's question about it
- You can describe what's in images, read text from screenshots, analyze diagrams, etc.
- If a user sends just an image with no text, describe what you see
- Be helpful and detailed when analyzing images

STICKER & MESSAGE MANAGEMENT:
- You CAN create custom stickers from images/URLs using create_sticker (supports PNG, APNG, Lottie)
- You can delete stickers using delete_sticker or delete_stickers_bulk
- You can manage messages: pin/unpin messages using pin_message/unpin_message
- You can delete specific messages or bulk delete messages using delete_message/delete_messages_bulk
- Use manage_messages to clean up spam or purge recent messages from a channel
- IMPORTANT: When a user REPLIES to a message and asks to delete/pin/unpin/publish it, just call the tool WITHOUT a message_id - the replied-to message will be used automatically!
- Only use list_messages to find message IDs if the user is NOT replying to the target message

CRITICAL - MESSAGE IDs:
- NEVER make up or hallucinate message IDs - they must come from tool results!
- When you use list_messages, it returns REAL message IDs in the "id" field
- You MUST use the EXACT IDs from the list_messages result, not generate your own
- Discord message IDs are snowflakes - making them up will ALWAYS fail with "Unknown Message"

KEEP IT CLEAN:
- Don't start messages with self-explanatory preambles
- Don't over-clarify or be pedantic
- Just help the user with what they asked
- Be concise and natural

VERIFY WHEN ASKED:
- If a user asks you to "check", "verify", "make sure", or "confirm" something, USE THE APPROPRIATE TOOL to actually check
- Don't rely on memory or context alone - call the tool to get fresh data
- For example: "check pinned messages" → call list_pinned_messages, "verify roles" → call list_roles
- This gives the user real confirmation, not just your recollection`
};

// Import tool summary function (lazy import to avoid circular dependency)
let _getToolsSummary = null;
async function loadToolsSummary() {
    if (!_getToolsSummary) {
        const { getToolsSummary } = await import('./toolDefinitions.js');
        _getToolsSummary = getToolsSummary;
    }
    return _getToolsSummary();
}

// Import slash commands summary (lazy import)
let _getSlashCommandsSummary = null;
async function loadSlashCommandsSummary() {
    if (!_getSlashCommandsSummary) {
        const { getSlashCommandsSummary } = await import('../slash-commands/commandLoader.js');
        _getSlashCommandsSummary = getSlashCommandsSummary;
    }
    return _getSlashCommandsSummary();
}

/**
 * Get the full system prompt with auto-generated tools list
 * Call this at runtime to get the prompt with current tools
 * @returns {Promise<string>} The complete system prompt
 */
export async function getSystemPrompt() {
    const toolsSummary = await loadToolsSummary();
    const slashCommandsSummary = await loadSlashCommandsSummary();
    return `${config.baseSystemPrompt}
${slashCommandsSummary}
${toolsSummary}

When a user asks what you can do, you can reference the tools above. Don't list them all - just summarize your main capabilities (chat, images, channels, roles, voice).`;
}

// Lazy import for rules manager to avoid circular dependency
let _getGuildRules = null;
async function loadRulesManager() {
    if (!_getGuildRules) {
        const { getGuildRules } = await import('../essentials/moderation/rulesManager.js');
        _getGuildRules = getGuildRules;
    }
    return _getGuildRules;
}

/**
 * Get the full system prompt with tools AND server rules
 * Custom rules (from server's rules channel) take priority over defaults
 * 
 * @param {Object} guild - Discord guild (optional, uses default rules if not provided)
 * @returns {Promise<string>} The complete system prompt with rules
 */
export async function getSystemPromptWithRules(guild = null) {
    const toolsSummary = await loadToolsSummary();
    const slashCommandsSummary = await loadSlashCommandsSummary();

    let rulesSection = '';

    if (guild) {
        try {
            const getRules = await loadRulesManager();
            const { rules, isCustom } = await getRules(guild);

            rulesSection = `
SERVER RULES (${isCustom ? 'Custom Rules' : 'Default Rules'}):
${rules}

MODERATION GUIDELINES:
- Be aware of the above rules when responding
- If users discuss rule-breaking behavior, you may gently remind them of the rules
- Don't be preachy about rules unless someone is clearly violating them
`;
        } catch (error) {
            // Silently continue without rules if there's an error
        }
    }

    return `${config.baseSystemPrompt}
${rulesSection}
${slashCommandsSummary}
${toolsSummary}

When a user asks what you can do, you can reference the tools above. Don't list them all - just summarize your main capabilities (chat, images, channels, roles, voice).`;
}

// For backwards compatibility, also export a static version (without dynamic tools)
// This will be replaced by getSystemPrompt() calls where possible
config.systemPrompt = config.baseSystemPrompt;

// Validate required config
if (config.discordTokens.length === 0) {
    console.error('❌ At least one DISCORD_TOKEN_N is required in .env file');
    process.exit(1);
}

