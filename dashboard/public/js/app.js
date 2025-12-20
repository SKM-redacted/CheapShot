/**
 * CheapShot Dashboard - Main Application
 * Entry point and controller
 */

import api from './api.js';
import state from './state.js';
import { panel } from './components/panel.js';
import { toast } from './components/toast.js';

// Import modules
import * as appearanceModule from './modules/appearance.js';

// Module registry
const modules = {
    appearance: appearanceModule
};

// =============================================================
// Initialization
// =============================================================

async function init() {
    console.log('🚀 CheapShot Dashboard initializing...');

    // Initialize components
    panel.init();
    toast.init();

    try {
        // Load user
        state.set('loading.user', true);
        const user = await api.getUser();
        state.set('user', user);
        updateUserUI(user);

        // Load guilds
        state.set('loading.guilds', true);
        const guilds = await api.getGuilds();
        state.set('guilds', guilds);
        renderServerList(guilds);

        state.set('loading.guilds', false);
        console.log('✅ Dashboard ready');

    } catch (error) {
        console.error('❌ Init failed:', error);
        toast.error('Failed to load dashboard. Please refresh.');
    }
}

// =============================================================
// UI Updates
// =============================================================

function updateUserUI(user) {
    const avatarImg = document.getElementById('user-avatar-img');
    if (user.avatar) {
        avatarImg.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=64`;
    } else {
        avatarImg.src = `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`;
    }
    avatarImg.alt = user.username;
    document.getElementById('user-avatar').setAttribute('data-tooltip', user.globalName || user.username);
}

function renderServerList(guilds) {
    const container = document.getElementById('server-list');

    if (!guilds || guilds.length === 0) {
        container.innerHTML = '<div class="text-muted text-sm" style="padding: 1rem;">No servers</div>';
        return;
    }

    // Filter to only show servers where bot is present
    const availableGuilds = guilds.filter(g => g.botPresent);

    let html = availableGuilds.map(guild => `
        <div class="server-icon ${state.get('selectedGuildId') === guild.id ? 'active' : ''}" 
             data-guild-id="${guild.id}" 
             data-tooltip="${guild.name}">
            ${guild.iconUrl
            ? `<img src="${guild.iconUrl}" alt="${guild.name}">`
            : guild.name.charAt(0).toUpperCase()
        }
        </div>
    `).join('');

    // Add divider and "add bot" button if there are servers without bot
    const needsBot = guilds.filter(g => !g.botPresent);
    if (needsBot.length > 0) {
        html += `
            <div class="server-divider"></div>
            <div class="server-icon server-add" data-tooltip="Add to another server">
                +
            </div>
        `;
    }

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.server-icon[data-guild-id]').forEach(el => {
        el.addEventListener('click', () => selectServer(el.dataset.guildId));
    });

    // Add bot button
    const addBtn = container.querySelector('.server-add');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            // Open bot invite in new tab
            const clientId = '1447587559604486417'; // TODO: Get from config
            window.open(
                `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`,
                '_blank'
            );
        });
    }
}

async function selectServer(guildId) {
    if (state.get('selectedGuildId') === guildId) return;

    // Close panel if open
    if (state.get('panelOpen')) {
        panel.close();
    }

    state.set('selectedGuildId', guildId);

    // Update sidebar active state
    document.querySelectorAll('.server-icon').forEach(el => {
        el.classList.toggle('active', el.dataset.guildId === guildId);
    });

    // Find guild data
    const guild = state.get('guilds').find(g => g.id === guildId);
    state.set('selectedGuild', guild);

    // Update header
    updateHeaderUI(guild);

    // Show module grid, hide welcome
    document.getElementById('welcome-state').classList.add('hidden');
    document.getElementById('module-grid').classList.remove('hidden');

    // Render modules
    renderModuleGrid();

    // Load additional guild data
    try {
        const [channels, roles, details] = await Promise.all([
            api.getGuildChannels(guildId),
            api.getGuildRoles(guildId),
            api.getGuild(guildId)
        ]);

        state.set('channels', channels);
        state.set('roles', roles);

        // Merge details into selected guild
        state.set('selectedGuild', { ...guild, ...details });
        updateHeaderUI(state.get('selectedGuild'));

    } catch (error) {
        console.error('Failed to load guild data:', error);
    }
}

function updateHeaderUI(guild) {
    const iconEl = document.querySelector('#header-server-icon img');
    const nameEl = document.getElementById('header-server-name');

    if (guild) {
        if (guild.iconUrl) {
            iconEl.src = guild.iconUrl;
            iconEl.parentElement.classList.remove('hidden');
        } else {
            iconEl.parentElement.classList.add('hidden');
        }
        nameEl.textContent = guild.name;
    } else {
        nameEl.textContent = 'Select a Server';
    }
}

function renderModuleGrid() {
    const container = document.getElementById('module-grid');

    // Render all module cards
    let html = '';
    for (const [id, module] of Object.entries(modules)) {
        if (module.renderCard) {
            html += module.renderCard();
        }
    }

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.module-card').forEach(card => {
        card.addEventListener('click', () => {
            const moduleId = card.dataset.module;
            openModule(moduleId);
        });
    });
}

async function openModule(moduleId) {
    const module = modules[moduleId];
    if (!module) {
        console.error(`Module not found: ${moduleId}`);
        return;
    }

    if (module.openConfig) {
        await module.openConfig();
    }
}

// =============================================================
// Event Listeners
// =============================================================

// Refresh button
document.getElementById('btn-refresh').addEventListener('click', async () => {
    toast.info('Refreshing...');

    try {
        const guilds = await api.getGuilds();
        state.set('guilds', guilds);
        renderServerList(guilds);

        // Refresh current server if selected
        const guildId = state.get('selectedGuildId');
        if (guildId) {
            await selectServer(guildId);
        }

        toast.success('Refreshed!');
    } catch (error) {
        toast.error('Refresh failed');
    }
});

// Handle beforeunload for unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (state.get('unsavedChanges')) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// =============================================================
// Start
// =============================================================

init();
