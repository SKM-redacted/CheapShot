import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Response Gatekeeper - Uses AI to decide if we should respond
 * 
 * Instead of keyword matching, we ask the AI:
 * "Is this person talking to me, or just chatting with others?"
 * 
 * This is smarter because it can understand context and intent.
 */
class ResponseGatekeeper {
    constructor() {
        this.baseUrl = config.onyxApiBase;
        this.model = config.aiModel;

        // Cache recent decisions to avoid repeated API calls for similar messages
        this.decisionCache = new Map();
        this.CACHE_TTL_MS = 30000; // Cache decisions for 30 seconds
        this.MAX_CACHE_SIZE = 50;
    }

    /**
     * The gatekeeper prompt - asks AI to decide if we should respond
     */
    getGatekeeperPrompt(botName = 'CheapShot') {
        return `You are a strict gatekeeper for ${botName}, a Discord voice bot. Your job is to decide if someone is talking TO the bot or just chatting with others/themselves.

The bot should NOT butt into every conversation. Only respond when clearly engaged.

RESPOND "YES" if:
- YOU (the bot) just asked a question and this looks like an answer to it
- They mentioned the bot by name or clearly addressed it ("hey bot", "cheapshot", talking directly to you)
- They asked YOU a question
- They're clearly continuing a back-and-forth conversation WITH you
- They're commenting about YOU, your features, or your behavior (e.g., "the processing is working nicely", "you're fast")

RESPOND "NO" if:
- It's a random statement not connected to the recent conversation with you
- They seem to be talking to themselves, others, or no one in particular
- It's something random/silly someone just said out loud (like "I like to eat poop" or "banana phone")
- There's no clear indication they want YOU to respond
- It's just filler, reactions, or acknowledgments

KEY QUESTION: Is this person talking TO ME or ABOUT ME, or just talking?
When in doubt, assume they're NOT talking to you - don't interrupt random chatter.
Only respond with exactly "YES" or "NO".`;
    }

    /**
     * Ask the AI if we should respond to this transcript
     * @param {string} transcript - What the user said
     * @param {string} username - Who said it
     * @param {string} context - Recent conversation context (optional)
     * @returns {Promise<boolean>} True if we should respond
     */
    async shouldRespond(transcript, username, context = '') {
        const trimmed = transcript.trim();

        // Quick filters before hitting the API
        // Very short single words that are obviously fillers or acknowledgments
        const obviousFillers = [
            'yeah', 'yep', 'yup', 'yes', 'no', 'nope', 'nah',
            'ok', 'okay', 'k', 'sure', 'right', 'alright',
            'mhm', 'hmm', 'hm', 'uh', 'um', 'ah', 'oh', 'eh',
            'haha', 'lol', 'lmao', 'nice', 'cool', 'wow',
            'true', 'false', 'same', 'facts', 'bet'
        ];
        if (obviousFillers.includes(trimmed.toLowerCase().replace(/[.!?]/g, ''))) {
            logger.debug('GATEKEEPER', `Quick filter: "${transcript}" is obvious filler`);
            return false;
        }

        // Single random words without question marks AND without context are not worth responding to
        // But if we have context, they might be answering a question - let the AI decide
        const wordCount = trimmed.split(/\s+/).length;
        if (wordCount === 1 && !trimmed.includes('?') && !context) {
            logger.debug('GATEKEEPER', `Quick filter: "${transcript}" is single word without context`);
            return false;
        }

        // Check cache first
        const cacheKey = this.getCacheKey(transcript, username);
        const cached = this.decisionCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
            logger.debug('GATEKEEPER', `Cache hit for "${transcript}": ${cached.shouldRespond}`);
            return cached.shouldRespond;
        }

        try {
            const url = `${this.baseUrl}/v1/chat/completions`;

            let userMessage = `"${username}" just said: "${transcript}"`;
            if (context) {
                userMessage = `Recent conversation:\n${context}\n\nNow "${username}" said: "${transcript}"`;
            }
            userMessage += '\n\nShould you respond? Answer only YES or NO.';

            const body = {
                model: this.model,
                messages: [
                    { role: 'system', content: this.getGatekeeperPrompt() },
                    { role: 'user', content: userMessage }
                ],
                stream: false,
                max_tokens: 5, // We only need YES or NO
                temperature: 0.1 // Low temperature for consistent decisions
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Name': 'cheapshot-gatekeeper'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                logger.error('GATEKEEPER', `API error: ${response.status}`);
                return true; // Default to responding on error
            }

            const data = await response.json();
            const answer = data.choices?.[0]?.message?.content?.trim().toUpperCase() || 'YES';
            const shouldRespond = answer.includes('YES');

            // Cache the decision
            this.cacheDecision(cacheKey, shouldRespond);

            logger.info('GATEKEEPER', `"${transcript}" -> ${shouldRespond ? 'RESPOND' : 'IGNORE'}`);

            return shouldRespond;

        } catch (error) {
            logger.error('GATEKEEPER', `Error: ${error.message}`);
            return true; // Default to responding on error
        }
    }

    /**
     * Generate a cache key for a transcript
     */
    getCacheKey(transcript, username) {
        // Normalize the transcript for caching
        return `${username}:${transcript.toLowerCase().trim()}`;
    }

    /**
     * Cache a decision
     */
    cacheDecision(key, shouldRespond) {
        // Limit cache size
        if (this.decisionCache.size >= this.MAX_CACHE_SIZE) {
            // Remove oldest entry
            const oldestKey = this.decisionCache.keys().next().value;
            this.decisionCache.delete(oldestKey);
        }

        this.decisionCache.set(key, {
            shouldRespond,
            timestamp: Date.now()
        });
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.decisionCache.clear();
        logger.debug('GATEKEEPER', 'Cache cleared');
    }
}

// Export singleton
export const responseGatekeeper = new ResponseGatekeeper();
