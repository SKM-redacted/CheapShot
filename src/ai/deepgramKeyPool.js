/**
 * Deepgram API Key Pool Manager
 * 
 * Manages multiple Deepgram API keys with rate limiting and load balancing.
 * Each API key is treated as its own "server" with independent rate limits.
 * 
 * Rate Limits per account (as of Jan 2026):
 * - Speech-to-text REST: 100 concurrent
 * - Speech-to-text WSS: 50 concurrent
 * - Whisper Cloud: 5 concurrent
 * - Text-to-speech (REST + WSS): 15 concurrent
 * - Voice Agent API WSS: 15 concurrent
 * - Audio Intelligence REST: 10 concurrent
 */

import { createClient } from '@deepgram/sdk';
import { logger } from './logger.js';

// Rate limit constants per account
const RATE_LIMITS = {
    STT_REST: 100,
    STT_WSS: 50,
    STT_WHISPER: 5,
    TTS: 15,           // REST + WSS combined
    VOICE_AGENT: 15,
    AUDIO_INTELLIGENCE: 10
};

/**
 * Represents a single Deepgram API key with its rate limits
 */
class DeepgramKey {
    constructor(apiKey, index) {
        this.apiKey = apiKey;
        this.index = index;
        this.client = createClient(apiKey);

        // Current usage counters
        this.usage = {
            sttRest: 0,
            sttWss: 0,
            sttWhisper: 0,
            tts: 0,
            voiceAgent: 0,
            audioIntelligence: 0
        };

        // Track total requests for stats
        this.totalRequests = {
            sttRest: 0,
            sttWss: 0,
            sttWhisper: 0,
            tts: 0,
            voiceAgent: 0,
            audioIntelligence: 0
        };

        // Track active connections for cleanup
        this.activeConnections = new Map(); // connectionId -> { type, startTime }

        // Health tracking
        this.lastError = null;
        this.errorCount = 0;
        this.lastUsed = null;
        this.isHealthy = true;
    }

    /**
     * Check if this key has capacity for a given service type
     * @param {string} serviceType - 'sttRest', 'sttWss', 'sttWhisper', 'tts', 'voiceAgent', 'audioIntelligence'
     * @returns {boolean}
     */
    hasCapacity(serviceType) {
        if (!this.isHealthy) return false;

        switch (serviceType) {
            case 'sttRest':
                return this.usage.sttRest < RATE_LIMITS.STT_REST;
            case 'sttWss':
                return this.usage.sttWss < RATE_LIMITS.STT_WSS;
            case 'sttWhisper':
                return this.usage.sttWhisper < RATE_LIMITS.STT_WHISPER;
            case 'tts':
                return this.usage.tts < RATE_LIMITS.TTS;
            case 'voiceAgent':
                return this.usage.voiceAgent < RATE_LIMITS.VOICE_AGENT;
            case 'audioIntelligence':
                return this.usage.audioIntelligence < RATE_LIMITS.AUDIO_INTELLIGENCE;
            default:
                return false;
        }
    }

    /**
     * Get remaining capacity for a service type
     * @param {string} serviceType
     * @returns {number}
     */
    getRemainingCapacity(serviceType) {
        if (!this.isHealthy) return 0;

        switch (serviceType) {
            case 'sttRest':
                return RATE_LIMITS.STT_REST - this.usage.sttRest;
            case 'sttWss':
                return RATE_LIMITS.STT_WSS - this.usage.sttWss;
            case 'sttWhisper':
                return RATE_LIMITS.STT_WHISPER - this.usage.sttWhisper;
            case 'tts':
                return RATE_LIMITS.TTS - this.usage.tts;
            case 'voiceAgent':
                return RATE_LIMITS.VOICE_AGENT - this.usage.voiceAgent;
            case 'audioIntelligence':
                return RATE_LIMITS.AUDIO_INTELLIGENCE - this.usage.audioIntelligence;
            default:
                return 0;
        }
    }

    /**
     * Get current load percentage for a service type
     * @param {string} serviceType
     * @returns {number} 0-100
     */
    getLoadPercentage(serviceType) {
        switch (serviceType) {
            case 'sttRest':
                return (this.usage.sttRest / RATE_LIMITS.STT_REST) * 100;
            case 'sttWss':
                return (this.usage.sttWss / RATE_LIMITS.STT_WSS) * 100;
            case 'sttWhisper':
                return (this.usage.sttWhisper / RATE_LIMITS.STT_WHISPER) * 100;
            case 'tts':
                return (this.usage.tts / RATE_LIMITS.TTS) * 100;
            case 'voiceAgent':
                return (this.usage.voiceAgent / RATE_LIMITS.VOICE_AGENT) * 100;
            case 'audioIntelligence':
                return (this.usage.audioIntelligence / RATE_LIMITS.AUDIO_INTELLIGENCE) * 100;
            default:
                return 0;
        }
    }

