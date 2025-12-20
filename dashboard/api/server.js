/**
 * CheapShot Dashboard API Server
 * 
 * Handles Discord OAuth2 authentication and provides API endpoints
 * for the web dashboard to control Discord servers.
 */
import express from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import pg from 'pg';
import cors from 'cors';
import { config } from './config.js';
import db from './db.js';

const app = express();

// =============================================================
// PostgreSQL Setup
// =============================================================
const PGStore = pgSession(session);

const pgPool = new pg.Pool({
    connectionString: config.postgres.connectionString,
    max: 10, // max clients in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pgPool.on('error', (err) => console.error('PostgreSQL pool error:', err));
pgPool.on('connect', () => console.log('✅ Connected to PostgreSQL'));

// Test connection on startup
try {
    const client = await pgPool.connect();
    console.log('✅ PostgreSQL connection verified');
    client.release();
} catch (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
}

// =============================================================
// Middleware
// =============================================================
app.use(cors({
    origin: true, // Allow same origin (NGINX proxies to us)
    credentials: true
}));

app.use(express.json());

app.use(session({
    store: new PGStore({
        pool: pgPool,
        tableName: 'session', // matches init-db.sql
        createTableIfMissing: true
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Cloudflare tunnel handles HTTPS, we receive HTTP
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// =============================================================
// Helper Functions
// =============================================================

/**
 * Exchange authorization code for tokens
 */
async function exchangeCode(code) {
    const params = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.redirectUri
    });

    const response = await fetch(`${config.discordApiBase}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
    }

    return response.json();
}

/**
 * Refresh an expired access token
 */
async function refreshToken(refreshToken) {
    const params = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    });

    const response = await fetch(`${config.discordApiBase}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });

    if (!response.ok) {
        throw new Error('Token refresh failed');
    }

    return response.json();
}

/**
 * Fetch user info from Discord
 */
async function fetchUser(accessToken) {
    const response = await fetch(`${config.discordApiBase}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch user');
    }

    return response.json();
}

// User guilds cache to avoid rate limits (30 second TTL)
const userGuildsCache = new Map();
const GUILDS_CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Fetch user's guilds from Discord (with caching and retry)
 */
async function fetchUserGuilds(accessToken) {
    // Check cache first
    const cacheKey = accessToken.substring(0, 20); // Use token prefix as key
    const cached = userGuildsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < GUILDS_CACHE_TTL) {
        return cached.guilds;
    }

    // Retry logic for rate limits
    let retries = 3;
    while (retries > 0) {
        const response = await fetch(`${config.discordApiBase}/users/@me/guilds`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (response.status === 429) {
            const data = await response.json();
            const retryAfter = (data.retry_after || 1) * 1000;
            console.log(`Rate limited, waiting ${retryAfter}ms`);
            await new Promise(r => setTimeout(r, retryAfter + 100));
            retries--;
            continue;
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Discord guilds API error: ${response.status} - ${errorText}`);
            throw new Error('Failed to fetch guilds');
        }

        const guilds = await response.json();

        // Cache the result
        userGuildsCache.set(cacheKey, { guilds, timestamp: Date.now() });

        return guilds;
    }

    throw new Error('Rate limited - please wait a moment and try again');
}

// Bot guilds cache - longer TTL since bot membership changes less frequently
let botGuildsCache = null;
let botGuildsCacheTimestamp = 0;
const BOT_GUILDS_CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Get guilds where the bot is a member (using first bot token)
 * Includes caching and retry logic for reliability
 */
async function fetchBotGuilds() {
    if (config.botTokens.length === 0) {
        return new Set();
    }

    // Check cache first
    if (botGuildsCache && (Date.now() - botGuildsCacheTimestamp) < BOT_GUILDS_CACHE_TTL) {
        return botGuildsCache;
    }

    // Retry logic for rate limits
    let retries = 3;
    while (retries > 0) {
        try {
            const response = await fetch(`${config.discordApiBase}/users/@me/guilds`, {
                headers: { Authorization: `Bot ${config.botTokens[0]}` }
            });

            if (response.status === 429) {
                const data = await response.json();
                const retryAfter = (data.retry_after || 1) * 1000;
                console.log(`Bot guilds rate limited, waiting ${retryAfter}ms`);
                await new Promise(r => setTimeout(r, retryAfter + 100));
                retries--;
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to fetch bot guilds: ${response.status} - ${errorText}`);
                // Return cached data if available, otherwise empty set
                return botGuildsCache || new Set();
            }

            const guilds = await response.json();
            const guildSet = new Set(guilds.map(g => g.id));

            // Update cache
            botGuildsCache = guildSet;
            botGuildsCacheTimestamp = Date.now();

            return guildSet;
        } catch (error) {
            console.error('Error fetching bot guilds:', error.message);
            retries--;
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    // Return cached data if available after exhausting retries
    console.warn('Exhausted retries for bot guilds, using cached data');
    return botGuildsCache || new Set();
}

/**
 * Check if user has MANAGE_GUILD permission
 */
function hasManageGuild(permissions) {
    const MANAGE_GUILD = 0x20; // 32
    return (BigInt(permissions) & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD);
}

/**
 * Check if user has ADMINISTRATOR permission (full access)
 */
function hasAdministrator(permissions) {
    const ADMINISTRATOR = 0x8; // 8
    return (BigInt(permissions) & BigInt(ADMINISTRATOR)) === BigInt(ADMINISTRATOR);
}

/**
 * Required permission level for dashboard access
 * Options: 'MANAGE_GUILD' (moderate) or 'ADMINISTRATOR' (strict)
 */
const REQUIRED_PERMISSION = 'MANAGE_GUILD';

/**
 * Check if user meets the required permission level
 */
function hasRequiredPermission(permissions) {
    if (REQUIRED_PERMISSION === 'ADMINISTRATOR') {
        return hasAdministrator(permissions);
    }
    // MANAGE_GUILD OR ADMINISTRATOR both grant access
    return hasManageGuild(permissions) || hasAdministrator(permissions);
}

// =============================================================
// Permission Cache (reduces Discord API calls)
// =============================================================
const permissionCache = new Map();
const PERMISSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedPermission(userId, guildId) {
    const key = `${userId}-${guildId}`;
    const cached = permissionCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < PERMISSION_CACHE_TTL) {
        return cached.hasPermission;
    }
    return null;
}

function setCachedPermission(userId, guildId, hasPermission) {
    const key = `${userId}-${guildId}`;
    permissionCache.set(key, { hasPermission, timestamp: Date.now() });
}

function clearUserPermissionCache(userId) {
    for (const key of permissionCache.keys()) {
        if (key.startsWith(`${userId}-`)) {
            permissionCache.delete(key);
        }
    }
}

// =============================================================
// Auth Middleware
// =============================================================

/**
 * Basic authentication check - user is logged in
 */
function requireAuth(req, res, next) {
    if (!req.session.user || !req.session.accessToken) {
        return res.status(401).json({ error: 'Unauthorized', code: 'NOT_LOGGED_IN' });
    }
    next();
}

/**
 * Per-guild authorization middleware factory
 * Verifies user has permission to access/modify the specific guild
 * This is the key security check for multi-server support
 */
function requireGuildAuth(paramName = 'guildId') {
    return async (req, res, next) => {
        // First check basic auth
        if (!req.session.user || !req.session.accessToken) {
            return res.status(401).json({ error: 'Unauthorized', code: 'NOT_LOGGED_IN' });
        }

        const guildId = req.params[paramName];
        if (!guildId) {
            return res.status(400).json({ error: 'Guild ID required', code: 'MISSING_GUILD_ID' });
        }

        const userId = req.session.user.id;

        // Check cache first
        const cachedResult = getCachedPermission(userId, guildId);
        if (cachedResult !== null) {
            if (!cachedResult) {
                return res.status(403).json({
                    error: 'You do not have permission to manage this server',
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
            }
            return next();
        }

        try {
            // Refresh token if needed
            if (Date.now() >= req.session.tokenExpiry - 60000) {
                try {
                    const tokens = await refreshToken(req.session.refreshToken);
                    req.session.accessToken = tokens.access_token;
                    req.session.refreshToken = tokens.refresh_token;
                    req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
                } catch (e) {
                    return res.status(401).json({ error: 'Session expired', code: 'TOKEN_EXPIRED' });
                }
            }

            // Use guilds from session (fetched at login) - no API call needed!
            const userGuilds = req.session.guilds || [];

            if (userGuilds.length === 0) {
                // Session might be old, try fetching once
                const freshGuilds = await fetchUserGuilds(req.session.accessToken);
                req.session.guilds = freshGuilds;
                req.session.guildsTimestamp = Date.now();
            }

            // Find this specific guild
            const guild = (req.session.guilds || []).find(g => g.id === guildId);

            if (!guild) {
                // User is not in this guild at all
                setCachedPermission(userId, guildId, false);
                return res.status(403).json({
                    error: 'You are not a member of this server',
                    code: 'NOT_IN_GUILD'
                });
            }

            // Check if user has required permission
            const hasPerms = hasRequiredPermission(guild.permissions);
            setCachedPermission(userId, guildId, hasPerms);

            if (!hasPerms) {
                return res.status(403).json({
                    error: 'You do not have permission to manage this server. Requires: Manage Server or Administrator',
                    code: 'INSUFFICIENT_PERMISSIONS',
                    requiredPermission: REQUIRED_PERMISSION
                });
            }

            // Also verify bot is in the guild (optional but helpful)
            const botGuildIds = await fetchBotGuilds();
            req.botInGuild = botGuildIds.has(guildId);

            // Store guild info for route handlers
            req.guildInfo = {
                id: guild.id,
                name: guild.name,
                permissions: guild.permissions,
                owner: guild.owner,
                botPresent: req.botInGuild
            };

            next();
        } catch (error) {
            console.error('Guild auth error:', error);
            return res.status(500).json({ error: 'Failed to verify permissions', code: 'PERMISSION_CHECK_FAILED' });
        }
    };
}

// =============================================================
// Routes
// =============================================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OAuth2 callback - exchange code for token
app.post('/api/auth/callback', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Missing authorization code' });
    }

    try {
        // Exchange code for tokens
        const tokens = await exchangeCode(code);

        // Fetch user info
        const user = await fetchUser(tokens.access_token);

        // Fetch guilds ONCE at login and store in session
        const guilds = await fetchUserGuilds(tokens.access_token);

        // Store in session
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
        req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
        req.session.user = {
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar: user.avatar,
            globalName: user.global_name
        };
        // Store guilds in session - refresh with /api/guilds/refresh endpoint
        req.session.guilds = guilds;
        req.session.guildsTimestamp = Date.now();

        res.json({
            success: true,
            user: req.session.user
        });
    } catch (error) {
        console.error('Auth callback error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Get current user
app.get('/api/auth/user', requireAuth, (req, res) => {
    res.json({ user: req.session.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

// Get user's manageable guilds with full status info
// Returns ALL servers user can manage, with status on whether bot is present and configured
app.get('/api/guilds', requireAuth, async (req, res) => {
    try {
        // Check if token needs refresh
        if (Date.now() >= req.session.tokenExpiry - 60000) {
            try {
                const tokens = await refreshToken(req.session.refreshToken);
                req.session.accessToken = tokens.access_token;
                req.session.refreshToken = tokens.refresh_token;
                req.session.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            } catch (e) {
                return res.status(401).json({ error: 'Session expired', code: 'TOKEN_EXPIRED' });
            }
        }

        // Fetch user's guilds
        let userGuilds = [];
        try {
            userGuilds = await fetchUserGuilds(req.session.accessToken);
        } catch (e) {
            console.error('Failed to fetch user guilds:', e);
            return res.status(500).json({ error: 'Failed to fetch your Discord servers', code: 'DISCORD_API_ERROR' });
        }

        // Fetch bot's guilds
        let botGuildIds = new Set();
        try {
            botGuildIds = await fetchBotGuilds();
        } catch (e) {
            console.error('Failed to fetch bot guilds:', e);
            // Continue - we'll just mark all as bot_not_present
        }

        // Filter to guilds where user has required permission level
        const manageableGuilds = userGuilds.filter(guild => hasRequiredPermission(guild.permissions));

        // Build bot invite URL (with required permissions)
        const botInviteUrl = config.clientId
            ? `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&permissions=8&scope=bot%20applications.commands`
            : null;

        // Format response with full status for each guild
        const guildsWithStatus = await Promise.all(manageableGuilds.map(async (guild) => {
            const botPresent = botGuildIds.has(guild.id);

            // Check if guild has channel config in database
            let channelConfig = null;
            let setupComplete = false;
            let channelCount = 0;

            if (botPresent) {
                try {
                    channelConfig = await db.getChannelConfig(guild.id);
                    if (channelConfig && channelConfig.channels) {
                        channelCount = Object.keys(channelConfig.channels).length;
                        setupComplete = channelCount > 0;
                    }
                } catch (e) {
                    // Database error - will show as not configured
                    console.error(`Failed to get config for guild ${guild.id}:`, e.message);
                }
            }

            return {
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                iconUrl: guild.icon
                    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=128`
                    : null,
                owner: guild.owner,
                // Status flags
                botPresent,
                setupComplete,
                channelCount,
                // What action is needed
                status: !botPresent
                    ? 'bot_not_added'
                    : !setupComplete
                        ? 'needs_setup'
                        : 'ready',
                // Invite URL if bot not present
                inviteUrl: !botPresent ? botInviteUrl : null
            };
        }));

        // Sort: ready first, then needs_setup, then bot_not_added
        const statusOrder = { ready: 0, needs_setup: 1, bot_not_added: 2 };
        guildsWithStatus.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

        res.json({
            guilds: guildsWithStatus,
            botInviteUrl,
            summary: {
                total: guildsWithStatus.length,
                ready: guildsWithStatus.filter(g => g.status === 'ready').length,
                needsSetup: guildsWithStatus.filter(g => g.status === 'needs_setup').length,
                botNotAdded: guildsWithStatus.filter(g => g.status === 'bot_not_added').length
            }
        });
    } catch (error) {
        console.error('Fetch guilds error:', error);
        res.status(500).json({ error: 'Failed to fetch guilds', code: 'UNKNOWN_ERROR' });
    }
});

