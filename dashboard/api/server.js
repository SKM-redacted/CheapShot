/**
 * CheapShot Dashboard API Server
 * 
 * Handles Discord OAuth2 authentication and provides API endpoints
 * for the web dashboard to control Discord servers.
 */
import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import cors from 'cors';
import { config } from './config.js';

const app = express();

// =============================================================
// Redis Setup
// =============================================================
const redisClient = createClient({ url: config.redisUrl });

redisClient.on('error', (err) => console.error('Redis error:', err));
redisClient.on('connect', () => console.log('✅ Connected to Redis'));

await redisClient.connect();

// =============================================================
// Middleware
// =============================================================
app.use(cors({
    origin: true, // Allow same origin (NGINX proxies to us)
    credentials: true
}));

app.use(express.json());

app.use(session({
    store: new RedisStore({ client: redisClient }),
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

/**
 * Fetch user's guilds from Discord
 */
async function fetchUserGuilds(accessToken) {
    const response = await fetch(`${config.discordApiBase}/users/@me/guilds`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch guilds');
    }

    return response.json();
}

/**
 * Get guilds where the bot is a member (using first bot token)
 */
async function fetchBotGuilds() {
    if (config.botTokens.length === 0) {
        return new Set();
    }

    const response = await fetch(`${config.discordApiBase}/users/@me/guilds`, {
        headers: { Authorization: `Bot ${config.botTokens[0]}` }
    });

    if (!response.ok) {
        console.error('Failed to fetch bot guilds');
        return new Set();
    }

    const guilds = await response.json();
    return new Set(guilds.map(g => g.id));
}

/**
 * Check if user has MANAGE_GUILD permission
 */
function hasManageGuild(permissions) {
    const MANAGE_GUILD = 0x20; // 32
    return (BigInt(permissions) & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD);
}

// =============================================================
// Auth Middleware
// =============================================================
function requireAuth(req, res, next) {
    if (!req.session.user || !req.session.accessToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
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

// Get user's manageable guilds (where they have MANAGE_GUILD and bot is present)
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
                return res.status(401).json({ error: 'Session expired' });
            }
        }

        // Fetch user's guilds
        const userGuilds = await fetchUserGuilds(req.session.accessToken);

        // Fetch bot's guilds
        const botGuildIds = await fetchBotGuilds();

        // Filter to guilds where:
        // 1. User has MANAGE_GUILD permission
        // 2. Bot is a member
        const manageableGuilds = userGuilds.filter(guild => {
            const canManage = hasManageGuild(guild.permissions);
            const botPresent = botGuildIds.has(guild.id);
            return canManage && botPresent;
        });

        // Format response
        const guilds = manageableGuilds.map(guild => ({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            iconUrl: guild.icon
                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=128`
                : null,
            owner: guild.owner
        }));

        res.json({ guilds });
    } catch (error) {
        console.error('Fetch guilds error:', error);
        res.status(500).json({ error: 'Failed to fetch guilds' });
    }
});

// Get specific guild info
app.get('/api/guilds/:guildId', requireAuth, async (req, res) => {
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
app.get('/api/guilds/:guildId/channels', requireAuth, async (req, res) => {
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
app.get('/api/guilds/:guildId/roles', requireAuth, async (req, res) => {
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

// =============================================================
// Start Server
// =============================================================
app.listen(config.port, () => {
    console.log(`🚀 Dashboard API running on port ${config.port}`);
    console.log(`   Client ID: ${config.clientId}`);
    console.log(`   Redirect URI: ${config.redirectUri}`);
});