    /**
     * Acquire a slot for a service type
     * @param {string} serviceType
     * @param {string} connectionId - Unique identifier for this connection
     * @returns {boolean} Whether the slot was acquired
     */
    acquire(serviceType, connectionId) {
        if (!this.hasCapacity(serviceType)) {
            return false;
        }

        // Increment usage
        switch (serviceType) {
            case 'sttRest':
                this.usage.sttRest++;
                this.totalRequests.sttRest++;
                break;
            case 'sttWss':
                this.usage.sttWss++;
                this.totalRequests.sttWss++;
                break;
            case 'sttWhisper':
                this.usage.sttWhisper++;
                this.totalRequests.sttWhisper++;
                break;
            case 'tts':
                this.usage.tts++;
                this.totalRequests.tts++;
                break;
            case 'voiceAgent':
                this.usage.voiceAgent++;
                this.totalRequests.voiceAgent++;
                break;
            case 'audioIntelligence':
                this.usage.audioIntelligence++;
                this.totalRequests.audioIntelligence++;
                break;
        }

        // Track connection
        this.activeConnections.set(connectionId, {
            type: serviceType,
            startTime: Date.now()
        });

        this.lastUsed = Date.now();
        return true;
    }

    /**
     * Release a slot for a service type
     * @param {string} connectionId - The connection ID that was used during acquire
     */
    release(connectionId) {
        const connection = this.activeConnections.get(connectionId);
        if (!connection) {
            return;
        }

        // Decrement usage
        switch (connection.type) {
            case 'sttRest':
                this.usage.sttRest = Math.max(0, this.usage.sttRest - 1);
                break;
            case 'sttWss':
                this.usage.sttWss = Math.max(0, this.usage.sttWss - 1);
                break;
            case 'sttWhisper':
                this.usage.sttWhisper = Math.max(0, this.usage.sttWhisper - 1);
                break;
            case 'tts':
                this.usage.tts = Math.max(0, this.usage.tts - 1);
                break;
            case 'voiceAgent':
                this.usage.voiceAgent = Math.max(0, this.usage.voiceAgent - 1);
                break;
            case 'audioIntelligence':
                this.usage.audioIntelligence = Math.max(0, this.usage.audioIntelligence - 1);
                break;
        }

        this.activeConnections.delete(connectionId);
    }

    /**
     * Mark an error for this key
     * @param {Error} error
     */
    recordError(error) {
        this.lastError = error;
        this.errorCount++;

        // Mark unhealthy if too many errors (recovers after cooldown)
        if (this.errorCount >= 5) {
            this.isHealthy = false;
            logger.warn('DEEPGRAM_POOL', `Key ${this.index} marked unhealthy after ${this.errorCount} errors`);

            // Auto-recover after 60 seconds
            setTimeout(() => {
                this.isHealthy = true;
                this.errorCount = 0;
                logger.info('DEEPGRAM_POOL', `Key ${this.index} recovered from unhealthy state`);
            }, 60000);
        }
    }

    /**
     * Get statistics for this key
     * @returns {Object}
     */
    getStats() {
        return {
            index: this.index,
            isHealthy: this.isHealthy,
            usage: { ...this.usage },
            totalRequests: { ...this.totalRequests },
            activeConnections: this.activeConnections.size,
            loadPercentage: {
                sttWss: this.getLoadPercentage('sttWss'),
                tts: this.getLoadPercentage('tts')
            },
            lastUsed: this.lastUsed,
            errorCount: this.errorCount
        };
    }
}

/**
 * Pool manager for multiple Deepgram API keys
 */
class DeepgramKeyPool {
    constructor() {
        this.keys = [];
        this.roundRobinIndexes = {
            sttRest: 0,
            sttWss: 0,
            sttWhisper: 0,
            tts: 0,
            voiceAgent: 0,
            audioIntelligence: 0
        };
        this.initialized = false;
        this.connectionIdCounter = 0;
    }