// Get specific guild info
app.get('/api/guilds/:guildId', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;

    try {
        // Use bot token to get detailed guild info
        if (config.botTokens.length === 0) {
            return res.status(500).json({ error: 'No bot token configured' });
        }

        const response = await fetch(`${config.discordApiBase}/guilds/${guildId}?with_counts=true`, {
            headers: { Authorization: `Bot ${config.botTokens[0]}` }
        });

        if (!response.ok) {
            return res.status(404).json({ error: 'Guild not found or bot not a member' });
        }

        const guild = await response.json();

        res.json({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            iconUrl: guild.icon
                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=256`
                : null,
            description: guild.description,
            memberCount: guild.approximate_member_count,
            onlineCount: guild.approximate_presence_count,
            ownerId: guild.owner_id,
            features: guild.features
        });
    } catch (error) {
        console.error('Fetch guild error:', error);
        res.status(500).json({ error: 'Failed to fetch guild' });
    }
});

// Get guild channels
app.get('/api/guilds/:guildId/channels', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;

    try {
        if (config.botTokens.length === 0) {
            return res.status(500).json({ error: 'No bot token configured' });
        }

        const response = await fetch(`${config.discordApiBase}/guilds/${guildId}/channels`, {
            headers: { Authorization: `Bot ${config.botTokens[0]}` }
        });

        if (!response.ok) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const channels = await response.json();

        // Group by type and sort
        const formatted = channels.map(ch => ({
            id: ch.id,
            name: ch.name,
            type: ch.type,
            position: ch.position,
            parentId: ch.parent_id
        })).sort((a, b) => a.position - b.position);

        res.json({ channels: formatted });
    } catch (error) {
        console.error('Fetch channels error:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// Get guild roles
app.get('/api/guilds/:guildId/roles', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;

    try {
        if (config.botTokens.length === 0) {
            return res.status(500).json({ error: 'No bot token configured' });
        }

        const response = await fetch(`${config.discordApiBase}/guilds/${guildId}/roles`, {
            headers: { Authorization: `Bot ${config.botTokens[0]}` }
        });

        if (!response.ok) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const roles = await response.json();

        const formatted = roles.map(role => ({
            id: role.id,
            name: role.name,
            color: role.color,
            position: role.position,
            permissions: role.permissions,
            managed: role.managed,
            mentionable: role.mentionable,
            hoist: role.hoist
        })).sort((a, b) => b.position - a.position);

        res.json({ roles: formatted });
    } catch (error) {
        console.error('Fetch roles error:', error);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

// Get guild members (limited to first 1000)
app.get('/api/guilds/:guildId/members', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

    try {
        if (config.botTokens.length === 0) {
            return res.status(500).json({ error: 'No bot token configured' });
        }

        const response = await fetch(`${config.discordApiBase}/guilds/${guildId}/members?limit=${limit}`, {
            headers: { Authorization: `Bot ${config.botTokens[0]}` }
        });

        if (!response.ok) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const members = await response.json();

        const formatted = members.map(member => ({
            id: member.user.id,
            username: member.user.username,
            globalName: member.user.global_name,
            avatar: member.user.avatar,
            avatarUrl: member.user.avatar
                ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.webp?size=64`
                : null,
            bot: member.user.bot || false,
            roles: member.roles,
            joinedAt: member.joined_at,
            nick: member.nick
        })).sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

        res.json({ members: formatted, count: formatted.length });
    } catch (error) {
        console.error('Fetch members error:', error);
        res.status(500).json({ error: 'Failed to fetch members' });
    }
});

