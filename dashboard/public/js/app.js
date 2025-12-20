/**
 * CheapShot Dashboard - Main Application Controller
 * Orchestrates all modules and components
 */

import { api } from './api.js';
import { state } from './state.js';
import { panel } from './components/panel.js';
import { toast } from './components/toast.js';

// Module registry - only active, working modules
const modules = {
    ai: { title: 'AI Chat', icon: '🤖', description: 'Configure AI responses and channels' },
    moderation: { title: 'Moderation', icon: '🛡️', description: 'Auto-mod, warnings, and logging' },
    settings: { title: 'Settings', icon: '⚙️', description: 'General bot settings' }
};

class App {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize the dashboard
     */
    async init() {
        if (this.initialized) return;

        try {
            // Initialize components
            panel.init();
            toast.init();

            // Load initial data
            state.setLoading('global', true);

            const [user, guildsData] = await Promise.all([
                api.getUser(),
                api.getGuilds()
            ]);

            const guilds = guildsData.guilds || guildsData || [];

            state.set({
                user,
                guilds,
                selectedGuild: guilds.length > 0 ? guilds[0] : null
            });

            // Render initial UI
            this.renderUserInfo();
            this.renderServerList();

            // If we have a selected guild, load its data
            if (state.getKey('selectedGuild')) {
                await this.loadGuildData(state.getKey('selectedGuild').id);
            }

            // Setup event listeners
            this.setupEventListeners();

            // Render module grid
            this.renderModuleGrid();

            this.initialized = true;
            state.setLoading('global', false);

        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            toast.error('Failed to load dashboard. Please refresh the page.');
            state.setLoading('global', false);
        }
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Server selector dropdown
        const serverBtn = document.getElementById('server-btn');
        const serverDropdown = document.getElementById('server-dropdown');

        if (serverBtn && serverDropdown) {
            serverBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                serverDropdown.classList.toggle('active');
                serverBtn.setAttribute('aria-expanded', serverDropdown.classList.contains('active'));
            });

            document.addEventListener('click', () => {
                serverDropdown.classList.remove('active');
                serverBtn.setAttribute('aria-expanded', 'false');
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => api.logout());
        }

