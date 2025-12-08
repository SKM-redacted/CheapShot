import dotenv from 'dotenv';

dotenv.config();

/**
 * Parse Discord tokens from environment
 * Supports: DISCORD_TOKENS (comma-separated) or DISCORD_TOKEN_1, DISCORD_TOKEN_2, etc.
 * Falls back to single DISCORD_TOKEN for backwards compatibility
 */
function parseDiscordTokens() {
    const tokens = [];
    
    // Method 1: Comma-separated DISCORD_TOKENS
    if (process.env.DISCORD_TOKENS) {
        const parsed = process.env.DISCORD_TOKENS.split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);
        tokens.push(...parsed);
    }
    
    // Method 2: Individual DISCORD_TOKEN_1, DISCORD_TOKEN_2, etc.
    for (let i = 1; i <= 20; i++) {
        const token = process.env[`DISCORD_TOKEN_${i}`];
        if (token && token.trim()) {
            tokens.push(token.trim());
        }
    }
    
    // Method 3: Fallback to single DISCORD_TOKEN (backwards compatibility)
    if (tokens.length === 0 && process.env.DISCORD_TOKEN) {
        tokens.push(process.env.DISCORD_TOKEN.trim());
    }
    
    // Remove duplicates
    return [...new Set(tokens)];
}

export const config = {
    // Discord - Multiple tokens support
    discordTokens: parseDiscordTokens(),
    
    // Legacy single token (for backwards compatibility)
    discordToken: process.env.DISCORD_TOKEN,

    // Onyx API
    onyxApiBase: process.env.ONYX_API_BASE,

    // AI Model
    aiModel: process.env.AI_MODEL,

    // Queue settings (less relevant with multi-bot, but kept for compatibility)
    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 3,

    // Channel restriction (only respond in this channel, empty = all channels)
    allowedChannelId: process.env.ALLOWED_CHANNEL_ID,

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
if (!config.discordToken) {
    console.error('❌ DISCORD_TOKEN is required in .env file');
    process.exit(1);
}
