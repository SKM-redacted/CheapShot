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

    // PostgreSQL
    postgres: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB || 'cheapshot_dashboard',
        user: process.env.POSTGRES_USER || 'cheapshot',
        password: process.env.POSTGRES_PASSWORD || 'cheapshot_secure_password',
        // Connection string for convenience
        get connectionString() {
            return process.env.DATABASE_URL ||
                `postgresql://${this.user}:${this.password}@${this.host}:${this.port}/${this.database}`;
        }
    },

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