// =============================================================
// Auto-Setup & Sync
// =============================================================

// CheapShot channel names to look for
const CHEAPSHOT_CHANNELS = {
    'cheapshot': 'public',
    'cheapshot-private': 'private',
    'cheapshot-moderation': 'moderation'
};

// Auto-detect and sync existing CheapShot channels to database
// Call this when a guild shows "needs_setup" to attempt auto-recovery
app.post('/api/guilds/:guildId/sync', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;

    try {
        if (config.botTokens.length === 0) {
            return res.status(500).json({ error: 'No bot token configured', code: 'NO_BOT_TOKEN' });
        }

        // Fetch guild channels from Discord
        const response = await fetch(`${config.discordApiBase}/guilds/${guildId}/channels`, {
            headers: { Authorization: `Bot ${config.botTokens[0]}` }
        });

        if (!response.ok) {
            const status = response.status;
            if (status === 404 || status === 403) {
                return res.status(404).json({
                    error: 'Bot is not in this server or lacks permissions',
                    code: 'BOT_NOT_IN_GUILD'
                });
            }
            return res.status(500).json({ error: 'Failed to fetch channels from Discord', code: 'DISCORD_API_ERROR' });
        }

        const discordChannels = await response.json();

        // Look for existing CheapShot channels
        const foundChannels = {};
        const channelsFound = [];

        for (const channel of discordChannels) {
            const channelType = CHEAPSHOT_CHANNELS[channel.name.toLowerCase()];
            if (channelType && channel.type === 0) { // type 0 = text channel
                foundChannels[channel.name] = {
                    id: channel.id,
                    type: channelType
                };
                channelsFound.push({ name: channel.name, id: channel.id, type: channelType });
            }
        }

        // If we found any CheapShot channels, save them to database
        if (Object.keys(foundChannels).length > 0) {
            // Get existing config and merge
            const existingConfig = await db.getChannelConfig(guildId);
            const existingChannels = existingConfig?.channels || {};

            const mergedChannels = { ...existingChannels, ...foundChannels };
            await db.saveChannelConfig(guildId, mergedChannels);

            await db.addAuditLog(guildId, req.session.user.id, 'sync_channels', {
                channelsFound: channelsFound.map(c => c.name),
                autoDetected: true
            });

            return res.json({
                success: true,
                message: `Found and synced ${channelsFound.length} CheapShot channel(s)`,
                channelsFound,
                setupComplete: true
            });
        }

        // No CheapShot channels found
        return res.json({
            success: true,
            message: 'No CheapShot channels found. You can add channels manually or the bot will create them automatically.',
            channelsFound: [],
            setupComplete: false,
            hint: 'To have the bot create channels automatically, remove and re-add the bot to this server.'
        });

    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: 'Failed to sync channels', code: 'SYNC_ERROR' });
    }
});

