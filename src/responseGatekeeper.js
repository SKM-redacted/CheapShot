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
     * @param {Object} vcInfo - Voice channel info { memberCount, memberNames }
     * @returns {Promise<boolean>} True if we should respond
     */
    async shouldRespond(transcript, username, context = '', vcInfo = null) {
        const trimmed = transcript.trim();
        const lowerTranscript = trimmed.toLowerCase();
        const memberCount = vcInfo?.memberCount || 1;
        const memberNames = vcInfo?.memberNames || [];

        // FAST PATH: 1-on-1 conversation = ALWAYS respond immediately
        // No filtering needed - there's no one else they could be talking to!
        // This is the BIGGEST speed optimization - skips ALL processing
        if (memberCount <= 1) {
            logger.info('GATEKEEPER', `Fast-pass: 1-on-1 call - responding immediately`);
            return true;
        }

        // QUICK-PASS: If the user mentions the bot's name ANYWHERE, ALWAYS respond
        // This must be checked BEFORE any filters to prevent false negatives
        const botNameMentions = ['cheapshot', 'cheap shot', 'cheap-shot', 'hey bot', 'yo bot'];
        for (const mention of botNameMentions) {
            if (lowerTranscript.includes(mention)) {
                logger.info('GATEKEEPER', `Quick-pass: Bot name mentioned ("${mention}") - responding`);
                return true;
            }
        }

        // CONVERSATIONAL CONTEXT: If the bot just spoke, the next message is probably a response to us
        // This makes conversations flow naturally without requiring the bot's name every time
        if (context && memberCount > 1) {
            // First check if this is a pure filler word - NEVER quick-pass these
            const fillerCheck = trimmed.toLowerCase().replace(/[.!?,]/g, '').trim();
            const pureFillers = ['yeah', 'yep', 'yup', 'yes', 'no', 'nope', 'nah', 'ok', 'okay', 'sure', 'right', 'alright', 'mhm', 'hmm', 'uh', 'um'];

            if (!pureFillers.includes(fillerCheck)) {
                // Parse context to find the bot's last message and who was talking
                const lines = context.split('\n');
                let lastBotTimestamp = null;
                let lastBotMessage = null;
                let lastUserBeforeBot = null;

                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i];

                    // Match bot messages: [Xs ago] You said: "message"
                    const botMatch = line.match(/\[(\d+)s? ago\] You said: "(.+)"/);
                    if (botMatch && lastBotTimestamp === null) {
                        lastBotTimestamp = parseInt(botMatch[1]);
                        lastBotMessage = botMatch[2];
                    }

                    // Match minute format
                    const botMatchMin = line.match(/\[(\d+)m ago\] You said: "(.+)"/);
                    if (botMatchMin && lastBotTimestamp === null) {
                        lastBotTimestamp = parseInt(botMatchMin[1]) * 60;
                        lastBotMessage = botMatchMin[2];
                    }

                    // Match user messages to see who was talking to bot
                    const userMatch = line.match(/\[\d+[sm]? ago\] (\w+) said:/);
                    if (userMatch && lastBotTimestamp !== null && lastUserBeforeBot === null) {
                        lastUserBeforeBot = userMatch[1];
                        break; // Found the user who was talking to the bot
                    }
                }

                const wordCount = trimmed.split(/\s+/).length;

                // Quick-pass criteria:
                // 1. Bot spoke within the last 15 seconds
                // 2. Response has some substance (3+ words)
                // 3. Either: bot asked a question OR this user was just talking to the bot
                if (lastBotTimestamp !== null && lastBotTimestamp <= 15 && wordCount >= 3) {
                    const botAskedQuestion = lastBotMessage && lastBotMessage.includes('?');
                    const sameUserContinuing = lastUserBeforeBot && username.toLowerCase().includes(lastUserBeforeBot.toLowerCase().substring(0, 4));

                    if (botAskedQuestion || sameUserContinuing) {
                        logger.info('GATEKEEPER', `Conversation quick-pass: Bot spoke ${lastBotTimestamp}s ago, ${botAskedQuestion ? 'asked question' : 'same user continuing'}`);
                        return true;
                    }
                }
            }
        }

        // Quick filter: pure filler words and reactions that never warrant a response
        const obviousFillers = [
            'yeah', 'yep', 'yup', 'yes', 'no', 'nope', 'nah',
            'ok', 'okay', 'k', 'sure', 'right', 'alright',
            'mhm', 'hmm', 'hm', 'uh', 'um', 'ah', 'oh', 'eh',
            'haha', 'lol', 'lmao', 'nice', 'cool', 'wow',
            'true', 'false', 'same', 'facts', 'bet',
            'what', 'wait', 'huh', 'oof', 'rip', 'damn', 'dang',
            'bruh', 'bro', 'dude', 'man', 'yo', 'ay', 'aye',
            // Exclamations - never directed at the bot
            'god', 'jesus', 'christ', 'lord', 'hell', 'shit', 'fuck', 'crap', 'frick', 'dammit', 'damnit'
        ];
        const normalizedTranscript = trimmed.toLowerCase().replace(/[.!?,]/g, '').trim();
        if (obviousFillers.includes(normalizedTranscript)) {
            logger.debug('GATEKEEPER', `Quick filter: "${transcript}" is obvious filler`);
            return false;
        }

        // Quick filter: Casual chat phrases that are clearly not directed at the bot
        const casualPhrases = [
            /^i('m| am) gonna/i,
            /^i('m| am) going to/i,
            /^i('ll| will) check/i,
            /^let me (check|see|look)/i,
            /^i have no (fucking |)clue/i,
            /^i (don't|dont) know/i,
            /^i (don't|dont) have a clue/i,
            /^what the (fuck|hell|heck)/i,
            /^no (fucking |)idea/i,
            /^hold on/i,
            /^one sec/i,
            /^give me a (sec|second|minute)/i,
            /^be right back/i,
            /^brb/i,
            /^afk/i,
            /^i think so/i,
            /^i guess/i,
            /^maybe/i,
            /^probably/i,
            /^definitely/i,
            /^absolutely/i,
            /^for sure/i,
            /^of course/i,
            /^that's (crazy|insane|wild|nuts|funny|hilarious)/i,
            /^no way/i,
            // "Okay" starting phrases - almost NEVER directed at bot
            /^okay[.,!]?\s/i,
            /^ok[.,!]?\s/i,
            /^alright[.,!]?\s/i,
            // "Okay." followed by random words (STT artifacts or self-talk)
            /^okay\.\s*(hell|hold|wait|we|that|this|so|um|uh)/i,
            /^ok\.\s*(hell|hold|wait|we|that|this|so|um|uh)/i,
            // Imperative commands not mentioning bot
            /^(fucking |)turn (that |it |this )?(on|off|up|down)/i,
            /^(shut|turn) (it|that|this) (off|up|down)/i,
            /^(fucking |)stop (it|that|this)/i,
            /^wait (a |)(sec|second|minute|moment)/i,
            // Fragments and incomplete sentences
            /^there's$/i,
            /^there is$/i,
            /^it's$/i,
            /^that's$/i,
            /^what did$/i,
            /^what did it$/i,
            // NOTE: Do NOT filter "^actually" broadly - it's often used to CORRECT the bot
            // e.g. "Actually, it's daytime" is a legit response to "How's your night?"
            // Third person references (talking ABOUT bot, not TO it)
            /actually listens/i,
            /it listens/i,
            /he listens/i,
            /she listens/i,
            // General commentary
            /^(that|this) is (so |)(funny|hilarious|weird|crazy|insane)/i,
            /^we (need|gotta|have) to/i,
            /^we stand/i,
            /^we we stand/i,  // STT stutter
            /^fuck it/i,
            /^goddamn( it)?/i,
            /^god damn( it)?/i,
            // Gaming/activity callouts
            /^(i'm |i am |)(down|dead|out)/i,
            /^(he's|she's|they're) (down|dead|here|there)/i,
            /^on (my |the )(left|right)/i,
            /^(the |)left\.?$/i,
            /^(the |)right\.?$/i,
            /^behind (you|me|us|them)/i,
            /^over (here|there)/i,
            /^(got|have) (one|him|her|them)/i,
            /reef/i,  // Gaming callout from earlier
            // Single word responses/acknowledgments (not to bot)
            /^late\.?$/i,
            /^early\.?$/i,
            // STT garbage patterns
            /^it's x /i,
            /^its x /i,
            // Thank you/thanks without context (probably to another person)
            /^(thanks|thank you)\.?$/i,
            // Fragmented cross-talk (talking to other users, not bot)
            // "Name, so" or "Name, but" patterns - starting to talk about someone
            /^[A-Z][a-z]+,?\s+(so|but|and|like|is|was|he|she|they)$/i,
            // Standalone adjective fragments - continuations of thoughts
            /^(fucking |so |really |super )?(slow|fast|good|bad|weird|dumb|stupid|crazy|insane)\.?$/i,
            // "That, honestly" style commentary to others
            /^that,?\s+(honestly|actually|really|seriously)/i,
        ];
        for (const pattern of casualPhrases) {
            if (pattern.test(trimmed)) {
                logger.debug('GATEKEEPER', `Quick filter: "${transcript}" matches casual phrase pattern`);
                return false;
            }
        }

        // Quick filter: Repeated words (like "Debit. Debit. Debit.")
        const words = trimmed.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/);
        if (words.length >= 2) {
            const uniqueWords = new Set(words);
            // If it's mostly the same word repeated, filter it out
            if (uniqueWords.size === 1 || (uniqueWords.size <= 2 && words.length >= 3)) {
                logger.debug('GATEKEEPER', `Quick filter: "${transcript}" is repeated words`);
                return false;
            }
        }

        // Quick filter: Random numbers or single letters - ALWAYS block these
        // These are NEVER intentional commands to the bot
        const strippedInput = trimmed.replace(/[^a-zA-Z0-9]/g, '');
        if (strippedInput.length <= 2) {
            logger.debug('GATEKEEPER', `Quick filter: "${transcript}" is too short (${strippedInput.length} chars)`);
            return false;
        }
        if (/^\d+\.?$/.test(trimmed)) {
            logger.debug('GATEKEEPER', `Quick filter: "${transcript}" is just a number`);
            return false;
        }

        // Quick filter: Very short fragments without question marks (likely not directed at bot)
        const wordCount = trimmed.split(/\s+/).length;
        if (wordCount <= 3 && !trimmed.includes('?') && !trimmed.toLowerCase().includes('cheapshot') && !trimmed.toLowerCase().includes('bot')) {
            // Check if it's just trailing words/fragments
            const fragmentPatterns = [
                /^things?\s*\.?$/i,
                /^say\.?$/i,
                /^right\.?$/i,
                /^you think\??$/i,
                /^what is$/i,
                /^like,?$/i
            ];
            for (const pattern of fragmentPatterns) {
                if (pattern.test(trimmed)) {
                    logger.debug('GATEKEEPER', `Quick filter: "${transcript}" is a fragment`);
                    return false;
                }
            }
        }

        // Single random words without question marks AND without context are not worth responding to
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
                    { role: 'system', content: this.getGatekeeperPrompt('CheapShot', memberCount, memberNames) },
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
