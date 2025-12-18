/**
 * Dashboard API Configuration
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, '../../.env') });

export const config = {
    // OAuth2
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    redirectUri: process.env.DASHBOARD_REDIRECT_URI || 'https://cheapshot.skmredacted.com/callback',

    // Server
    port: parseInt(process.env.DASHBOARD_PORT) || 4847,

    // Session
    sessionSecret: process.env.DASHBOARD_SESSION_SECRET || 'change-me-in-production',

    // Redis
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

    // Discord API
    discordApiBase: 'https://discord.com/api/v10',

    // Bot tokens (to check which guilds the bot is in)
    botTokens: parseBotTokens()
};

function parseBotTokens() {
    const tokens = [];
    for (let i = 1; i <= 20; i++) {
        const token = process.env[`DISCORD_TOKEN_${i}`];
        if (token && token.trim()) {
            tokens.push(token.trim());
        }
    }
    return tokens;
}

// Validate required config
if (!config.clientId || !config.clientSecret) {
    console.error('❌ DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are required in .env');
}
