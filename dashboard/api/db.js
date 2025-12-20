/**
 * Database Helper Module
 * 
 * Provides utility functions for PostgreSQL database operations,
 * including media/image storage and retrieval.
 */
import pg from 'pg';
import { config } from './config.js';

// Create a shared pool
const pool = new pg.Pool({
    connectionString: config.postgres.connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => console.error('PostgreSQL pool error:', err));

/**
 * Get a client from the pool
 */
export async function getClient() {
    return pool.connect();
}

/**
 * Execute a query
 */
export async function query(text, params) {
    return pool.query(text, params);
}

// =============================================================
// Media Storage Functions
// =============================================================

/**
 * Store an image/media file in the database
 * @param {Buffer} data - Binary data of the file
 * @param {string} filename - Original filename
 * @param {string} contentType - MIME type (e.g., 'image/png')
 * @param {string} [guildId] - Optional guild ID
 * @param {string} [userId] - Optional user ID
 * @returns {Promise<{id: number, filename: string}>}
 */
export async function storeMedia(data, filename, contentType, guildId = null, userId = null) {
    const result = await query(
        `INSERT INTO media (guild_id, user_id, filename, content_type, data, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, filename`,
        [guildId, userId, filename, contentType, data, data.length]
    );
    return result.rows[0];
}

/**
 * Retrieve media by ID
 * @param {number} id - Media ID
 * @returns {Promise<{id: number, filename: string, content_type: string, data: Buffer, size_bytes: number}>}
 */
export async function getMedia(id) {
    const result = await query(
        `SELECT id, filename, content_type, data, size_bytes FROM media WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

/**
 * List media for a guild
 * @param {string} guildId 
 * @returns {Promise<Array<{id: number, filename: string, content_type: string, size_bytes: number, created_at: Date}>>}
 */
export async function listMediaByGuild(guildId) {
    const result = await query(
        `SELECT id, filename, content_type, size_bytes, created_at 
         FROM media WHERE guild_id = $1 
         ORDER BY created_at DESC`,
        [guildId]
    );
    return result.rows;
}

/**
 * Delete media by ID
 * @param {number} id 
 */
export async function deleteMedia(id) {
    await query(`DELETE FROM media WHERE id = $1`, [id]);
}

// =============================================================
// Guild Settings Functions
// =============================================================

/**
 * Get guild settings
 * @param {string} guildId 
 * @returns {Promise<object>}
 */
export async function getGuildSettings(guildId) {
    const result = await query(
        `SELECT settings FROM guild_settings WHERE guild_id = $1`,
        [guildId]
    );
    return result.rows[0]?.settings || {};
}

/**
 * Update guild settings (merge with existing)
 * @param {string} guildId 
 * @param {object} settings 
 */
export async function updateGuildSettings(guildId, settings) {
    await query(
        `INSERT INTO guild_settings (guild_id, settings, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (guild_id) 
         DO UPDATE SET settings = guild_settings.settings || $2, updated_at = NOW()`,
        [guildId, JSON.stringify(settings)]
    );
}

/**
 * Set guild settings (replace entirely)
 * @param {string} guildId 
 * @param {object} settings 
 */
export async function setGuildSettings(guildId, settings) {
    await query(
        `INSERT INTO guild_settings (guild_id, settings, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (guild_id) 
         DO UPDATE SET settings = $2, updated_at = NOW()`,
        [guildId, JSON.stringify(settings)]
    );
}

// =============================================================
// Audit Log Functions
// =============================================================

/**
 * Add an audit log entry
 * @param {string} guildId 
 * @param {string} userId 
 * @param {string} action 
 * @param {object} [details] 
 */
export async function addAuditLog(guildId, userId, action, details = {}) {
    await query(
        `INSERT INTO audit_logs (guild_id, user_id, action, details)
         VALUES ($1, $2, $3, $4)`,
        [guildId, userId, action, JSON.stringify(details)]
    );
}

/**
 * Get audit logs for a guild
 * @param {string} guildId 
 * @param {number} [limit=50] 
 * @returns {Promise<Array>}
 */
export async function getAuditLogs(guildId, limit = 50) {
    const result = await query(
        `SELECT id, user_id, action, details, created_at 
         FROM audit_logs WHERE guild_id = $1 
         ORDER BY created_at DESC LIMIT $2`,
        [guildId, limit]
    );
    return result.rows;
}

export default {
    getClient,
    query,
    storeMedia,
    getMedia,
    listMediaByGuild,
    deleteMedia,
    getGuildSettings,
    updateGuildSettings,
    setGuildSettings,
    addAuditLog,
    getAuditLogs
};
