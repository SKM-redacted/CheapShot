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
        // Use dedicated gatekeeper model if set, otherwise fall back to main AI model
        this.model = config.gatekeeperModel || config.aiModel;

        // Cache recent decisions to avoid repeated API calls for similar messages
        this.decisionCache = new Map();
        this.CACHE_TTL_MS = 30000; // Cache decisions for 30 seconds
        this.MAX_CACHE_SIZE = 50;
    }

    /**
     * The gatekeeper prompt - asks AI to decide if we should respond
     * @param {number} memberCount - Number of humans in the VC (excluding the bot)
     * @param {string[]} memberNames - Names of people in the VC
     */
    getGatekeeperPrompt(botName = 'CheapShot', memberCount = 1, memberNames = []) {
        // If it's just the user and the bot, be VERY lenient
        if (memberCount <= 1) {
            return `You are ${botName}, a Discord voice bot. You're in a 1-on-1 call with just ONE person.

IT'S JUST YOU AND THEM. Almost everything they say is to YOU. Be VERY lenient!

RESPOND "YES" if:
- They said ANYTHING that could be a response to what you just said ("thanks", "I appreciate it", "got it", "makes sense")
- They mentioned YOU or YOUR features ("your voice", "you're fast", "cheapshot")
- They asked ANY question
- They made ANY statement you could reasonably respond to
- They're sharing thoughts, opinions, complaints, or stories
- It connects to ANYTHING you've discussed recently

RESPOND "NO" ONLY if:
- It's a COMPLETELY RANDOM word/phrase with zero connection to your conversation (just "Banana" out of nowhere when you were talking about coding)
- It's pure filler sounds ("mhm", "uh", "hmm")

IMPORTANT: In a 1-on-1 call, there's NO ONE ELSE they could be talking to! 
Even "I appreciate it" or "cool" after you said something = they're responding to YOU.
When in doubt, ALWAYS say YES.
Only respond with exactly "YES" or "NO".`;
        }

        // Multiple people in VC - be VERY selective
        const memberList = memberNames.length > 0 ? `\nPeople in the call: ${memberNames.join(', ')}` : '';

        return `You are an EXTREMELY STRICT gatekeeper for ${botName}, a Discord voice bot in a group call. Your DEFAULT is to NOT respond.

CRITICAL CONTEXT:
- There are ${memberCount} OTHER HUMANS in this voice call${memberList}
- They are FRIENDS chatting with EACH OTHER
- Most of what they say is to EACH OTHER, not you
- You should STAY QUIET and let them talk unless EXPLICITLY addressed
- Speech-to-text often produces GARBAGE - fragmented words, repeated syllables, incomplete sentences

ONLY respond "YES" if ONE of these is TRUE:
1. They said your name ("CheapShot", "Cheap Shot", "hey bot", "bot")
2. They DIRECTLY asked YOU a question with clear intent ("Bot, what do you think?", "CheapShot, can you...")
3. **IMPORTANT: If YOUR last message ended with a QUESTION (? mark) like "What's up?", "How are you?", "What do you think?", then the NEXT thing this user says is ALMOST CERTAINLY answering YOUR question - say YES!**
   - Example: If you said "Yeah I'm here! What's up?" and they respond with ANYTHING (even something like "Disregard that Discord thing"), they are ANSWERING you
   - When you ask a question, you MUST respond to their answer, even if it seems unrelated at first glance
4. They explicitly referenced something YOU just said ("what you said", "you mentioned", "your last message")
5. They gave you a DIRECT COMMAND with your name ("CheapShot, call him Dmitry", "Bot, remember that")

ALWAYS respond "NO" if:
- It's casual chatter between friends ("I'm gonna check", "what?", "I have no clue")
- It's reactions or commentary ("that's crazy", "no way", "I think so", "Okay. That's funny.")
- It's fragments or incomplete thoughts ("We we stand", "There's", "What did")
- It's profanity or exclamations ("Fuck it", "Okay. Hell.", "Damn")
- It's random words, numbers, or sounds ("Late.", "Debit.", single words)
- It's REPEATED words/phrases ("Debit. Debit. Debit.", spammed words)
- They're explaining something to each other
- They're reacting to something in their game/activity
- They're talking ABOUT you in third person ("Actually listens to you", "it listened", "the bot works")
  - This is commentary TO ANOTHER PERSON, not a request TO YOU
- There's ANY doubt about whether it's directed at you
- It looks like STT artifacts (garbled, doesn't make grammatical sense)

SPECIAL CASE - Third Person References:
When someone says "Actually listens to you" or "It did what you said" - they're talking ABOUT you TO their friend, NOT talking TO you. These are observations/commentary, not requests. Say NO.

SPECIAL CASE - Name/Preference Updates from Third Parties:
If User A asks to be called "Tom" but User B says "Call him Dmitry" while addressing you by name - that's a DIRECT command TO you. Say YES.
But if User B just says "Call him Dmitry" without addressing you - they might be talking to User A. Say NO unless your name was used.

SPECIAL CASE - STT Garbage:
Speech-to-text often produces gibberish, fragments, repeated words. Examples:
- "We we stand" (STT stutter)
- "It's x Thank you" (garbled transcription)  
- "Okay. Hold on." (talking to themselves)
- Single words like "Late." or numbers
These are NEVER intentional commands to you. Say NO.

SPECIAL CASE - Fragmented Cross-Talk:
Users often talk to EACH OTHER in fragments. Examples:
- "Peter, so" followed later by "fucking slow." = Someone telling their friend Peter is slow
- "That, honestly, it's fucking awesome." = Reacting to something with another person
- "[Name], but" or "[Name], and" = Starting a sentence about/to someone else
If you see a NAME that isn't yours followed by a fragment, they're talking to/about that person, NOT you. Say NO.

REMEMBER: In a group call, you're like a wallflower at a party. Don't insert yourself unless someone SPECIFICALLY calls on you by name or is clearly answering YOUR question. Silence is your default state.

Ask yourself: "Did they use my name or CLEARLY direct this at me?" If not sure, say NO.
Only respond with exactly "YES" or "NO".`;
    }

    /**
     * Ask the AI if we should respond to this transcript
     * @param {string} transcript - What the user said
     * @param {string} username - Who said it
     * @param {string} context - Recent conversation context (optional)
     * @param {Object} vcInfo - Voice channel info { memberCount, memberNames, sentiment }
     * @returns {Promise<boolean>} True if we should respond
     */
    async shouldRespond(transcript, username, context = '', vcInfo = null) {
        const trimmed = transcript.trim();
        const lowerTranscript = trimmed.toLowerCase();
        const memberCount = vcInfo?.memberCount || 1;
        const memberNames = vcInfo?.memberNames || [];
        const sentiment = vcInfo?.sentiment || null;

        // INSTANT CHECK: If bot name is mentioned, respond immediately - no API call needed
        // This saves 3-6 seconds on every direct address
        const botNameMentions = [
            'cheapshot', 'cheap shot', 'cheap-shot',
            'chip shot', 'chipshot',    // Common STT mishearing
            'cheep shot', 'cheepshot',
            'deep shot', 'deepshot',    // Another STT mishearing
            'hey bot', 'yo bot'
        ];
        for (const mention of botNameMentions) {
            if (lowerTranscript.includes(mention)) {
                logger.info('GATEKEEPER', `Instant YES: Bot name "${mention}" detected`);
                return true;
            }
        }

        // INSTANT CHECK: Tool commands - humans can't create Discord channels/roles by talking
        // These are obviously directed at the bot
        const toolPatterns = [
            /\b(create|make|add|delete|remove)\b.*(channel|voice|text|category|role)/i,
            /\b(channel|voice|text|category|role)\b.*(create|make|add|delete|remove)/i,
            /\b(set\s*up|setup|clean|clear|wipe)\b.*(server|channel|discord)/i,
            /\b(join|leave)\b.*(voice|vc|channel)/i,
            /\b(move|kick|ban|timeout|mute)\b.*(me|him|her|them|user|member)/i,
        ];
        for (const pattern of toolPatterns) {
            if (pattern.test(lowerTranscript)) {
                logger.info('GATEKEEPER', `Instant YES: Tool command detected`);
                return true;
            }
        }

        // Check cache
        const cacheKey = this.getCacheKey(transcript, username);
        const cached = this.decisionCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
            logger.debug('GATEKEEPER', `Cache hit for "${transcript}": ${cached.shouldRespond}`);
            return cached.shouldRespond;
        }

        try {
            const url = `${this.baseUrl}/v1/chat/completions`;

            let userMessage = `"${username}" just said: "${transcript}"`;

            // Add sentiment/tone context if available
            if (sentiment && sentiment.description) {
                userMessage += `\n[TONE OF VOICE: ${sentiment.description} (score: ${sentiment.score})]`;
            }

            if (context) {
                userMessage = `Recent conversation:\n${context}\n\nNow "${username}" said: "${transcript}"`;
                if (sentiment && sentiment.description) {
                    userMessage += `\n[TONE OF VOICE: ${sentiment.description} (score: ${sentiment.score})]`;
                }
            }
            userMessage += '\n\nShould you respond? Answer only YES or NO.';

            const body = {
                model: this.model,
                messages: [
                    { role: 'system', content: this.getGatekeeperPrompt('CheapShot', memberCount, memberNames) },
                    { role: 'user', content: userMessage }
                ],
                stream: false,
                max_tokens: 5, // We only need YES or NO
                temperature: 0.1 // Low temperature for consistent decisions
            };

            // DEBUG: Log timing and model
            const startTime = Date.now();
            logger.debug('GATEKEEPER', `API call starting - model: ${this.model}, url: ${url}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Name': 'cheapshot-gatekeeper'
                },
                body: JSON.stringify(body)
            });

            const elapsed = Date.now() - startTime;
            logger.debug('GATEKEEPER', `API call completed in ${elapsed}ms - status: ${response.status}`);

            if (!response.ok) {
                logger.error('GATEKEEPER', `API error: ${response.status}`);
                return true; // Default to responding on error
            }

            const data = await response.json();
            const answer = data.choices?.[0]?.message?.content?.trim().toUpperCase() || 'YES';
            const shouldRespond = answer.includes('YES');

            // Cache the decision
            this.cacheDecision(cacheKey, shouldRespond);

            const sentimentLog = sentiment ? ` [${sentiment.description}]` : '';
            logger.info('GATEKEEPER', `"${transcript}"${sentimentLog} -> ${shouldRespond ? 'RESPOND' : 'IGNORE'}`);

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
