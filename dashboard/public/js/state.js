/**
 * CheapShot Dashboard - State Management
 * Central state store with event-based updates
 */

class StateManager {
    constructor() {
        this.state = {
            user: null,
            guilds: [],
            selectedGuildId: null,
            selectedGuild: null,
            channels: [],
            roles: [],
            moduleSettings: {},
            panelOpen: false,
            activeModule: null,
            loading: {
                guilds: false,
                guild: false,
                module: false
            },
            unsavedChanges: false
        };

        this.listeners = new Map();
    }

    /**
     * Get current state
     */
    get(key) {
        if (key) {
            return key.split('.').reduce((obj, k) => obj?.[k], this.state);
        }
        return this.state;
    }

    /**
     * Update state and notify listeners
     */
    set(key, value) {
        const keys = key.split('.');
        let obj = this.state;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) obj[keys[i]] = {};
            obj = obj[keys[i]];
        }

        const lastKey = keys[keys.length - 1];
        const oldValue = obj[lastKey];
        obj[lastKey] = value;

        // Notify listeners
        this.emit(key, value, oldValue);
    }

    /**
     * Subscribe to state changes
     */
    on(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);

        // Return unsubscribe function
        return () => this.listeners.get(key).delete(callback);
    }

    /**
     * Emit state change event
     */
    emit(key, value, oldValue) {
        // Notify exact key listeners
        if (this.listeners.has(key)) {
            this.listeners.get(key).forEach(cb => cb(value, oldValue));
        }

        // Notify wildcard listeners
        if (this.listeners.has('*')) {
            this.listeners.get('*').forEach(cb => cb(key, value, oldValue));
        }

        // Notify parent path listeners (e.g., 'loading' when 'loading.guilds' changes)
        const parts = key.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentKey = parts.slice(0, i).join('.');
            if (this.listeners.has(parentKey)) {
                this.listeners.get(parentKey).forEach(cb => cb(this.get(parentKey)));
            }
        }
    }

    /**
     * Reset state to defaults
     */
    reset() {
        this.state = {
            user: null,
            guilds: [],
            selectedGuildId: null,
            selectedGuild: null,
            channels: [],
            roles: [],
            moduleSettings: {},
            panelOpen: false,
            activeModule: null,
            loading: {
                guilds: false,
                guild: false,
                module: false
            },
            unsavedChanges: false
        };
        this.emit('reset', this.state);
    }
}

// Singleton instance
export const state = new StateManager();
export default state;
