/**
 * CheapShot Dashboard - API Client
 * Handles all API communication
 */

const API_BASE = '/api';

/**
 * Make an API request with authentication
 */
async function request(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    // Handle auth errors
    if (response.status === 401) {
        window.location.href = '/';
        throw new Error('Unauthorized');
    }

    // Parse response
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'API request failed');
    }

    return data;
}

/**
 * API Methods
 */
export const api = {
    // Auth
    async getUser() {
        const data = await request('/auth/user');
        return data.user;
    },

    async logout() {
        await request('/auth/logout', { method: 'POST' });
        window.location.href = '/';
    },

    // Guilds
    async getGuilds() {
        const data = await request('/guilds');
        return data.guilds;
    },

    async getGuild(guildId) {
        return await request(`/guilds/${guildId}`);
    },

    async getGuildStatus(guildId) {
        return await request(`/guilds/${guildId}/status`);
    },

    async getGuildChannels(guildId) {
        const data = await request(`/guilds/${guildId}/channels`);
        return data.channels;
    },

    async getGuildRoles(guildId) {
        const data = await request(`/guilds/${guildId}/roles`);
        return data.roles;
    },

    // Channel Config (for AI module)
    async syncChannels(guildId) {
        return await request(`/guilds/${guildId}/sync`, { method: 'POST' });
    },

    async getChannelConfig(guildId) {
        const data = await request(`/guilds/${guildId}/channels/config`);
        return data.channels;
    },

    async saveChannelConfig(guildId, channels) {
        return await request(`/guilds/${guildId}/channels/config`, {
            method: 'PUT',
            body: JSON.stringify({ channels })
        });
    },

    // Guild Settings (generic)
    async getSettings(guildId) {
        const data = await request(`/guilds/${guildId}/settings`);
        return data.settings;
    },

    async saveSettings(guildId, settings) {
        return await request(`/guilds/${guildId}/settings`, {
            method: 'PUT',
            body: JSON.stringify({ settings })
        });
    },

    // Module-specific settings
    async getModuleSettings(guildId, moduleName) {
        const settings = await this.getSettings(guildId);
        return settings?.modules?.[moduleName] || null;
    },

    async saveModuleSettings(guildId, moduleName, moduleSettings) {
        const settings = await this.getSettings(guildId) || {};
        const modules = settings.modules || {};
        modules[moduleName] = { ...modules[moduleName], ...moduleSettings };
        return await this.saveSettings(guildId, { ...settings, modules });
    },

    // Bot Appearance
    async setBotNickname(guildId, nickname) {
        return await request(`/guilds/${guildId}/bot/nickname`, {
            method: 'PUT',
            body: JSON.stringify({ nickname })
        });
    }
};

export default api;
