/**
 * CheapShot Dashboard Frontend JavaScript
 * Handles API calls, server selection, and UI updates
 */

// =============================================================
// State
// =============================================================
const state = {
    user: null,
    guilds: [],
    selectedGuild: null,
    channels: [],
    roles: []
};

// =============================================================
// API Functions
// =============================================================

async function apiCall(endpoint, options = {}) {
    const response = await fetch(`/api${endpoint}`, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    if (response.status === 401) {
        window.location.href = '/';
        throw new Error('Unauthorized');
    }

    return response.json();
}

async function fetchUser() {
    const data = await apiCall('/auth/user');
    return data.user;
}

async function fetchGuilds() {
    const data = await apiCall('/guilds');
    return data.guilds;
}

async function fetchGuildDetails(guildId) {
    const data = await apiCall(`/guilds/${guildId}`);
    return data;
}

async function fetchChannels(guildId) {
    const data = await apiCall(`/guilds/${guildId}/channels`);
    return data.channels;
}

async function fetchRoles(guildId) {
    const data = await apiCall(`/guilds/${guildId}/roles`);
    return data.roles;
}

async function syncChannels(guildId) {
    const data = await apiCall(`/guilds/${guildId}/sync`, { method: 'POST' });
    return data;
}

async function fetchBotChannelConfig(guildId) {
    const data = await apiCall(`/guilds/${guildId}/channels/config`);
    return data.channels || {};
}

async function fetchGuildStatus(guildId) {
    const data = await apiCall(`/guilds/${guildId}/status`);
    return data;
}

async function logout() {
    await apiCall('/auth/logout', { method: 'POST' });
    window.location.href = '/';
}

// =============================================================
// UI Functions
// =============================================================

function getAvatarUrl(user) {
    if (user.avatar) {
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=64`;
    }
    // Default avatar
    const defaultIndex = parseInt(user.id) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
}

function renderUserInfo() {
    const userInfo = document.getElementById('user-info');
    if (!state.user) return;

    userInfo.innerHTML = `
        <div class="user-avatar">
            <img src="${getAvatarUrl(state.user)}" alt="" />
        </div>
        <span class="user-name">${state.user.globalName || state.user.username}</span>
    `;
}

function renderServerList() {
    const serverList = document.getElementById('server-list');

    if (state.guilds.length === 0) {
        serverList.innerHTML = `
            <div class="loading-placeholder">No servers found</div>
        `;
        return;
    }

    serverList.innerHTML = state.guilds.map(guild => `
        <div class="server-item ${state.selectedGuild?.id === guild.id ? 'active' : ''}" 
             data-guild-id="${guild.id}">
            <div class="server-icon">
                ${guild.iconUrl
            ? `<img src="${guild.iconUrl}" alt="" />`
            : guild.name.charAt(0).toUpperCase()
        }
            </div>
            <span class="server-name">${guild.name}</span>
        </div>
    `).join('');

    // Add click handlers
    serverList.querySelectorAll('.server-item').forEach(item => {
        item.addEventListener('click', () => {
            const guildId = item.dataset.guildId;
            selectGuild(guildId);
        });
    });
}

async function selectGuild(guildId) {
    const guild = state.guilds.find(g => g.id === guildId);
    if (!guild) return;

    state.selectedGuild = guild;

    // Update sidebar active state
    document.querySelectorAll('.server-item').forEach(item => {
        item.classList.toggle('active', item.dataset.guildId === guildId);
    });

    // Show loading
    document.getElementById('welcome-state').classList.add('hidden');
    document.getElementById('server-overview').classList.remove('hidden');
    document.getElementById('page-title').textContent = guild.name;
    document.getElementById('page-subtitle').textContent = 'Loading server details...';

    try {
        // First check if bot is in this guild
        let guildStatus;
        try {
            guildStatus = await fetchGuildStatus(guildId);
        } catch (e) {
            // Status check failed, bot probably not in server
            guildStatus = { botPresent: false };
        }

        // If bot not in server, show invite prompt
        if (!guildStatus.botPresent) {
            showBotNotInServer(guild);
            return;
        }

        // Bot is in server, fetch all data
        const [details, channels, roles, botChannels] = await Promise.all([
            fetchGuildDetails(guildId),
            fetchChannels(guildId),
            fetchRoles(guildId),
            fetchBotChannelConfig(guildId)
        ]);

        state.channels = channels;
        state.roles = roles;
        state.botChannels = botChannels;

        // Update stats
        document.getElementById('member-count').textContent = details.memberCount?.toLocaleString() || '-';
        document.getElementById('online-count').textContent = details.onlineCount?.toLocaleString() || '-';
        document.getElementById('channel-count').textContent = channels.length;
        document.getElementById('role-count').textContent = roles.length;

        document.getElementById('page-subtitle').textContent = details.description || 'Manage your server settings';

        // Update bot channels status
        updateBotChannelsStatus(botChannels);

        // Render lists
        renderChannels();
        renderRoles();

        // Init sync button
        initSyncButton();

    } catch (err) {
        console.error('Failed to load guild:', err);
        document.getElementById('page-subtitle').textContent = 'Failed to load server details';
    }
}

function showBotNotInServer(guild) {
    const clientId = '1447587559604486417'; // Your bot's client ID
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guild.id}`;

    document.getElementById('page-subtitle').textContent = 'Bot not installed';

    // Hide normal content
    document.getElementById('server-overview').classList.add('hidden');
    document.getElementById('welcome-state').classList.remove('hidden');

    // Show invite message
    document.querySelector('.welcome-card').innerHTML = `
        <div class="welcome-icon">🤖</div>
        <h2>Add CheapShot to ${guild.name}</h2>
        <p>CheapShot bot is not installed in this server yet.</p>
        <p>Click the button below to add it!</p>
        <a href="${inviteUrl}" target="_blank" class="discord-login-btn" style="margin-top: 1.5rem;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z"/>
            </svg>
            Add CheapShot Bot
        </a>
        <p class="hint" style="margin-top: 1rem;">After adding the bot, refresh this page.</p>
    `;
}

function updateBotChannelsStatus(botChannels) {
    const statusBanner = document.getElementById('bot-channels-status');
    const channelNames = Object.keys(botChannels);

    if (channelNames.length > 0) {
        statusBanner.className = 'status-banner success';
        statusBanner.innerHTML = `
            <strong>✅ Bot Active</strong> - Responding in: ${channelNames.map(n => `#${n}`).join(', ')}
        `;
    } else {
        statusBanner.className = 'status-banner warning';
        statusBanner.innerHTML = `
            <strong>⚠️ No Channels Configured</strong> - Click "Sync Channels" to enable bot responses in CheapShot channels
        `;
    }
    statusBanner.classList.remove('hidden');
}

function initSyncButton() {
    const syncBtn = document.getElementById('sync-channels-btn');
    if (!syncBtn || !state.selectedGuild) return;

    // Remove old handler
    const newBtn = syncBtn.cloneNode(true);
    syncBtn.parentNode.replaceChild(newBtn, syncBtn);

    newBtn.addEventListener('click', async () => {
        newBtn.disabled = true;
        newBtn.textContent = '⏳ Syncing...';

        try {
            const result = await syncChannels(state.selectedGuild.id);

            if (result.setupComplete) {
                alert(`✅ Success! Found ${result.channelsFound?.length || 0} CheapShot channel(s). The bot will now respond in these channels.`);
                // Refresh bot channel config
                const botChannels = await fetchBotChannelConfig(state.selectedGuild.id);
                state.botChannels = botChannels;
                updateBotChannelsStatus(botChannels);
            } else {
                alert(`⚠️ ${result.message}\n\n${result.hint || ''}`);
            }
        } catch (err) {
            console.error('Sync failed:', err);
            alert('❌ Failed to sync channels. Check console for details.');
        } finally {
            newBtn.disabled = false;
            newBtn.textContent = '🔄 Sync Channels';
        }
    });
}

function renderChannels() {
    const channelsList = document.getElementById('channels-list');

    // Group channels by category
    const categories = new Map();
    const uncategorized = [];

    // First, find all categories
    state.channels.forEach(ch => {
        if (ch.type === 4) { // Category
            categories.set(ch.id, { ...ch, children: [] });
        }
    });

    // Then assign channels to categories
    state.channels.forEach(ch => {
        if (ch.type === 4) return; // Skip categories

        if (ch.parentId && categories.has(ch.parentId)) {
            categories.get(ch.parentId).children.push(ch);
        } else {
            uncategorized.push(ch);
        }
    });

    let html = '';

    // Render uncategorized first
    uncategorized.forEach(ch => {
        html += renderChannelItem(ch);
    });

    // Render categories with their children
    Array.from(categories.values())
        .sort((a, b) => a.position - b.position)
        .forEach(cat => {
            html += `
                <div class="list-item channel-category">
                    <span class="item-name">${cat.name}</span>
                </div>
            `;
            cat.children
                .sort((a, b) => a.position - b.position)
                .forEach(ch => {
                    html += renderChannelItem(ch, true);
                });
        });

    channelsList.innerHTML = html || '<div class="loading-placeholder">No channels</div>';
}

function renderChannelItem(channel, indented = false) {
    const typeClass = channel.type === 2 ? 'channel-voice' : 'channel-text';
    const typeIcon = channel.type === 2 ? '🔊' : '#';

    return `
        <div class="list-item ${typeClass}" style="${indented ? 'margin-left: 1rem;' : ''}">
            <span class="item-icon">${typeIcon}</span>
            <span class="item-name">${channel.name}</span>
        </div>
    `;
}

function renderRoles() {
    const rolesList = document.getElementById('roles-list');

    const html = state.roles.map(role => {
        const colorHex = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : '#99aab5';

        return `
            <div class="list-item">
                <span class="role-color" style="background: ${colorHex}"></span>
                <span class="item-name">${role.name}</span>
                <span class="item-meta">${role.managed ? 'Managed' : ''}</span>
            </div>
        `;
    }).join('');

    rolesList.innerHTML = html || '<div class="loading-placeholder">No roles</div>';
}

// =============================================================
// Tab Navigation
// =============================================================

function initTabs() {
    const tabs = document.querySelectorAll('.tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update tab buttons
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update panels
            document.querySelectorAll('.tab-panel').forEach(panel => {
                panel.classList.add('hidden');
            });
            document.getElementById(`${targetTab}-tab`).classList.remove('hidden');
        });
    });
}

// =============================================================
// Logout Handler
// =============================================================

function initLogout() {
    document.getElementById('logout-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to logout?')) {
            await logout();
        }
    });
}

// =============================================================
// Initialize
// =============================================================

async function init() {
    try {
        // Fetch user and guilds
        const [user, guilds] = await Promise.all([
            fetchUser(),
            fetchGuilds()
        ]);

        state.user = user;
        state.guilds = guilds;

        // Render UI
        renderUserInfo();
        renderServerList();
        initTabs();
        initLogout();

    } catch (err) {
        console.error('Init error:', err);
        // Redirect to login if auth fails
        if (err.message === 'Unauthorized') {
            window.location.href = '/';
        }
    }
}

// Start
init();
