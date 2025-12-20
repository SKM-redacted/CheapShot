/**
 * CheapShot Dashboard - State Management
 * Simple reactive state store
 */

class StateStore {
    constructor() {
        this.state = {
            user: null,
            guilds: [],
            selectedGuild: null,
            guildData: {}, // Cache guild details by ID
            currentView: 'overview',
            panelOpen: false,
            panelContent: null,
            loading: {
                global: false,
                guilds: false,
                guildData: false
            }
        };

        this.listeners = new Map();
        this.listenerIdCounter = 0;
    }

    /**
     * Get current state
     */
    get() {
        return this.state;
    }

    /**
     * Get a specific key from state
     */
    getKey(key) {
        return this.state[key];
    }

    /**
     * Update state and notify listeners
     */
    set(updates) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...updates };
        this.notify(prevState);
    }

    /**
     * Update nested state
     */
    setNested(key, updates) {
        const prevState = { ...this.state };
        this.state[key] = { ...this.state[key], ...updates };
        this.notify(prevState);
    }

    /**
     * Subscribe to state changes
     * @returns {function} Unsubscribe function
     */
    subscribe(callback, keys = null) {
        const id = ++this.listenerIdCounter;
        this.listeners.set(id, { callback, keys });

        return () => {
            this.listeners.delete(id);
        };
    }

    /**
     * Notify all listeners of state change
     */
    notify(prevState) {
        for (const [id, { callback, keys }] of this.listeners) {
            // If specific keys were specified, only notify if those keys changed
            if (keys) {
                const hasChange = keys.some(key => prevState[key] !== this.state[key]);
                if (!hasChange) continue;
            }

            try {
                callback(this.state, prevState);
            } catch (error) {
                console.error('State listener error:', error);
            }
        }
    }

    /**
     * Set loading state for a specific key
     */
    setLoading(key, value) {
        this.setNested('loading', { [key]: value });
    }

    /**
     * Check if anything is loading
     */
    isLoading() {
        return Object.values(this.state.loading).some(Boolean);
    }

    /**
     * Reset state (e.g., on logout)
     */
    reset() {
        this.state = {
            user: null,
            guilds: [],
            selectedGuild: null,
            guildData: {},
            currentView: 'overview',
            panelOpen: false,
            panelContent: null,
            loading: {
                global: false,
                guilds: false,
                guildData: false
            }
        };
        this.notify({});
    }
}

// Export singleton
export const state = new StateStore();
export default state;
