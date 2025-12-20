/**
 * Shared Database Client
 * 
 * Used by both the Discord bot and the Dashboard API to access PostgreSQL.
 * This provides a centralized connection pool and helper functions.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (src/shared/ -> project root = 2 levels up)
dotenv.config({ path: join(__dirname, '../../.env') });

// Build connection string from env vars
const connectionString = process.env.DATABASE_URL ||
    `postgresql://${process.env.POSTGRES_USER || 'cheapshot'}:${process.env.POSTGRES_PASSWORD || 'cheapshot_secure_password'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'cheapshot_dashboard'}`;

// Create a shared pool
let pool = null;

/**
 * Get or create the PostgreSQL connection pool
 */
export function getPool() {
    if (!pool) {
        pool = new pg.Pool({
            connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        pool.on('error', (err) => {
            console.error('PostgreSQL pool error:', err);
        });
    }
    return pool;
}

/**
 * Test the database connection
 */
export async function testConnection() {
    try {
        const client = await getPool().connect();
        await client.query('SELECT 1');
        client.release();
        return true;
    } catch (err) {
        console.error('Database connection failed:', err.message);
        return false;
    }
}

/**
 * Execute a query
 */
export async function query(text, params) {
    return getPool().query(text, params);
}

// =============================================================
// Guild Settings Functions
// =============================================================

/**
 * Default settings for new guilds
 * AI Chat and Moderation are ON by default since that's the core purpose of the bot
 */
const DEFAULT_GUILD_SETTINGS = {
    modules: {
        ai: { enabled: true },
        moderation: { enabled: true }
    },
    mentionRespond: true,
    typingIndicator: true
};

/**
 * Get guild settings from database
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<object>} Settings object (with defaults if not found)
 */
export async function getGuildSettings(guildId) {
    try {
        const result = await query(
            `SELECT settings FROM guild_settings WHERE guild_id = $1`,
            [guildId]
        );
        if (result.rows[0]?.settings) {
            const saved = result.rows[0].settings;
            // Deep merge modules to preserve defaults for each module
            const mergedModules = {
                ...DEFAULT_GUILD_SETTINGS.modules,
                ...saved.modules,
                ai: { ...DEFAULT_GUILD_SETTINGS.modules.ai, ...(saved.modules?.ai || {}) },
                moderation: { ...DEFAULT_GUILD_SETTINGS.modules.moderation, ...(saved.modules?.moderation || {}) }
            };
            return {
                ...DEFAULT_GUILD_SETTINGS,
                ...saved,
                modules: mergedModules
            };
        }
        // Return defaults for new guilds
        return { ...DEFAULT_GUILD_SETTINGS };
    } catch (err) {
        // Table might not exist yet
        console.error('Failed to get guild settings:', err.message);
        return { ...DEFAULT_GUILD_SETTINGS };
    }
}

/**
 * Save/update guild settings
 * @param {string} guildId - Discord guild ID
 * @param {object} settings - Settings object to save
 */
export async function saveGuildSettings(guildId, settings) {
    await query(
        `INSERT INTO guild_settings (guild_id, settings, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (guild_id) 
         DO UPDATE SET settings = $2, updated_at = NOW()`,
        [guildId, JSON.stringify(settings)]
    );
}

/**
 * Merge settings into existing guild settings
 * @param {string} guildId - Discord guild ID  
 * @param {object} newSettings - New settings to merge
 */
export async function updateGuildSettings(guildId, newSettings) {
    const existing = await getGuildSettings(guildId) || {};
    const merged = { ...existing, ...newSettings };
    await saveGuildSettings(guildId, merged);
}

// =============================================================
// Channel Configuration Functions
// =============================================================

/**
 * Get channel configuration for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<object|null>} Channel config { channels: { name: { id, type } } }
 */
export async function getChannelConfig(guildId) {
    const settings = await getGuildSettings(guildId);
    if (!settings) return null;

    // Return the channels portion of settings
    return settings.channels ? { channels: settings.channels } : null;
}

/**
 * Save channel configuration for a guild
 * @param {string} guildId - Discord guild ID
 * @param {object} channels - Channels config { channelName: { id, type } }
 */
export async function saveChannelConfig(guildId, channels) {
    await updateGuildSettings(guildId, { channels });
}

/**
 * Add a channel to the guild config
 * @param {string} guildId 
 * @param {string} channelName - Name identifier for the channel
 * @param {string} channelId - Discord channel ID
 * @param {string} channelType - 'public', 'private', or 'moderation'
 */
export async function addChannel(guildId, channelName, channelId, channelType = 'public') {
    const settings = await getGuildSettings(guildId) || {};
    const channels = settings.channels || {};

    channels[channelName] = { id: channelId, type: channelType };

    await saveGuildSettings(guildId, { ...settings, channels });
}

/**
 * Remove a channel from the guild config
 * @param {string} guildId 
 * @param {string} channelName 
 */
export async function removeChannel(guildId, channelName) {
    const settings = await getGuildSettings(guildId) || {};
    const channels = settings.channels || {};

    delete channels[channelName];

    await saveGuildSettings(guildId, { ...settings, channels });
}

// =============================================================
// Audit Log Functions  
// =============================================================

/**
 * Add an audit log entry
 */
export async function addAuditLog(guildId, userId, action, details = {}) {
    try {
        await query(
            `INSERT INTO audit_logs (guild_id, user_id, action, details)
             VALUES ($1, $2, $3, $4)`,
            [guildId, userId, action, JSON.stringify(details)]
        );
    } catch (err) {
        console.error('Failed to add audit log:', err.message);
    }
}

/**
 * Get audit logs for a guild
 */
export async function getAuditLogs(guildId, limit = 50) {
    try {
        const result = await query(
            `SELECT id, user_id, action, details, created_at 
             FROM audit_logs WHERE guild_id = $1 
             ORDER BY created_at DESC LIMIT $2`,
            [guildId, limit]
        );
        return result.rows;
    } catch (err) {
        console.error('Failed to get audit logs:', err.message);
        return [];
    }
}

export default {
    getPool,
    testConnection,
    query,
    getGuildSettings,
    saveGuildSettings,
    updateGuildSettings,
    getChannelConfig,
    saveChannelConfig,
    addChannel,
    removeChannel,
    addAuditLog,
    getAuditLogs
};
