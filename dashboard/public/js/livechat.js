/**
 * CheapShot Dashboard - Live Chat Module
 * AI-powered assistant with tool calling for dashboard actions
 */

import { api } from './api.js';
import { state } from './state.js';
import { toast } from './components/toast.js';

class LiveChat {
    constructor() {
        this.isOpen = false;
        this.messages = [];
        this.isTyping = false;
        this.conversationHistory = [];
    }

    /**
     * Initialize the live chat widget
     */
    init() {
        this.createElements();
        this.bindEvents();
        this.addWelcomeMessage();
    }

    /**
     * Create the chat button and window elements
     */
    createElements() {
        // Create the chat button
        const chatBtn = document.createElement('button');
        chatBtn.className = 'live-chat-btn';
        chatBtn.id = 'live-chat-btn';
        chatBtn.setAttribute('aria-label', 'Open live chat');
        chatBtn.innerHTML = `
            <svg class="chat-icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                <circle cx="9" cy="10" r="1" fill="currentColor"/>
                <circle cx="12" cy="10" r="1" fill="currentColor"/>
                <circle cx="15" cy="10" r="1" fill="currentColor"/>
            </svg>
            <svg class="chat-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
        `;

        // Create the chat window
        const chatWindow = document.createElement('div');
        chatWindow.className = 'live-chat-window';
        chatWindow.id = 'live-chat-window';
        chatWindow.innerHTML = `
            <div class="live-chat-header">
                <div class="live-chat-avatar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                </div>
                <div class="live-chat-info">
                    <div class="live-chat-title">CheapShot Assistant</div>
                    <div class="live-chat-status">Powered by skmredacted</div>
                </div>
                <button class="live-chat-close" id="live-chat-close" aria-label="Close chat">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <div class="live-chat-messages" id="live-chat-messages">
                <!-- Messages will be inserted here -->
            </div>
            <div class="live-chat-input-wrapper">
                <div class="live-chat-input-container">
                    <textarea 
                        class="live-chat-input" 
                        id="live-chat-input" 
                        placeholder="Ask me to configure your dashboard..."
                        rows="1"
                    ></textarea>
                    <button class="live-chat-send" id="live-chat-send" aria-label="Send message">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                        </svg>
                    </button>
                </div>
                <div class="live-chat-suggestions" id="live-chat-suggestions">
                    <button class="live-chat-suggestion" data-message="Enable AI chat">Enable AI chat</button>
                    <button class="live-chat-suggestion" data-message="Show my servers">Show my servers</button>
                    <button class="live-chat-suggestion" data-message="What can you do?">What can you do?</button>
                </div>
                <div class="live-chat-powered">
                    AI powered by <strong>skmredacted</strong>
                </div>
            </div>
        `;

        // Add to DOM
        document.body.appendChild(chatBtn);
        document.body.appendChild(chatWindow);

        // Store references
        this.button = chatBtn;
        this.window = chatWindow;
        this.messagesContainer = chatWindow.querySelector('#live-chat-messages');
        this.input = chatWindow.querySelector('#live-chat-input');
        this.sendBtn = chatWindow.querySelector('#live-chat-send');
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Toggle chat
        this.button.addEventListener('click', () => this.toggle());

        // Close button
        this.window.querySelector('#live-chat-close').addEventListener('click', () => this.close());

        // Send message
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Enter to send
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = Math.min(this.input.scrollHeight, 100) + 'px';
        });

        // Quick suggestions
        this.window.querySelectorAll('.live-chat-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                const message = btn.dataset.message;
                this.input.value = message;
                this.sendMessage();
            });
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.isOpen &&
                !this.window.contains(e.target) &&
                !this.button.contains(e.target)) {
                this.close();
            }
        });

        // Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    /**
     * Toggle chat window
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open chat window
     */
    open() {
        this.isOpen = true;
        this.button.classList.add('active');
        this.window.classList.add('active');
        setTimeout(() => this.input.focus(), 100);
    }

    /**
     * Close chat window
     */
    close() {
        this.isOpen = false;
        this.button.classList.remove('active');
        this.window.classList.remove('active');
    }

    /**
     * Add welcome message
     */
    addWelcomeMessage() {
        const user = state.getKey('user');
        const username = user?.globalName || user?.username || 'there';

        this.addMessage('assistant', `Hey ${username}! 👋 I'm your CheapShot assistant. I can help you configure your dashboard - just tell me what you need!

For example, you can ask me to:
• Enable or disable AI chat with specific settings
• Configure moderation features
• View your server stats
• And more!`);
    }

    /**
     * Add a message to the chat
     */
    addMessage(role, content, toolInfo = null) {
        const message = { role, content, toolInfo, timestamp: Date.now() };
        this.messages.push(message);

        const user = state.getKey('user');
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${role}`;

        let avatarHtml;
        if (role === 'user') {
            const avatarUrl = user?.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=64`
                : null;
            avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" alt="">`
                : `${(user?.username || 'U').charAt(0).toUpperCase()}`;
        } else {
            avatarHtml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>`;
        }

        messageEl.innerHTML = `
            <div class="chat-message-avatar">${avatarHtml}</div>
            <div class="chat-message-content">
                ${this.formatMessage(content)}
                ${toolInfo ? this.renderToolInfo(toolInfo) : ''}
            </div>
        `;

        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();

        return messageEl;
    }

    /**
     * Format message content (simple markdown)
     */
    formatMessage(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    /**
     * Render tool execution info
     */
    renderToolInfo(toolInfo) {
        const { tool, status, result } = toolInfo;
        const isComplete = status === 'complete';
        const icon = isComplete
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';

        return `<div class="chat-message-tool ${isComplete ? 'complete' : ''}">
            ${icon}
            <span>${isComplete ? `Executed: ${tool}` : `Executing: ${tool}...`}</span>
        </div>`;
    }

    /**
     * Show typing indicator
     * @param {boolean} isThinking - Whether AI is doing deep thinking/reasoning
     */
    showTyping(isThinking = false) {
        this.isTyping = true;

        // Remove any existing typing indicator first
        const existing = document.getElementById('chat-typing');
        if (existing) existing.remove();

        const typingEl = document.createElement('div');
        typingEl.className = 'chat-typing';
        typingEl.id = 'chat-typing';

        const message = isThinking
            ? 'CheapShot is thinking deeply...'
            : 'CheapShot is thinking...';

        typingEl.innerHTML = `
            <div class="chat-typing-dots${isThinking ? ' thinking' : ''}">
                <div class="chat-typing-dot"></div>
                <div class="chat-typing-dot"></div>
                <div class="chat-typing-dot"></div>
            </div>
            <span>${message}</span>
        `;
        this.messagesContainer.appendChild(typingEl);
        this.scrollToBottom();
    }

    /**
     * Update typing indicator text
     * @param {string} message - The message to show
     */
    updateTypingMessage(message) {
        const typingEl = document.getElementById('chat-typing');
        if (typingEl) {
            const span = typingEl.querySelector('span');
            if (span) {
                span.textContent = message;
            }
        }
    }

    /**
     * Hide typing indicator
     */
    hideTyping() {
        this.isTyping = false;
        const typingEl = document.getElementById('chat-typing');
        if (typingEl) typingEl.remove();
    }

    /**
     * Scroll to bottom of messages
     */
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * Send a message to the AI
     */
    async sendMessage() {
        const content = this.input.value.trim();
        if (!content || this.isTyping) return;

        // Add user message
        this.addMessage('user', content);
        this.input.value = '';
        this.input.style.height = 'auto';

        // Show typing
        this.showTyping();
        this.sendBtn.disabled = true;

        try {
            // Get current context
            const guild = state.getKey('selectedGuild');
            const user = state.getKey('user');
            const guildData = state.getKey('guildData');
            const currentSettings = guild && guildData?.[guild.id]?.settings || {};

            // Prepare conversation history
            this.conversationHistory.push({
                role: 'user',
                content
            });

            // Call the live chat API
            const response = await api.liveChatMessage({
                message: content,
                history: this.conversationHistory.slice(-10), // Last 10 messages for context
                context: {
                    guildId: guild?.id,
                    guildName: guild?.name,
                    userId: user?.id,
                    username: user?.username,
                    currentSettings
                }
            });

            // Handle tool calls
            if (response.toolCalls && response.toolCalls.length > 0) {
                for (const toolCall of response.toolCalls) {
                    await this.executeToolCall(toolCall);
                }
            }

            // Add assistant response
            this.addMessage('assistant', response.content);

            // Update conversation history
            this.conversationHistory.push({
                role: 'assistant',
                content: response.content
            });

        } catch (error) {
            console.error('Live chat error:', error);
            this.addMessage('assistant', `Sorry, I encountered an error: ${error.message}. Please try again.`);
        } finally {
            this.hideTyping();
            this.sendBtn.disabled = false;
        }
    }

    /**
     * Execute a tool call from the AI
     */
    async executeToolCall(toolCall) {
        const { name, arguments: args } = toolCall;

        // Add tool execution indicator
        const toolMessageEl = this.addMessage('assistant', `Executing action...`, {
            tool: name,
            status: 'executing'
        });

        try {
            let result;

            switch (name) {
                case 'enable_ai_chat':
                    result = await this.toolEnableAI(args);
                    break;
                case 'disable_ai_chat':
                    result = await this.toolDisableAI(args);
                    break;
                case 'configure_ai_channels':
                    result = await this.toolConfigureAIChannels(args);
                    break;
                case 'get_server_stats':
                    result = await this.toolGetServerStats(args);
                    break;
                case 'enable_moderation':
                    result = await this.toolEnableModeration(args);
                    break;
                case 'get_current_settings':
                    result = await this.toolGetCurrentSettings(args);
                    break;
                case 'navigate_to':
                    result = await this.toolNavigateTo(args);
                    break;
                default:
                    result = { success: false, message: `Unknown tool: ${name}` };
            }

            // Update tool indicator
            const toolIndicator = toolMessageEl.querySelector('.chat-message-tool');
            if (toolIndicator) {
                toolIndicator.classList.add('complete');
                toolIndicator.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    <span>Completed: ${name}</span>
                `;
            }

            if (result.success) {
                toast.success(result.message || 'Action completed');
            } else {
                toast.error(result.message || 'Action failed');
            }

            return result;
        } catch (error) {
            console.error(`Tool ${name} failed:`, error);
            toast.error(`Failed to execute: ${name}`);
            return { success: false, error: error.message };
        }
    }

    // ============================================================
    // Tool Implementations
    // ============================================================

    async toolEnableAI(args) {
        const guild = state.getKey('selectedGuild');
        if (!guild) {
            return { success: false, message: 'No server selected' };
        }

        try {
            const config = {
                enabled: true,
                mentionRespond: args?.mentionRespond ?? true,
                typingIndicator: args?.typingIndicator ?? true
            };

            if (args?.channels) {
                config.channels = args.channels;
            }

            await api.updateModuleConfig(guild.id, 'ai', config);

            // Update local state
            this.updateLocalState('ai', config);

            // Refresh UI
            if (window.app) {
                window.app.renderModuleGrid();
                window.app.updateStats(guild.id);
            }

            return { success: true, message: 'AI Chat enabled successfully!' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async toolDisableAI(args) {
        const guild = state.getKey('selectedGuild');
        if (!guild) {
            return { success: false, message: 'No server selected' };
        }

        try {
            await api.updateModuleConfig(guild.id, 'ai', { enabled: false });

            this.updateLocalState('ai', { enabled: false });

            if (window.app) {
                window.app.renderModuleGrid();
                window.app.updateStats(guild.id);
            }

            return { success: true, message: 'AI Chat disabled' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async toolConfigureAIChannels(args) {
        const guild = state.getKey('selectedGuild');
        if (!guild) {
            return { success: false, message: 'No server selected' };
        }

        try {
            const channels = args.channels || {};

            await api.updateModuleConfig(guild.id, 'ai', { channels });
            await api.updateChannelConfig(guild.id, channels);

            this.updateLocalState('ai', { channels });

            return {
                success: true,
                message: `Configured ${Object.keys(channels).length} channel(s) for AI responses`
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async toolGetServerStats(args) {
        const guild = state.getKey('selectedGuild');
        if (!guild) {
            return { success: false, message: 'No server selected' };
        }

        const guildData = state.getKey('guildData');
        const data = guildData?.[guild.id] || {};

        return {
            success: true,
            data: {
                name: guild.name,
                memberCount: data.memberCount || 'Unknown',
                channelCount: data.channels?.length || 0,
                roleCount: data.roles?.length || 0,
                botPresent: guild.botPresent
            }
        };
    }

    async toolEnableModeration(args) {
        // Moderation module is not ready yet
        return { success: false, message: 'Moderation is not ready yet' };
    }

    async toolGetCurrentSettings(args) {
        const guild = state.getKey('selectedGuild');
        if (!guild) {
            return { success: false, message: 'No server selected' };
        }

        const guildData = state.getKey('guildData');
        const settings = guildData?.[guild.id]?.settings || {};

        return {
            success: true,
            data: settings
        };
    }

    async toolNavigateTo(args) {
        const { view } = args;

        try {
            if (view === 'overview') {
                state.set({ currentView: 'overview' });
                if (window.app) {
                    window.app.setActiveNav('overview');
                    window.app.restoreOverviewPage();
                }
            } else if (view === 'context') {
                state.set({ currentView: 'context' });
                if (window.app) {
                    window.app.setActiveNav('context');
                    window.app.openContextView();
                }
            }

            return { success: true, message: `Navigated to ${view}` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Update local state after tool execution
     */
    updateLocalState(moduleName, config) {
        const guild = state.getKey('selectedGuild');
        if (!guild) return;

        const guildData = state.getKey('guildData') || {};
        const currentGuildData = guildData[guild.id] || {};

        const updatedGuildData = {
            ...guildData,
            [guild.id]: {
                ...currentGuildData,
                settings: {
                    ...(currentGuildData.settings || {}),
                    modules: {
                        ...(currentGuildData.settings?.modules || {}),
                        [moduleName]: {
                            ...(currentGuildData.settings?.modules?.[moduleName] || {}),
                            ...config
                        }
                    }
                }
            }
        };

        state.set({ guildData: updatedGuildData });
    }
}

// Create and export singleton
const liveChat = new LiveChat();
export { liveChat };
export default liveChat;