    /**
     * Initialize the pool with API keys
     * @param {string[]} apiKeys - Array of Deepgram API keys
     */
    initialize(apiKeys) {
        if (!apiKeys || apiKeys.length === 0) {
            logger.warn('DEEPGRAM_POOL', 'No Deepgram API keys provided');
            return false;
        }

        this.keys = apiKeys.map((key, index) => new DeepgramKey(key, index));
        this.initialized = true;

        logger.info('DEEPGRAM_POOL', `Initialized with ${this.keys.length} API key(s)`);
        logger.info('DEEPGRAM_POOL', `Total capacity - STT WSS: ${this.keys.length * RATE_LIMITS.STT_WSS}, TTS: ${this.keys.length * RATE_LIMITS.TTS}`);

        return true;
    }

    /**
     * Generate a unique connection ID
     * @returns {string}
     */
    generateConnectionId() {
        return `conn_${Date.now()}_${this.connectionIdCounter++}`;
    }

    /**
     * Acquire an API key for a specific service type
     * Uses round-robin with load awareness
     * 
     * @param {string} serviceType - 'sttRest', 'sttWss', 'sttWhisper', 'tts', 'voiceAgent', 'audioIntelligence'
     * @returns {{ client: DeepgramClient, connectionId: string, keyIndex: number } | null}
     */
    acquire(serviceType) {
        if (!this.initialized || this.keys.length === 0) {
            logger.error('DEEPGRAM_POOL', 'Pool not initialized');
            return null;
        }

        // Find all keys with capacity
        const availableKeys = this.keys.filter(key => key.hasCapacity(serviceType));

        if (availableKeys.length === 0) {
            logger.warn('DEEPGRAM_POOL', `No capacity available for ${serviceType}`);
            return null;
        }

        // Sort by remaining capacity (most capacity first) then by round-robin
        availableKeys.sort((a, b) => {
            const capacityDiff = b.getRemainingCapacity(serviceType) - a.getRemainingCapacity(serviceType);
            if (capacityDiff !== 0) return capacityDiff;

            // Tie-breaker: prefer less recently used
            return (a.lastUsed || 0) - (b.lastUsed || 0);
        });

        // Use round-robin among top candidates (those with similar capacity)
        const topCapacity = availableKeys[0].getRemainingCapacity(serviceType);
        const topCandidates = availableKeys.filter(key =>
            key.getRemainingCapacity(serviceType) >= topCapacity * 0.8  // Within 80% of best
        );

        // Round-robin selection among top candidates
        const rrIndex = this.roundRobinIndexes[serviceType] % topCandidates.length;
        const selectedKey = topCandidates[rrIndex];
        this.roundRobinIndexes[serviceType]++;

        // Generate connection ID and acquire
        const connectionId = this.generateConnectionId();
        if (!selectedKey.acquire(serviceType, connectionId)) {
            logger.error('DEEPGRAM_POOL', `Failed to acquire slot on key ${selectedKey.index}`);
            return null;
        }

        logger.debug('DEEPGRAM_POOL',
            `Acquired ${serviceType} on key ${selectedKey.index} ` +
            `(${selectedKey.usage[serviceType === 'sttWss' ? 'sttWss' : serviceType]}/${this.getLimitForType(serviceType)})`
        );

        return {
            client: selectedKey.client,
            connectionId,
            keyIndex: selectedKey.index,
            key: selectedKey  // Include the key object for direct access
        };
    }

    /**
     * Release a connection
     * @param {number} keyIndex - The key index that was returned from acquire
     * @param {string} connectionId - The connection ID that was returned from acquire
     */
    release(keyIndex, connectionId) {
        if (keyIndex === undefined || keyIndex === null || keyIndex >= this.keys.length) {
            logger.warn('DEEPGRAM_POOL', `Invalid key index for release: ${keyIndex}`);
            return;
        }

        const key = this.keys[keyIndex];
        const connection = key.activeConnections.get(connectionId);

        if (connection) {
            const duration = Date.now() - connection.startTime;
            logger.debug('DEEPGRAM_POOL',
                `Released ${connection.type} on key ${keyIndex} (duration: ${duration}ms)`
            );
        }

        key.release(connectionId);
    }

    /**
     * Record an error for a specific key
     * @param {number} keyIndex
     * @param {Error} error
     */
    recordError(keyIndex, error) {
        if (keyIndex >= 0 && keyIndex < this.keys.length) {
            this.keys[keyIndex].recordError(error);
        }
    }

