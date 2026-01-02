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
    context: { title: 'Context Storage', icon: '💭', description: 'Save conversation memory to database (persists across restarts)', isView: true, defaultEnabled: true },
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
                    this.restoreOverviewPage();
                } else if (view === 'context') {
                    // Context is a special full-page view
                    this.openContextView();
                } else {
                    // Open the module panel
                    this.openModulePanel(view);
                }
            });
        });
    }

    /**
     * Restore the overview page (after leaving context view)
     */
    restoreOverviewPage() {
        const guild = state.getKey('selectedGuild');

        // Restore page header
        const pageTitle = document.querySelector('.page-title');
        const pageSubtitle = document.querySelector('.page-subtitle');
        if (pageTitle) pageTitle.textContent = 'Dashboard';
        if (pageSubtitle) pageSubtitle.textContent = 'Configure your CheapShot bot';

        // Show sync button
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) syncBtn.style.display = '';

        // Restore page body with stats and modules
        const pageBody = document.querySelector('.page-body');
        if (pageBody) {
            pageBody.innerHTML = `
                <!-- Stats Row -->
                <div class="content-section">
                    <div class="content-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                        <div class="stat-card">
                            <div class="stat-icon">👥</div>
                            <div class="stat-content">
                                <div class="stat-value" id="stat-members">-</div>
                                <div class="stat-label">Members</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">💬</div>
                            <div class="stat-content">
                                <div class="stat-value" id="stat-channels">-</div>
                                <div class="stat-label">Channels</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🎭</div>
                            <div class="stat-content">
                                <div class="stat-value" id="stat-roles">-</div>
                                <div class="stat-label">Roles</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">⚡</div>
                            <div class="stat-content">
                                <div class="stat-value" id="stat-modules">0</div>
                                <div class="stat-label">Active Modules</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Modules Section -->
                <div class="content-section">
                    <div class="section-header">
                        <h2 class="section-title">Modules</h2>
                    </div>
                    <div class="content-grid" id="module-grid">
                        <!-- Populated by JS -->
                        <div class="empty-state" style="grid-column: 1 / -1;">
                            <div class="spinner spinner-lg"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Re-render stats and modules
        if (guild) {
            this.updateStats(guild.id);
            this.setupStatCardHandlers(guild.id);
        }
        this.renderModuleGrid();
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

            // Get detailed guild info (for member count)
            let guildInfo = {};
            try {
                guildInfo = await api.getGuildInfo(guildId);
            } catch (e) {
                console.warn('Could not load guild info:', e);
            }

            // Get roles for this guild
            let roles = [];
            try {
                roles = await api.getRoles(guildId);
            } catch (e) {
                console.warn('Could not load roles:', e);
            }

            // Get channels for this guild (for channel count)
            let channels = [];
            try {
                const channelsResult = await api.getChannels(guildId);
                channels = channelsResult || [];
                console.log('[App] Loaded channels:', channels.length, 'channels for guild', guildId);
            } catch (e) {
                console.warn('Could not load channels:', e);
            }

            // Store in cache
            const guildData = state.getKey('guildData');
            guildData[guildId] = {
                ...guildStatus,
                ...guildInfo,
                roles,
                channels,
                channelCount: Array.isArray(channels) ? channels.length : 0,
                settings,
                timestamp: Date.now()
            };
            state.set({ guildData });

            // Check which view we're on and update accordingly
            const currentView = state.getKey('currentView');

            if (currentView === 'context') {
                // Refresh the context page for the new guild
                await this.renderContextPage(guildId);
            } else {
                // Update overview stats and module grid
                this.updateStats(guildId);
                this.setupStatCardHandlers(guildId);
                this.renderModuleGrid();
            }

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
    updateStats(guildId) {
        const guildData = state.getKey('guildData');
        const currentData = guildData[guildId] || {};
        const settings = currentData.settings || {};
        const roles = currentData.roles || [];
        const channels = currentData.channels || [];

        // Count active modules
        const moduleSettings = settings?.modules || {};
        const activeCount = Object.values(moduleSettings).filter(m => m?.enabled).length;

        // Use channels array length for actual server channel count
        const channelCount = Array.isArray(channels) ? channels.length : (currentData.channelCount || 0);

        // Guard against missing elements (e.g., when on context page)
        const statModules = document.getElementById('stat-modules');
        const statChannels = document.getElementById('stat-channels');
        const statMembers = document.getElementById('stat-members');
        const statRoles = document.getElementById('stat-roles');

        if (statModules) statModules.textContent = activeCount;
        if (statChannels) statChannels.textContent = channelCount;
        if (statMembers) statMembers.textContent = currentData.memberCount || '-';
        if (statRoles) statRoles.textContent = roles.length || '-';
    }

    /**
     * Setup click handlers for stat cards
     */
    setupStatCardHandlers(guildId) {
        // Guard: Only run if stat elements exist (overview page)
        const statMembers = document.getElementById('stat-members');
        if (!statMembers) return;

        // Members stat card
        const membersCard = statMembers.closest('.stat-card');
        if (membersCard) {
            membersCard.style.cursor = 'pointer';
            membersCard.onclick = () => this.openMembersPanel(guildId);
        }

        // Channels stat card
        const channelsCard = document.getElementById('stat-channels')?.closest('.stat-card');
        if (channelsCard) {
            channelsCard.style.cursor = 'pointer';
            channelsCard.onclick = () => this.openChannelsPanel(guildId);
        }

        // Roles stat card
        const rolesCard = document.getElementById('stat-roles')?.closest('.stat-card');
        if (rolesCard) {
            rolesCard.style.cursor = 'pointer';
            rolesCard.onclick = () => this.openRolesPanel(guildId);
        }
    }

    /**
     * Open the members panel
     */
    async openMembersPanel(guildId) {
        await panel.open({
            title: 'Server Members',
            icon: '👥',
            content: `
                <div class="flex items-center justify-center p-xl">
                    <div class="spinner"></div>
                </div>
            `,
            wide: true
        });

        try {
            const members = await api.getMembers(guildId, 100);
            const guildData = state.getKey('guildData');
            const roles = guildData[guildId]?.roles || [];
            const roleMap = new Map(roles.map(r => [r.id, r]));

            const content = `
                <div class="members-list">
                    <div class="list-header">
                        <span>Showing ${members.length} members</span>
                    </div>
                    <div class="list-items">
                        ${members.map(member => {
                const memberRoles = member.roles
                    .map(rid => roleMap.get(rid))
                    .filter(Boolean)
                    .sort((a, b) => b.position - a.position)
                    .slice(0, 3);

                return `
                                <div class="list-item">
                                    <div class="list-item-avatar">
                                        ${member.avatarUrl
                        ? `<img src="${member.avatarUrl}" alt="">`
                        : `<span>${(member.globalName || member.username).charAt(0).toUpperCase()}</span>`
                    }
                                    </div>
                                    <div class="list-item-info">
                                        <div class="list-item-name">
                                            ${member.nick || member.globalName || member.username}
                                            ${member.bot ? '<span class="badge badge-bot">BOT</span>' : ''}
                                        </div>
                                        <div class="list-item-meta">
                                            ${member.username}
                                            ${memberRoles.length > 0
                        ? ` · ${memberRoles.map(r => `<span class="role-tag" style="border-color: ${r.color > 0 ? '#' + r.color.toString(16).padStart(6, '0') : '#666'}">${r.name}</span>`).join(' ')}`
                        : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
            }).join('')}
                    </div>
                </div>
            `;

            panel.setContent(content);
        } catch (error) {
            console.error('Failed to load members:', error);
            panel.setContent(`
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <h3 class="empty-state-title">Failed to load members</h3>
                    <p class="empty-state-text">Could not fetch the member list.</p>
                </div>
            `);
        }
    }

    /**
     * Open the roles panel
     */
    async openRolesPanel(guildId) {
        const guildData = state.getKey('guildData');
        const roles = guildData[guildId]?.roles || [];

        const content = `
            <div class="roles-list">
                <div class="list-header">
                    <span>${roles.length} roles</span>
                </div>
                <div class="list-items">
                    ${roles.map(role => {
            const colorHex = role.color > 0 ? '#' + role.color.toString(16).padStart(6, '0') : '#99aab5';
            return `
                            <div class="list-item">
                                <div class="role-color" style="background-color: ${colorHex}"></div>
                                <div class="list-item-info">
                                    <div class="list-item-name" style="color: ${colorHex}">
                                        ${role.name}
                                        ${role.managed ? '<span class="badge badge-managed">Managed</span>' : ''}
                                    </div>
                                    <div class="list-item-meta">
                                        Position: ${role.position}
                                        ${role.hoist ? ' · Hoisted' : ''}
                                        ${role.mentionable ? ' · Mentionable' : ''}
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;

        await panel.open({
            title: 'Server Roles',
            icon: '🎭',
            content,
            wide: true
        });
    }

    /**
     * Open the channels panel
     */
    async openChannelsPanel(guildId) {
        await panel.open({
            title: 'Server Channels',
            icon: '💬',
            content: `
                <div class="flex items-center justify-center p-xl">
                    <div class="spinner"></div>
                </div>
            `,
            wide: true
        });

        try {
            const channelsData = await api.getChannels(guildId);
            const channels = channelsData.channels || channelsData || [];

            // Group channels by category
            const categories = new Map();
            const noCategory = [];

            // First pass: collect categories
            channels.forEach(ch => {
                if (ch.type === 4) { // Category type
                    categories.set(ch.id, { ...ch, children: [] });
                }
            });

            // Second pass: assign channels to categories
            channels.forEach(ch => {
                if (ch.type === 4) return; // Skip categories
                if (ch.parentId && categories.has(ch.parentId)) {
                    categories.get(ch.parentId).children.push(ch);
                } else {
                    noCategory.push(ch);
                }
            });

            // Sort channels by position
            categories.forEach(cat => {
                cat.children.sort((a, b) => a.position - b.position);
            });
            noCategory.sort((a, b) => a.position - b.position);

            // Channel type icons
            const getChannelIcon = (type) => {
                switch (type) {
                    case 0: return '#';  // Text
                    case 2: return '🔊'; // Voice
                    case 5: return '📢'; // Announcement
                    case 10:
                    case 11:
                    case 12: return '🧵'; // Thread
                    case 13: return '🎭'; // Stage
                    case 15: return '💬'; // Forum
                    default: return '#';
                }
            };

            const getChannelTypeName = (type) => {
                switch (type) {
                    case 0: return 'Text';
                    case 2: return 'Voice';
                    case 5: return 'Announcement';
                    case 10:
                    case 11:
                    case 12: return 'Thread';
                    case 13: return 'Stage';
                    case 15: return 'Forum';
                    default: return 'Channel';
                }
            };

            const renderChannel = (ch) => `
                <div class="list-item">
                    <div class="list-item-avatar" style="background: var(--steel); font-size: 1rem;">
                        ${getChannelIcon(ch.type)}
                    </div>
                    <div class="list-item-info">
                        <div class="list-item-name">${ch.name}</div>
                        <div class="list-item-meta">${getChannelTypeName(ch.type)}</div>
                    </div>
                </div>
            `;

            let html = `<div class="channels-list">
                <div class="list-header">
                    <span>${channels.length} channels</span>
                </div>
                <div class="list-items">`;

            // Render uncategorized channels first
            if (noCategory.length > 0) {
                html += noCategory.map(renderChannel).join('');
            }

            // Render categorized channels
            const sortedCategories = [...categories.values()].sort((a, b) => a.position - b.position);
            for (const cat of sortedCategories) {
                if (cat.children.length > 0) {
                    html += `
                        <div class="list-item" style="background: var(--steel); margin-top: var(--space-md);">
                            <div class="list-item-info">
                                <div class="list-item-name" style="text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; color: var(--silver);">
                                    📁 ${cat.name}
                                </div>
                            </div>
                        </div>
                    `;
                    html += cat.children.map(renderChannel).join('');
                }
            }

            html += '</div></div>';
            panel.setContent(html);

        } catch (error) {
            console.error('Failed to load channels:', error);
            panel.setContent(`
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <h3 class="empty-state-title">Failed to load channels</h3>
                    <p class="empty-state-text">Could not fetch the channel list.</p>
                </div>
            `);
        }
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
            // Use defaultEnabled if module setting doesn't exist
            const isEnabled = moduleSettings[key]?.enabled ?? module.defaultEnabled ?? false;

            // Special status text for context module
            let statusText;
            if (key === 'context') {
                statusText = isEnabled
                    ? 'Saving to database · Click to view'
                    : 'Memory only (clears on restart) · Click to view';
            } else {
                statusText = `${isEnabled ? 'Enabled' : 'Disabled'} · Click to configure`;
            }

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
                        <span>${statusText}</span>
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

                // Context module opens the context view instead of a panel
                if (moduleName === 'context') {
                    this.setActiveNav('context');
                    state.set({ currentView: 'context' });
                    this.openContextView();
                } else {
                    this.openModulePanel(moduleName);
                }
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

            // Update stats (active modules count)
            this.updateStats(guild.id);

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
     * Open the context view (replaces main content)
     */
    async openContextView() {
        const guild = state.getKey('selectedGuild');
        if (!guild) {
            toast.warning('Please select a server first');
            return;
        }

        // Update page header
        const pageTitle = document.querySelector('.page-title');
        const pageSubtitle = document.querySelector('.page-subtitle');
        if (pageTitle) pageTitle.textContent = 'Conversation Context';
        if (pageSubtitle) pageSubtitle.textContent = 'View and manage AI conversation memory for users';

        // Hide sync button for this view
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) syncBtn.style.display = 'none';

        // Initialize context state
        state.set({
            contextOffset: 0,
            contextLoading: false,
            contextHasMore: true,
            contextSelectedUsers: [],
            contextData: []
        });

        // Render initial view
        await this.renderContextPage(guild.id);
    }

    /**
     * Render the context page content
     */
    async renderContextPage(guildId) {
        const pageBody = document.querySelector('.page-body');
        if (!pageBody) return;

        // Update header (in case we're switching servers while on context page)
        const pageTitle = document.querySelector('.page-title');
        const pageSubtitle = document.querySelector('.page-subtitle');
        if (pageTitle) pageTitle.textContent = 'Conversation Context';
        if (pageSubtitle) pageSubtitle.textContent = 'View and manage AI conversation memory for users';

        // Hide sync button for this view
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) syncBtn.style.display = 'none';

        // Show loading state
        pageBody.innerHTML = `
            <div class="content-section">
                <div class="flex items-center justify-center p-xl">
                    <div class="spinner spinner-lg"></div>
                </div>
            </div>
        `;

        try {
            // Load stats and users in parallel
            const [stats, usersData] = await Promise.all([
                api.getContextStats(guildId),
                api.getContextUsers(guildId)
            ]);

            const users = usersData.users || [];

            // Render the context page
            pageBody.innerHTML = `
                <!-- Stats Row -->
                <div class="content-section">
                    <div class="content-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
                        <div class="stat-card">
                            <div class="stat-icon">💭</div>
                            <div class="stat-content">
                                <div class="stat-value">${stats.totalContexts}</div>
                                <div class="stat-label">Conversations</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">👥</div>
                            <div class="stat-content">
                                <div class="stat-value">${stats.uniqueUsers}</div>
                                <div class="stat-label">Users</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">💬</div>
                            <div class="stat-content">
                                <div class="stat-value">${stats.totalMessages}</div>
                                <div class="stat-label">Messages</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📊</div>
                            <div class="stat-content">
                                <div class="stat-value">${Math.round(stats.totalTokens / 1000)}k</div>
                                <div class="stat-label">Tokens</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Filter Section -->
                <div class="content-section">
                    <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-md);">
                        <h2 class="section-title">Conversations</h2>
                        <div class="context-filters" style="display: flex; gap: var(--space-md); align-items: center; flex-wrap: wrap;">
                            <div class="user-filter-container" style="position: relative;">
                                <button class="btn btn-secondary" id="user-filter-btn">
                                    <span id="user-filter-label">👤 Filter by User</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 8px;">
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                </button>
                                <div class="user-filter-dropdown" id="user-filter-dropdown">
                                    <div class="user-filter-search">
                                        <input type="text" placeholder="Search users..." id="user-search-input" class="input">
                                    </div>
                                    <div class="user-filter-list" id="user-filter-list">
                                        ${users.map(user => `
                                            <label class="user-filter-item" data-user-id="${user.userId}">
                                                <input type="checkbox" class="user-filter-checkbox" value="${user.userId}">
                                                <div class="user-filter-avatar">
                                                    ${user.avatarUrl
                    ? `<img src="${user.avatarUrl}" alt="">`
                    : `<span>${(user.username || '?').charAt(0).toUpperCase()}</span>`}
                                                </div>
                                                <div class="user-filter-info">
                                                    <div class="user-filter-name">${user.globalName || user.username}</div>
                                                    <div class="user-filter-meta">${user.channelCount} channel(s)</div>
                                                </div>
                                            </label>
                                        `).join('')}
                                        ${users.length === 0 ? '<div class="text-muted p-md">No users with context</div>' : ''}
                                    </div>
                                    <div class="user-filter-actions">
                                        <button class="btn btn-sm btn-secondary" id="clear-user-filter">Clear</button>
                                        <button class="btn btn-sm btn-primary" id="apply-user-filter">Apply</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Context List -->
                    <div class="context-list" id="context-list">
                        <div class="flex items-center justify-center p-xl">
                            <div class="spinner"></div>
                        </div>
                    </div>
                    
                    <!-- Load More -->
                    <div class="context-load-more" id="context-load-more" style="display: none;">
                        <button class="btn btn-secondary" id="load-more-btn">Load More</button>
                    </div>
                </div>
            `;

            // Setup user filter dropdown
            this.setupContextFilters(guildId, users);

            // Load initial contexts
            await this.loadMoreContexts(guildId, true);

        } catch (error) {
            console.error('Failed to load context page:', error);
            pageBody.innerHTML = `
                <div class="content-section">
                    <div class="empty-state">
                        <div class="empty-state-icon">❌</div>
                        <h3 class="empty-state-title">Failed to load context</h3>
                        <p class="empty-state-text">${error.message}</p>
                        <button class="btn btn-primary mt-lg" onclick="app.openContextView()">Retry</button>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Setup context filter event handlers
     */
    setupContextFilters(guildId, users) {
        const filterBtn = document.getElementById('user-filter-btn');
        const dropdown = document.getElementById('user-filter-dropdown');
        const searchInput = document.getElementById('user-search-input');
        const clearBtn = document.getElementById('clear-user-filter');
        const applyBtn = document.getElementById('apply-user-filter');
        const filterList = document.getElementById('user-filter-list');

        // Toggle dropdown
        if (filterBtn && dropdown) {
            filterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('active');
            });

            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target) && !filterBtn.contains(e.target)) {
                    dropdown.classList.remove('active');
                }
            });
        }

        // Search filter
        if (searchInput && filterList) {
            searchInput.addEventListener('input', (e) => {
                const search = e.target.value.toLowerCase();
                filterList.querySelectorAll('.user-filter-item').forEach(item => {
                    const name = item.querySelector('.user-filter-name')?.textContent.toLowerCase() || '';
                    item.style.display = name.includes(search) ? '' : 'none';
                });
            });
        }

        // Clear filter
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                document.querySelectorAll('.user-filter-checkbox').forEach(cb => cb.checked = false);
                state.set({ contextSelectedUsers: [] });
                document.getElementById('user-filter-label').textContent = '👤 Filter by User';
            });
        }

        // Apply filter
        if (applyBtn) {
            applyBtn.addEventListener('click', async () => {
                const selectedUsers = [];
                document.querySelectorAll('.user-filter-checkbox:checked').forEach(cb => {
                    selectedUsers.push(cb.value);
                });

                state.set({ contextSelectedUsers: selectedUsers });

                // Update label
                const label = document.getElementById('user-filter-label');
                if (selectedUsers.length === 0) {
                    label.textContent = '👤 Filter by User';
                } else if (selectedUsers.length === 1) {
                    const user = users.find(u => u.userId === selectedUsers[0]);
                    label.textContent = `👤 ${user?.username || 'User'}`;
                } else {
                    label.textContent = `👤 ${selectedUsers.length} users`;
                }

                dropdown.classList.remove('active');

                // Reload contexts with filter
                await this.loadMoreContexts(guildId, true);
            });
        }

        // Load more button
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => this.loadMoreContexts(guildId, false));
        }

        // Infinite scroll
        const contextList = document.getElementById('context-list');
        if (contextList) {
            const observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && state.getKey('contextHasMore') && !state.getKey('contextLoading')) {
                    this.loadMoreContexts(guildId, false);
                }
            }, { threshold: 0.1 });

            // Create sentinel element
            const sentinel = document.createElement('div');
            sentinel.id = 'context-sentinel';
            sentinel.style.height = '1px';
            contextList.parentNode.insertBefore(sentinel, document.getElementById('context-load-more'));
            observer.observe(sentinel);
        }
    }

    /**
     * Load more contexts with pagination
     */
    async loadMoreContexts(guildId, reset = false) {
        if (state.getKey('contextLoading')) return;

        state.set({ contextLoading: true });

        const contextList = document.getElementById('context-list');
        const loadMoreContainer = document.getElementById('context-load-more');

        if (reset) {
            state.set({ contextOffset: 0, contextData: [] });
            if (contextList) {
                contextList.innerHTML = `
                    <div class="flex items-center justify-center p-xl">
                        <div class="spinner"></div>
                    </div>
                `;
            }
        }

        try {
            const offset = state.getKey('contextOffset') || 0;
            const selectedUsers = state.getKey('contextSelectedUsers') || [];

            const result = await api.getContexts(guildId, {
                limit: 20,
                offset,
                userIds: selectedUsers.length > 0 ? selectedUsers : null
            });

            const contexts = result.contexts || [];
            const currentData = state.getKey('contextData') || [];
            const newData = reset ? contexts : [...currentData, ...contexts];

            state.set({
                contextData: newData,
                contextOffset: offset + contexts.length,
                contextHasMore: result.pagination?.hasMore || false
            });

            // Render contexts
            if (reset) {
                contextList.innerHTML = '';
            }

            if (newData.length === 0) {
                contextList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">💭</div>
                        <h3 class="empty-state-title">No conversations found</h3>
                        <p class="empty-state-text">No conversation context has been stored yet.</p>
                    </div>
                `;
            } else {
                // Append new contexts
                for (const ctx of contexts) {
                    const contextEl = this.createContextCard(ctx, guildId);
                    contextList.appendChild(contextEl);
                }
            }

            // Update load more button
            if (loadMoreContainer) {
                loadMoreContainer.style.display = result.pagination?.hasMore ? '' : 'none';
            }

        } catch (error) {
            console.error('Failed to load contexts:', error);
            toast.error('Failed to load conversations');
        } finally {
            state.set({ contextLoading: false });
        }
    }

    /**
     * Create a context card element
     */
    createContextCard(ctx, guildId) {
        const card = document.createElement('div');
        card.className = 'context-card';
        card.dataset.channelId = ctx.channelId;
        card.dataset.userId = ctx.userId;

        const messages = ctx.messages || [];
        const timeAgo = this.formatTimeAgo(new Date(ctx.updatedAt));

        card.innerHTML = `
            <div class="context-card-header">
                <div class="context-user">
                    <div class="context-avatar">
                        ${ctx.userAvatarUrl
                ? `<img src="${ctx.userAvatarUrl}" alt="">`
                : `<span>${(ctx.username || '?').charAt(0).toUpperCase()}</span>`}
                    </div>
                    <div class="context-user-info">
                        <div class="context-username">${ctx.username || 'Unknown'}</div>
                        <div class="context-meta">#${ctx.channelName || 'unknown'} · ${ctx.messageCount || 0} messages · ${timeAgo}</div>
                    </div>
                </div>
                <div class="context-actions">
                    <button class="btn btn-sm btn-secondary context-view-btn" title="View full context">
                        👁️ View
                    </button>
                    <button class="btn btn-sm btn-danger context-delete-btn" title="Delete context">
                        🗑️
                    </button>
                </div>
            </div>
            <div class="context-preview">
                ${messages.length > 0 ? messages.slice(-3).map(msg => this.formatContextMessage(msg)).join('') : '<div class="text-muted">No messages</div>'}
            </div>
            <div class="context-footer">
                <span class="context-tokens">~${Math.round((ctx.tokenCount || 0) / 1000)}k tokens</span>
            </div>
        `;

        // Add event handlers
        card.querySelector('.context-view-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openContextDetailPanel(guildId, ctx.channelId, ctx.userId, ctx);
        });

        card.querySelector('.context-delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Delete conversation context for ${ctx.username} in #${ctx.channelName}?`)) {
                await this.deleteContext(guildId, ctx.channelId, ctx.userId);
                card.remove();
            }
        });

        // Click on card opens detail
        card.addEventListener('click', () => {
            this.openContextDetailPanel(guildId, ctx.channelId, ctx.userId, ctx);
        });

        return card;
    }

    /**
     * Format a context message for display
     */
    formatContextMessage(msg) {
        if (!msg) return '';

        const isAssistant = msg.role === 'assistant';
        const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }) : '';

        // Truncate long messages
        let content = msg.content || '';
        if (content.length > 150) {
            content = content.substring(0, 150) + '...';
        }

        // Escape HTML
        content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Build image thumbnails if present
        let imageHtml = '';
        if (msg.images && msg.images.length > 0) {
            imageHtml = `
                <div class="context-message-images">
                    ${msg.images.slice(0, 3).map(img => `
                        <a href="${img.url}" target="_blank" class="context-image-thumb" title="${img.filename || 'Image'}">
                            <img src="${img.url}" alt="${img.filename || 'Image'}" loading="lazy" onerror="this.parentElement.innerHTML='📷'">
                        </a>
                    `).join('')}
                    ${msg.images.length > 3 ? `<span class="context-image-more">+${msg.images.length - 3}</span>` : ''}
                </div>
            `;
        }

        return `
            <div class="context-message ${isAssistant ? 'assistant' : 'user'}">
                <span class="context-message-role">${isAssistant ? '🤖' : '👤'}</span>
                <div class="context-message-body">
                    <span class="context-message-content">${content}</span>
                    ${imageHtml}
                </div>
                <span class="context-message-time">${timestamp}</span>
            </div>
        `;
    }

    /**
     * Format time ago
     */
    formatTimeAgo(date) {
        if (!date || isNaN(date.getTime())) return 'Unknown';

        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 0) return 'just now';
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return date.toLocaleDateString();
    }

    /**
     * Open the context detail panel
     */
    async openContextDetailPanel(guildId, channelId, userId, previewData) {
        await panel.open({
            title: `Conversation with ${previewData.username}`,
            icon: '💭',
            content: `
                <div class="flex items-center justify-center p-xl">
                    <div class="spinner"></div>
                </div>
            `,
            wide: true
        });

        try {
            const detail = await api.getContextDetail(guildId, channelId, userId);
            const messages = detail.messages || [];

            // Helper to render images
            const renderImages = (images) => {
                if (!images || images.length === 0) return '';
                return `
                    <div class="context-detail-message-images">
                        ${images.map(img => `
                            <a href="${img.url}" target="_blank" class="context-detail-image" title="${img.filename || 'Image'}">
                                <img src="${img.url}" alt="${img.filename || 'Image'}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <span class="context-detail-image-fallback" style="display:none;">📷 ${img.filename || 'Image'}</span>
                            </a>
                        `).join('')}
                    </div>
                `;
            };

            const content = `
                <div class="context-detail">
                    <div class="context-detail-header">
                        <div class="context-detail-info">
                            <div><strong>Channel:</strong> #${previewData.channelName || 'unknown'}</div>
                            <div><strong>Messages:</strong> ${messages.length}</div>
                            <div><strong>Tokens:</strong> ~${Math.round((detail.tokenCount || 0) / 1000)}k</div>
                            <div><strong>Last updated:</strong> ${detail.updatedAt ? new Date(detail.updatedAt).toLocaleString() : 'Unknown'}</div>
                        </div>
                        <button class="btn btn-danger" id="delete-context-btn">🗑️ Delete Context</button>
                    </div>
                    <div class="context-detail-messages">
                        ${messages.length > 0 ? messages.map(msg => `
                            <div class="context-detail-message ${msg.role === 'assistant' ? 'assistant' : 'user'}">
                                <div class="context-detail-message-header">
                                    <span class="context-detail-message-role">
                                        ${msg.role === 'assistant' ? '🤖 CheapShot' : `👤 ${msg.username || 'User'}`}
                                    </span>
                                    <span class="context-detail-message-time">
                                        ${msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''}
                                    </span>
                                </div>
                                <div class="context-detail-message-content">${(msg.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
                                ${renderImages(msg.images)}
                            </div>
                        `).join('') : '<div class="text-muted p-lg">No messages in this context</div>'}
                    </div>
                </div>
            `;

            panel.setContent(content);

            // Add delete handler
            document.getElementById('delete-context-btn')?.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this conversation context?')) {
                    await this.deleteContext(guildId, channelId, userId);
                    panel.close();
                    // Remove from list
                    const card = document.querySelector(`.context-card[data-channel-id="${channelId}"][data-user-id="${userId}"]`);
                    if (card) card.remove();
                }
            });

        } catch (error) {
            console.error('Failed to load context detail:', error);
            panel.setContent(`
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <h3 class="empty-state-title">Failed to load context</h3>
                    <p class="empty-state-text">${error.message}</p>
                </div>
            `);
        }
    }

    /**
     * Delete a context
     */
    async deleteContext(guildId, channelId, userId) {
        try {
            await api.deleteContext(guildId, channelId, userId);
            toast.success('Context deleted');
        } catch (error) {
            console.error('Failed to delete context:', error);
            toast.error('Failed to delete context');
            throw error;
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
