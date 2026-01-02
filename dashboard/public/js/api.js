/**
 * CheapShot Dashboard - API Client
 * Handles all API communication
 */

const API_BASE = '/api';

class ApiClient {
    constructor() {
        this.baseUrl = API_BASE;
    }

    /**
     * Make an API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        const config = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        // Don't stringify body if it's FormData
        if (options.body && !(options.body instanceof FormData)) {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);

            // Handle auth errors
            if (response.status === 401) {
                window.location.href = '/';
                throw new Error('Unauthorized');
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Request failed: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    // Auth endpoints
    async getUser() {
        const data = await this.request('/auth/user');
        return data.user;
    }

    async logout() {
        await this.request('/auth/logout', { method: 'POST' });
        window.location.href = '/';
    }

    // Guild endpoints
    async getGuilds() {
        const data = await this.request('/guilds');
        return data.guilds;
    }

    async getGuild(guildId) {
        return await this.request(`/guilds/${guildId}`);
    }

    async getGuildStatus(guildId) {
        return await this.request(`/guilds/${guildId}/status`);
    }

    async getChannels(guildId) {
        const data = await this.request(`/guilds/${guildId}/channels`);
        return data.channels;
    }

    async getRoles(guildId) {
        const data = await this.request(`/guilds/${guildId}/roles`);
        return data.roles;
    }

    async getMembers(guildId, limit = 100) {
        const data = await this.request(`/guilds/${guildId}/members?limit=${limit}`);
        return data.members;
    }

    async getGuildInfo(guildId) {
        return await this.request(`/guilds/${guildId}`);
    }

    async syncChannels(guildId) {
        return await this.request(`/guilds/${guildId}/sync`, { method: 'POST' });
    }

    // Settings endpoints
    async getSettings(guildId) {
        const data = await this.request(`/guilds/${guildId}/settings`);
        return data.settings;
    }

    async updateSettings(guildId, settings) {
        return await this.request(`/guilds/${guildId}/settings`, {
            method: 'PUT',
            body: { settings }
        });
    }

    async getChannelConfig(guildId) {
        const data = await this.request(`/guilds/${guildId}/channels/config`);
        return data.channels;
    }

    async updateChannelConfig(guildId, channels) {
        return await this.request(`/guilds/${guildId}/channels/config`, {
            method: 'PUT',
            body: { channels }
        });
    }

    // Module-specific endpoints (to be extended)
    async getModuleConfig(guildId, moduleName) {
        const settings = await this.getSettings(guildId);
        return settings?.modules?.[moduleName] || null;
    }

    async updateModuleConfig(guildId, moduleName, config) {
        const settings = await this.getSettings(guildId);
        const modules = settings?.modules || {};
        modules[moduleName] = { ...modules[moduleName], ...config };
        return await this.updateSettings(guildId, { modules });
    }

    // Context endpoints
    async getContextUsers(guildId, search = '') {
        const params = search ? `?search=${encodeURIComponent(search)}` : '';
        const data = await this.request(`/guilds/${guildId}/context/users${params}`);
        return data;
    }

    async getContexts(guildId, options = {}) {
        const { limit = 20, offset = 0, userIds = null, channelId = null } = options;
        let params = `?limit=${limit}&offset=${offset}`;
        if (userIds && userIds.length > 0) {
            params += `&userIds=${userIds.join(',')}`;
        }
        if (channelId) {
            params += `&channelId=${channelId}`;
        }
        const data = await this.request(`/guilds/${guildId}/context${params}`);
        return data;
    }

    async getContextStats(guildId) {
        const data = await this.request(`/guilds/${guildId}/context/stats`);
        return data;
    }

    async getContextDetail(guildId, channelId, userId) {
        const data = await this.request(`/guilds/${guildId}/context/${channelId}/${userId}`);
        return data;
    }

    async deleteContext(guildId, channelId, userId) {
        return await this.request(`/guilds/${guildId}/context/${channelId}/${userId}`, {
            method: 'DELETE'
        });
    }

    async deleteUserContext(guildId, userId) {
        return await this.request(`/guilds/${guildId}/context/user/${userId}`, {
            method: 'DELETE'
        });
    }
}

// Export singleton
export const api = new ApiClient();
export default api;