        // Sync button
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.syncChannels());
        }

        // Mobile menu toggle
        const menuToggle = document.getElementById('menu-toggle');
        const sidebar = document.querySelector('.sidebar');
        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });
        }

        // Navigation items
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                this.setActiveNav(view);
                state.set({ currentView: view });

                if (view === 'overview') {
                    this.renderModuleGrid();
                } else {
                    // Open the module panel
                    this.openModulePanel(view);
                }
            });
        });
    }

    /**
     * Sync channels for current guild
     */
    async syncChannels() {
        const guild = state.getKey('selectedGuild');
        if (!guild) {
            toast.warning('Please select a server first');
            return;
        }

        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.textContent = '🔄 Syncing...';
        }

        try {
            const result = await api.syncChannels(guild.id);
            if (result.setupComplete) {
                toast.success(result.message);
            } else {
                toast.info(result.message);
            }
            // Reload guild data
            await this.loadGuildData(guild.id);
        } catch (error) {
            toast.error('Failed to sync channels');
        } finally {
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.textContent = '🔄 Sync Channels';
            }
        }
    }

    /**
     * Render user info in sidebar
     */
    renderUserInfo() {
        const user = state.getKey('user');
        if (!user) return;

        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');

        if (userAvatar) {
            if (user.avatar) {
                userAvatar.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=64" alt="">`;
            } else {
                userAvatar.textContent = user.username.charAt(0).toUpperCase();
            }
        }

        if (userName) {
            userName.textContent = user.global_name || user.username;
        }
    }

    /**
     * Render server list in dropdown
     */
    renderServerList() {
        const guilds = state.getKey('guilds');
        const selectedGuild = state.getKey('selectedGuild');

        // Update selected server display
        this.updateSelectedServer();

        // Render dropdown items
        const dropdown = document.getElementById('server-dropdown');
        if (!dropdown) return;

        if (!guilds || guilds.length === 0) {
            dropdown.innerHTML = `
                <div class="p-md text-muted text-center">
                    No servers found
                </div>
            `;
            return;
        }

        dropdown.innerHTML = guilds.map(guild => `
            <div class="server-dropdown-item ${selectedGuild?.id === guild.id ? 'active' : ''}" 
                 data-guild-id="${guild.id}">
                <div class="server-avatar">
                    ${guild.iconUrl
                ? `<img src="${guild.iconUrl}" alt="">`
                : guild.name.charAt(0).toUpperCase()
            }
                </div>
                <div class="server-info">
                    <div class="server-name">${guild.name}</div>
                    <div class="server-status">
                        ${guild.botPresent
                ? (guild.setupComplete ? '✓ Ready' : '⚠ Needs setup')
                : '+ Add bot'
            }
                    </div>
                </div>
            </div>
        `).join('');

        // Add click handlers
        dropdown.querySelectorAll('.server-dropdown-item').forEach(item => {
            item.addEventListener('click', async () => {
                const guildId = item.dataset.guildId;
                const guild = guilds.find(g => g.id === guildId);

                if (guild) {
                    state.set({ selectedGuild: guild });
                    this.updateSelectedServer();
                    this.renderServerList();
                    await this.loadGuildData(guildId);

                    // Close dropdown
                    dropdown.classList.remove('active');
                }
            });
        });
    }

    /**
     * Update the selected server display button
     */
    updateSelectedServer() {
        const guild = state.getKey('selectedGuild');
        const serverAvatar = document.getElementById('server-avatar');
        const serverName = document.getElementById('server-name');
        const serverStatus = document.getElementById('server-status');

        if (!guild) {
            if (serverName) serverName.textContent = 'Select a server';
            if (serverStatus) serverStatus.textContent = '';
            return;
        }

        if (serverAvatar) {
            if (guild.iconUrl) {
                serverAvatar.innerHTML = `<img src="${guild.iconUrl}" alt="">`;
            } else {
                serverAvatar.textContent = guild.name.charAt(0).toUpperCase();
            }
        }

        if (serverName) {
            serverName.textContent = guild.name;
        }

        if (serverStatus) {
            serverStatus.textContent = guild.botPresent
                ? (guild.setupComplete ? 'Configured' : 'Needs setup')
                : 'Bot not added';
        }
    }

    /**
     * Load guild-specific data
     */
    async loadGuildData(guildId) {
        state.setLoading('guildData', true);

        try {
            // Get guild status
            let guildStatus;
            try {
                guildStatus = await api.getGuildStatus(guildId);
            } catch (e) {
                guildStatus = { botPresent: false };
            }

            // Get settings to check which modules are enabled
            let settings = {};
            try {
                settings = await api.getSettings(guildId);
            } catch (e) {
                console.warn('Could not load settings:', e);
            }

            // Store in cache
            const guildData = state.getKey('guildData');
            guildData[guildId] = {
                ...guildStatus,
                settings,
                timestamp: Date.now()
            };
            state.set({ guildData });

            // Update stats
            this.updateStats(guildStatus, settings);

            // Update UI based on status
            this.renderModuleGrid();

        } catch (error) {
            console.error('Failed to load guild data:', error);
            toast.error('Failed to load server data');
        } finally {
            state.setLoading('guildData', false);
        }
    }

    /**
     * Update stats display
     */
    updateStats(guildStatus, settings) {
        // Count active modules
        const modules = settings?.modules || {};
        const activeCount = Object.values(modules).filter(m => m?.enabled).length;

        document.getElementById('stat-modules').textContent = activeCount;
        document.getElementById('stat-channels').textContent = guildStatus.channelCount || 0;

        // Members and roles require additional API calls - show dash if not available
        document.getElementById('stat-members').textContent = '-';
        document.getElementById('stat-roles').textContent = '-';
    }

    /**
     * Render the module grid on the overview page
     */
    renderModuleGrid() {
        const container = document.getElementById('module-grid');
        if (!container) return;

        const guild = state.getKey('selectedGuild');
        const guildData = state.getKey('guildData');
        const currentData = guildData[guild?.id] || {};
        const settings = currentData.settings || {};
        const moduleSettings = settings.modules || {};

        if (!guild) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">👈</div>
                    <h3 class="empty-state-title">Select a Server</h3>
                    <p class="empty-state-text">Choose a server from the dropdown to configure your bot.</p>
                </div>
            `;
            return;
        }

        if (!guild.botPresent) {
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=1447587559604486417&permissions=8&scope=bot%20applications.commands&guild_id=${guild.id}`;
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">🤖</div>
                    <h3 class="empty-state-title">Add CheapShot to ${guild.name}</h3>
                    <p class="empty-state-text">The bot isn't in this server yet. Add it to start configuring.</p>
                    <a href="${inviteUrl}" target="_blank" class="btn btn-primary mt-lg">
                        ➕ Add Bot to Server
                    </a>
                </div>
            `;
            return;
        }

        // Render module cards
        container.innerHTML = Object.entries(modules).map(([key, module]) => {
            const isEnabled = moduleSettings[key]?.enabled || false;
            return `
                <div class="module-card ${isEnabled ? 'active' : ''}" data-module="${key}">
                    <div class="module-header">
                        <div class="module-icon">${module.icon}</div>
                        <label class="toggle" onclick="event.stopPropagation()">
                            <input type="checkbox" class="toggle-input" data-module-toggle="${key}"
                                   ${isEnabled ? 'checked' : ''}>
                            <span class="toggle-track">
                                <span class="toggle-thumb"></span>
                            </span>
                        </label>
                    </div>
                    <h3 class="module-title">${module.title}</h3>
                    <p class="module-desc">${module.description}</p>
                    <div class="module-status">
                        <span class="module-status-dot ${isEnabled ? 'active' : ''}"></span>
                        <span>${isEnabled ? 'Enabled' : 'Disabled'} · Click to configure</span>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers for cards
        container.querySelectorAll('.module-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't open panel if clicking the toggle
                if (e.target.closest('.toggle')) return;

                const moduleName = card.dataset.module;
                this.openModulePanel(moduleName);
            });
        });

        // Toggle handlers
        container.querySelectorAll('[data-module-toggle]').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                e.stopPropagation();
                const moduleName = e.target.dataset.moduleToggle;
                const enabled = e.target.checked;
                this.toggleModule(moduleName, enabled);
            });
        });
    }

    /**
     * Open the configuration panel for a module
     */
    async openModulePanel(moduleName) {
        const module = modules[moduleName];
        const guild = state.getKey('selectedGuild');

        if (!module || !guild) return;

        await panel.openModule(moduleName, {
            title: module.title,
            icon: module.icon,
            guildId: guild.id,
            wide: ['moderation'].includes(moduleName)
        });
    }

    /**
     * Toggle a module on/off
     */
    async toggleModule(moduleName, enabled) {
        const guild = state.getKey('selectedGuild');
        if (!guild) return;

        try {
            // Get current settings
            const settings = await api.getSettings(guild.id);
            const moduleSettings = settings?.modules || {};

            // Update the specific module
            moduleSettings[moduleName] = {
                ...(moduleSettings[moduleName] || {}),
                enabled
            };

            // Save back
            await api.updateSettings(guild.id, { modules: moduleSettings });

            toast.success(`${modules[moduleName].title} ${enabled ? 'enabled' : 'disabled'}`);

            // Update local state
            const guildData = state.getKey('guildData');
            if (guildData[guild.id]) {
                guildData[guild.id].settings = {
                    ...guildData[guild.id].settings,
                    modules: moduleSettings
                };
                state.set({ guildData });
            }

            // Update visual state
            const card = document.querySelector(`[data-module="${moduleName}"]`);
            if (card) {
                card.classList.toggle('active', enabled);
                const statusDot = card.querySelector('.module-status-dot');
                const statusText = card.querySelector('.module-status span:last-child');
                if (statusDot) statusDot.classList.toggle('active', enabled);
                if (statusText) statusText.textContent = `${enabled ? 'Enabled' : 'Disabled'} · Click to configure`;
            }
        } catch (error) {
            console.error(`Failed to toggle ${moduleName}:`, error);
            toast.error(`Failed to ${enabled ? 'enable' : 'disable'} module`);

            // Revert toggle
            const toggle = document.querySelector(`[data-module-toggle="${moduleName}"]`);
            if (toggle) toggle.checked = !enabled;
        }
    }

    /**
     * Set active navigation item
     */
    setActiveNav(view) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });
    }
}

// Initialize app when DOM is ready
const app = new App();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

// Export for debugging
window.app = app;
window.state = state;
window.api = api;