// Get full guild status including setup info
app.get('/api/guilds/:guildId/status', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;

    try {
        if (config.botTokens.length === 0) {
            return res.status(500).json({ error: 'No bot token configured' });
        }

        // Check if bot is in guild
        const guildResponse = await fetch(`${config.discordApiBase}/guilds/${guildId}`, {
            headers: { Authorization: `Bot ${config.botTokens[0]}` }
        });

        const botPresent = guildResponse.ok;

        if (!botPresent) {
            return res.json({
                guildId,
                botPresent: false,
                setupComplete: false,
                channelCount: 0,
                status: 'bot_not_added',
                inviteUrl: config.clientId
                    ? `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}`
                    : null,
                message: 'Bot is not in this server. Add the bot first.'
            });
        }

        // Check database for channel config
        let channelConfig = null;
        let channelCount = 0;
        let channels = {};

        try {
            channelConfig = await db.getChannelConfig(guildId);
            if (channelConfig?.channels) {
                channels = channelConfig.channels;
                channelCount = Object.keys(channels).length;
            }
        } catch (e) {
            console.error(`Failed to get config for ${guildId}:`, e.message);
        }

        const setupComplete = channelCount > 0;

        // Get actual Discord channel info for configured channels
        const channelsWithInfo = [];
        if (setupComplete) {
            const channelsResponse = await fetch(`${config.discordApiBase}/guilds/${guildId}/channels`, {
                headers: { Authorization: `Bot ${config.botTokens[0]}` }
            });

            if (channelsResponse.ok) {
                const discordChannels = await channelsResponse.json();
                const channelMap = new Map(discordChannels.map(c => [c.id, c]));

                for (const [name, data] of Object.entries(channels)) {
                    const discordChannel = channelMap.get(data.id);
                    channelsWithInfo.push({
                        name,
                        id: data.id,
                        type: data.type,
                        exists: !!discordChannel,
                        discordName: discordChannel?.name || null
                    });
                }
            }
        }

        // Check for orphaned channels (in Discord but not in config)
        const discordChannelsResponse = await fetch(`${config.discordApiBase}/guilds/${guildId}/channels`, {
            headers: { Authorization: `Bot ${config.botTokens[0]}` }
        });

        let orphanedChannels = [];
        if (discordChannelsResponse.ok) {
            const discordChannels = await discordChannelsResponse.json();
            const configuredIds = new Set(Object.values(channels).map(c => c.id));

            orphanedChannels = discordChannels
                .filter(c => CHEAPSHOT_CHANNELS[c.name.toLowerCase()] && !configuredIds.has(c.id))
                .map(c => ({ name: c.name, id: c.id, type: CHEAPSHOT_CHANNELS[c.name.toLowerCase()] }));
        }

        res.json({
            guildId,
            botPresent: true,
            setupComplete,
            channelCount,
            status: setupComplete ? 'ready' : 'needs_setup',
            channels: channelsWithInfo,
            orphanedChannels, // CheapShot channels in Discord but not in DB
            canAutoSync: orphanedChannels.length > 0,
            message: setupComplete
                ? `Guild is configured with ${channelCount} channel(s)`
                : orphanedChannels.length > 0
                    ? `Found ${orphanedChannels.length} CheapShot channel(s) that can be synced`
                    : 'No channels configured. Add channels manually or re-add the bot.'
        });

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: 'Failed to check guild status' });
    }
});

