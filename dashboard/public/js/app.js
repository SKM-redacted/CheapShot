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
        // Fetch all data in parallel
        const [details, channels, roles] = await Promise.all([
            fetchGuildDetails(guildId),
            fetchChannels(guildId),
            fetchRoles(guildId)
        ]);

        state.channels = channels;
        state.roles = roles;

        // Update stats
        document.getElementById('member-count').textContent = details.memberCount?.toLocaleString() || '-';
        document.getElementById('online-count').textContent = details.onlineCount?.toLocaleString() || '-';
        document.getElementById('channel-count').textContent = channels.length;
        document.getElementById('role-count').textContent = roles.length;

        document.getElementById('page-subtitle').textContent = details.description || 'Manage your server settings';

        // Render lists
        renderChannels();
        renderRoles();

    } catch (err) {
        console.error('Failed to load guild:', err);
        document.getElementById('page-subtitle').textContent = 'Failed to load server details';
    }
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
