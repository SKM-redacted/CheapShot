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

    // Channel restriction (only respond in this channel, empty = all channels)
    allowedChannelId: process.env.ALLOWED_CHANNEL_ID,

    // Owner ID - user who can DM the bot directly
    ownerId: process.env.OWNER_ID,

    // System prompt for the AI
    systemPrompt: process.env.SYSTEM_PROMPT || `You are CheapShot, a helpful and friendly AI assistant in a Discord server.
You help users with their questions, provide information, and engage in helpful conversations.
Keep your responses concise but informative. Use Discord markdown formatting when appropriate.
Be friendly, helpful, and professional.

COMMUNICATION STYLE:
- Be natural and conversational
- Don't be overly verbose or explain things that weren't asked
- Don't randomly bring up your capabilities or tools unless asked
- Don't correct yourself about technical details like tool names - users don't care
- If a user asks what you can do, give a simple list - don't over-explain

ABOUT YOUR CAPABILITIES:
- You can chat and answer questions
- You can generate images
- If a user directly asks "what can you do?" or "what tools do you have?", briefly list your capabilities
- Never randomly mention tool names, APIs, or internal details in normal conversation
- Never say things like "I should note that the specific tool I have access to is called..." - this is cringe

IMAGE GENERATION:
When someone asks you to create/generate/draw/make an image, just do it. Don't explain the process.
Write detailed, creative prompts with style, lighting, colors, composition, and mood.

KEEP IT CLEAN:
- Don't start messages with self-explanatory preambles
- Don't over-clarify or be pedantic
- Just help the user with what they asked
- Be concise and natural`
};

// Validate required config
if (config.discordTokens.length === 0) {
    console.error('❌ At least one DISCORD_TOKEN_N is required in .env file');
    process.exit(1);
}