// =============================================================
// Guild Settings & Channel Config (Database-backed)
// =============================================================

// Get guild settings
app.get('/api/guilds/:guildId/settings', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;

    try {
        const settings = await db.getGuildSettings(guildId);
        res.json({ settings: settings || {} });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// Update guild settings
app.put('/api/guilds/:guildId/settings', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Invalid settings object' });
    }

    try {
        await db.updateGuildSettings(guildId, settings);

        // Log the action
        await db.addAuditLog(guildId, req.session.user.id, 'update_settings', {
            updatedFields: Object.keys(settings)
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Get channel config for a guild
app.get('/api/guilds/:guildId/channels/config', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;

    try {
        const channelConfig = await db.getChannelConfig(guildId);
        res.json({ channels: channelConfig?.channels || {} });
    } catch (error) {
        console.error('Get channel config error:', error);
        res.status(500).json({ error: 'Failed to get channel config' });
    }
});

// Save channel config for a guild
app.put('/api/guilds/:guildId/channels/config', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;
    const { channels } = req.body;

    if (!channels || typeof channels !== 'object') {
        return res.status(400).json({ error: 'Invalid channels config' });
    }

    try {
        await db.saveChannelConfig(guildId, channels);

        // Log the action
        await db.addAuditLog(guildId, req.session.user.id, 'update_channels', {
            channelNames: Object.keys(channels)
        });

        res.json({ success: true, message: 'Channel config saved. Bot will pick up changes within 1 minute.' });
    } catch (error) {
        console.error('Save channel config error:', error);
        res.status(500).json({ error: 'Failed to save channel config' });
    }
});

// Add a single channel to config
app.post('/api/guilds/:guildId/channels/config', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;
    const { channelName, channelId, channelType } = req.body;

    if (!channelName || !channelId) {
        return res.status(400).json({ error: 'channelName and channelId are required' });
    }

    try {
        await db.addChannel(guildId, channelName, channelId, channelType || 'public');

        await db.addAuditLog(guildId, req.session.user.id, 'add_channel', {
            channelName, channelId, channelType
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Add channel error:', error);
        res.status(500).json({ error: 'Failed to add channel' });
    }
});

// Remove a channel from config
app.delete('/api/guilds/:guildId/channels/config/:channelName', requireGuildAuth(), async (req, res) => {
    const { guildId, channelName } = req.params;

    try {
        await db.removeChannel(guildId, channelName);

        await db.addAuditLog(guildId, req.session.user.id, 'remove_channel', {
            channelName
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Remove channel error:', error);
        res.status(500).json({ error: 'Failed to remove channel' });
    }
});

// Get audit logs for a guild
app.get('/api/guilds/:guildId/audit-logs', requireGuildAuth(), async (req, res) => {
    const { guildId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    try {
        const logs = await db.getAuditLogs(guildId, limit);
        res.json({ logs });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ error: 'Failed to get audit logs' });
    }
});

// =============================================================
// Start Server
// =============================================================
// Bind to 0.0.0.0 so Docker containers (nginx) can reach us
app.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 Dashboard API running on port ${config.port}`);
    console.log(`   Client ID: ${config.clientId}`);
    console.log(`   Redirect URI: ${config.redirectUri}`);
});

