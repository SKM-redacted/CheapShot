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

export const config = {
    // Discord - Multiple tokens support
    discordTokens: parseDiscordTokens(),

    // OpenAI-compatible API
    onyxApiBase: process.env.API_BASE,

    // AI Model
    aiModel: process.env.AI_MODEL,
    gatekeeperModel: process.env.GATEKEEPER_MODEL,
    // Voice uses gatekeeper model for faster responses (usually a smaller/faster model)
    voiceModel: process.env.VOICE_MODEL || process.env.GATEKEEPER_MODEL || process.env.AI_MODEL,

    // Deepgram API for voice transcription
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,

    // Queue settings (less relevant with multi-bot, but kept for compatibility)
    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 3,

    // Channel restriction (only respond in these channels, empty = all channels)
    // Supports comma-separated list: "123,456,789"
    allowedChannelIds: (process.env.ALLOWED_CHANNEL_ID || '').split(',').map(id => id.trim()).filter(id => id),

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

SERVER SETUP (IMPORTANT):
- When asked to set up or create server structure, ALWAYS call get_server_info FIRST to see what exists
- get_server_info shows you ALL categories, channels, and roles in one call
- Only create items that don't already exist - never duplicate existing channels/categories/roles
- This ensures you're ADDING to the server, not recreating it from scratch
- If user asks for a "gaming" category and one already exists, skip creating it

IMAGE GENERATION:
When someone asks you to create/generate/draw/make an image, just do it. Don't explain the process.
Write detailed, creative prompts with style, lighting, colors, composition, and mood.

KEEP IT CLEAN:
- Don't start messages with self-explanatory preambles
- Don't over-clarify or be pedantic
- Just help the user with what they asked
- Be concise and natural`
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

/**
 * Get the full system prompt with auto-generated tools list
 * Call this at runtime to get the prompt with current tools
 * @returns {Promise<string>} The complete system prompt
 */
export async function getSystemPrompt() {
    const toolsSummary = await loadToolsSummary();
    return `${config.baseSystemPrompt}

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