    /**
     * Get the rate limit for a service type
     * @param {string} serviceType
     * @returns {number}
     */
    getLimitForType(serviceType) {
        switch (serviceType) {
            case 'sttRest': return RATE_LIMITS.STT_REST;
            case 'sttWss': return RATE_LIMITS.STT_WSS;
            case 'sttWhisper': return RATE_LIMITS.STT_WHISPER;
            case 'tts': return RATE_LIMITS.TTS;
            case 'voiceAgent': return RATE_LIMITS.VOICE_AGENT;
            case 'audioIntelligence': return RATE_LIMITS.AUDIO_INTELLIGENCE;
            default: return 0;
        }
    }

    /**
     * Get total capacity across all keys for a service type
     * @param {string} serviceType
     * @returns {number}
     */
    getTotalCapacity(serviceType) {
        return this.keys.length * this.getLimitForType(serviceType);
    }

    /**
     * Get current total usage across all keys for a service type
     * @param {string} serviceType
     * @returns {number}
     */
    getCurrentUsage(serviceType) {
        let total = 0;
        for (const key of this.keys) {
            switch (serviceType) {
                case 'sttRest': total += key.usage.sttRest; break;
                case 'sttWss': total += key.usage.sttWss; break;
                case 'sttWhisper': total += key.usage.sttWhisper; break;
                case 'tts': total += key.usage.tts; break;
                case 'voiceAgent': total += key.usage.voiceAgent; break;
                case 'audioIntelligence': total += key.usage.audioIntelligence; break;
            }
        }
        return total;
    }

    /**
     * Get remaining capacity across all keys for a service type
     * @param {string} serviceType
     * @returns {number}
     */
    getRemainingCapacity(serviceType) {
        return this.getTotalCapacity(serviceType) - this.getCurrentUsage(serviceType);
    }

    /**
     * Check if there's capacity for a service type
     * @param {string} serviceType
     * @returns {boolean}
     */
    hasCapacity(serviceType) {
        return this.keys.some(key => key.hasCapacity(serviceType));
    }

    /**
     * Get comprehensive statistics
     * @returns {Object}
     */
    getStats() {
        const keyStats = this.keys.map(key => key.getStats());

        // Aggregate stats
        const aggregate = {
            sttWss: {
                total: this.getTotalCapacity('sttWss'),
                used: this.getCurrentUsage('sttWss'),
                available: this.getRemainingCapacity('sttWss')
            },
            tts: {
                total: this.getTotalCapacity('tts'),
                used: this.getCurrentUsage('tts'),
                available: this.getRemainingCapacity('tts')
            },
            sttRest: {
                total: this.getTotalCapacity('sttRest'),
                used: this.getCurrentUsage('sttRest'),
                available: this.getRemainingCapacity('sttRest')
            },
            audioIntelligence: {
                total: this.getTotalCapacity('audioIntelligence'),
                used: this.getCurrentUsage('audioIntelligence'),
                available: this.getRemainingCapacity('audioIntelligence')
            }
        };

        // Total requests across all keys
        const totalRequests = {
            sttWss: keyStats.reduce((sum, k) => sum + k.totalRequests.sttWss, 0),
            tts: keyStats.reduce((sum, k) => sum + k.totalRequests.tts, 0),
            sttRest: keyStats.reduce((sum, k) => sum + k.totalRequests.sttRest, 0)
        };

        // Count healthy keys
        const healthyKeys = this.keys.filter(k => k.isHealthy).length;

        return {
            keyCount: this.keys.length,
            healthyKeys,
            aggregate,
            totalRequests,
            keys: keyStats
        };
    }

    /**
     * Get a simple status summary
     * @returns {string}
     */
    getStatusSummary() {
        if (!this.initialized) return 'Not initialized';

        const stats = this.getStats();
        return `Keys: ${stats.healthyKeys}/${stats.keyCount} healthy | ` +
            `STT: ${stats.aggregate.sttWss.used}/${stats.aggregate.sttWss.total} | ` +
            `TTS: ${stats.aggregate.tts.used}/${stats.aggregate.tts.total}`;
    }

    /**
     * Check if the pool is initialized
     * @returns {boolean}
     */
    isReady() {
        return this.initialized && this.keys.length > 0;
    }

    /**
     * Get the number of keys in the pool
     * @returns {number}
     */
    getKeyCount() {
        return this.keys.length;
    }
}

// Export singleton instance
export const deepgramKeyPool = new DeepgramKeyPool();

// Export rate limits for reference
export { RATE_LIMITS };
