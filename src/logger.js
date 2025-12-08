import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import blessed from 'blessed';
import contrib from 'blessed-contrib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function getDateString() {
    return new Date().toISOString().split('T')[0];
}

function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Write to log file
 */
function writeToFile(level, category, message, data = null) {
    const logFile = path.join(LOGS_DIR, `${getDateString()}.log`);
    const entry = {
        timestamp: getTimestamp(),
        level,
        category,
        message,
        ...(data && { data })
    };
    const line = JSON.stringify(entry) + '\n';
    fs.appendFile(logFile, line, () => { });
}

/**
 * TUI Dashboard System using blessed & blessed-contrib
 */
class Dashboard {
    constructor() {
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'CheapShot Bot Dashboard'
        });

        this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

        // 1. Bot Info Box (Top Left)
        this.infoBox = this.grid.set(0, 0, 4, 6, blessed.box, {
            label: ' Bot Info ',
            tags: true,
            style: { border: { fg: 'cyan' } },
            content: 'Starting...'
        });

        // 2. Status Box (Top Right)
        this.statusBox = this.grid.set(0, 6, 4, 6, blessed.box, {
            label: ' Status ',
            tags: true,
            style: { border: { fg: 'green' } },
            content: 'Initializing...'
        });

        // 3. Log Window (Bottom)
        this.logBox = this.grid.set(4, 0, 8, 12, blessed.log, {
            fg: 'white',
            selectedFg: 'white',
            label: ' Live Logs ',
            tags: true,
            style: { border: { fg: 'yellow' } },
            scrollable: true,
            scrollbar: { bg: 'blue' }
        });

        // Key bindings
        this.screen.key(['escape', 'q', 'C-c'], () => {
            return process.exit(0);
        });

        // State
        this.state = {
            botName: '...',
            model: '...',
            uptime: Date.now(),
            activeChats: 0,
            requestQueue: 0,
            activeImages: 0,
            imageQueue: 0,
            lastUpdate: Date.now()
        };

        // Log queue to prevent corruption
        this.logQueue = [];
        this.isProcessingLog = false;

        // Render loop
        this.screen.render();
        setInterval(() => this.updateUI(), 1000);
    }

    async processLogQueue() {
        if (this.isProcessingLog || this.logQueue.length === 0) return;

        this.isProcessingLog = true;
        while (this.logQueue.length > 0) {
            const logEntry = this.logQueue.shift();
            this.logBox.log(logEntry);
        }
        this.screen.render();
        this.isProcessingLog = false;
    }

    updateUI() {
        const uptimeSeconds = Math.floor((Date.now() - this.state.uptime) / 1000);
        const uptimeStr = `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`;

        // Update Info
        this.infoBox.setContent(
            `\n {bold}Bot:{/bold} ${this.state.botName}\n` +
            ` {bold}Model:{/bold} ${this.state.model}\n` +
            ` {bold}Uptime:{/bold} ${uptimeStr}`
        );

        // Update Status
        this.statusBox.setContent(
            `\n {bold}Active Chats:{/bold} ${this.state.activeChats} (Queue: ${this.state.requestQueue})\n` +
            ` {bold}Active Images:{/bold} ${this.state.activeImages} (Queue: ${this.state.imageQueue})`
        );

        this.screen.render();
    }

    log(icon, text) {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        this.logQueue.push(`{gray-fg}${time}{/gray-fg} ${icon} ${text}`);
        this.processLogQueue();
    }
}

// Initialize Dashboard
const dashboard = new Dashboard();

export const logger = {
    // --- Actions ---

    startup(botTag, model, apiBase, maxConcurrent) {
        dashboard.state.botName = botTag;
        dashboard.state.model = model;
        dashboard.updateUI();

        writeToFile('STARTUP', 'SYSTEM', 'Bot started', { botTag, model });
        dashboard.log('{green-fg}🟢{/green-fg}', `Bot started as {bold}${botTag}{/bold}`);
    },

    message(author, content, channelId) {
        writeToFile('MESSAGE', 'DISCORD', 'Message received', { author, content, channelId });
        dashboard.log('{blue-fg}📨{/blue-fg}', `Message from {bold}${author}{/bold}`);
    },

    aiRequest(author, prompt) {
        dashboard.state.activeChats++;
        dashboard.updateUI();
        writeToFile('AI_REQUEST', 'AI', 'Chat started', { author, prompt });
    },

    aiComplete(author, responseLength, hasToolCalls = false) {
        dashboard.state.activeChats = Math.max(0, dashboard.state.activeChats - 1);
        dashboard.updateUI();

        const suffix = hasToolCalls ? ' (tools used)' : '';
        writeToFile('AI_COMPLETE', 'AI', 'Chat done', { author, hasToolCalls });
        dashboard.log('{green-fg}✅{/green-fg}', `Response to {bold}${author}{/bold}${suffix}`);
    },

    toolCall(toolName, args) {
        writeToFile('TOOL_CALL', 'TOOLS', toolName, { args });
        dashboard.log('{magenta-fg}🔧{/magenta-fg}', `Tool: ${toolName}`);
    },

    imageStart(prompt, size) {
        dashboard.state.activeImages++;
        dashboard.updateUI();

        writeToFile('IMAGE_START', 'IMAGE', 'Gen started', { prompt, size });
        dashboard.log('{yellow-fg}🎨{/yellow-fg}', `Generating image...`);
    },

    imageComplete(author, url, prompt) {
        dashboard.state.activeImages = Math.max(0, dashboard.state.activeImages - 1);
        dashboard.updateUI();

        writeToFile('IMAGE_COMPLETE', 'IMAGE', 'Gen done', { author, url });
        dashboard.log('{green-fg}🖼️{/green-fg}', `Image created for {bold}${author}{/bold}`);
    },

    // --- Status Updates ---

    requestQueue(active, max) {
        // queue.js calls this with (active, max)
        // We only show QUEUED count in UI, so we need queue length
        // But queue.js was updated to call requestQueueStatus with 3 args
    },

    requestQueueStatus(active, max, queued) {
        dashboard.state.requestQueue = queued;
        dashboard.updateUI();
    },

    imageQueue(active, max, queued) {
        dashboard.state.activeImages = active;
        dashboard.state.imageQueue = queued;
        dashboard.updateUI();
    },

    error(category, message, error = null) {
        writeToFile('ERROR', category, message, error);
        dashboard.log('{red-fg}❌{/red-fg}', `{red-fg}${category}: ${message}{/red-fg}`);
    },

    // Debug method for other files
    debug(category, message, data) {
        writeToFile('DEBUG', category, message, data);
    }
};
