/**
 * CheapShot Dashboard - Bot Appearance Module
 * Customize bot nickname per server
 */

import api from '../api.js';
import state from '../state.js';
import { panel } from '../components/panel.js';
import { toast } from '../components/toast.js';

// Module metadata
export const moduleInfo = {
    id: 'appearance',
    name: 'Bot Nickname',
    description: 'Customize the bot\'s display name in your server.',
    icon: '✏️',
    category: 'general'
};

// Default settings
const defaultSettings = {
    customName: ''
};

/**
 * Get current module settings
 */
async function getSettings() {
    const guildId = state.get('selectedGuildId');
    if (!guildId) return defaultSettings;

    try {
        const settings = await api.getModuleSettings(guildId, moduleInfo.id);
        return { ...defaultSettings, ...settings };
    } catch (error) {
        console.error('Failed to load appearance settings:', error);
        return defaultSettings;
    }
}

/**
 * Save module settings
 */
async function saveSettings(settings) {
    const guildId = state.get('selectedGuildId');
    if (!guildId) throw new Error('No server selected');

    // Save to database and apply nickname via API
    await api.setBotNickname(guildId, settings.customName);
    toast.success('Bot nickname updated!');
}

/**
 * Generate panel content HTML
 */
function getPanelContent(settings) {
    const guild = state.get('selectedGuild');

    return `
        <div class="module-settings">
            <!-- Preview -->
            <div class="appearance-preview">
                <div class="preview-card">
                    <div class="preview-avatar" id="preview-avatar">
                        <span>🤖</span>
                    </div>
                    <div class="preview-info">
                        <span class="preview-name" id="preview-name">
                            ${settings.customName || 'CheapShot'}
                        </span>
                        <span class="preview-badge">BOT</span>
                    </div>
                </div>
                <p class="preview-hint">This is how the bot will appear in ${guild?.name || 'your server'}</p>
            </div>

            <div class="divider"></div>

            <!-- Custom Name -->
            <div class="form-group">
                <label class="form-label">Bot Display Name</label>
                <input type="text" 
                    class="form-input" 
                    id="input-custom-name"
                    placeholder="CheapShot"
                    value="${settings.customName || ''}"
                    maxlength="32">
                <p class="form-hint">Leave empty to use the default bot name. Max 32 characters.</p>
            </div>

            <!-- Info Alert -->
            <div class="alert alert-info">
                <span class="alert-icon">ℹ️</span>
                <div>
                    <strong>Note:</strong> This changes the bot's server nickname only. 
                    The bot's avatar is set globally and cannot be changed per-server 
                    (Discord API limitation).
                </div>
            </div>
        </div>
    `;
}

/**
 * Initialize panel event handlers
 */
function initPanelEvents(container, currentSettings) {
    let settings = { ...currentSettings };

    // Name input - live preview
    const nameInput = container.querySelector('#input-custom-name');
    const previewName = container.querySelector('#preview-name');

    nameInput.addEventListener('input', () => {
        const name = nameInput.value.trim() || 'CheapShot';
        previewName.textContent = name;
        settings.customName = nameInput.value.trim();
        state.set('unsavedChanges', true);
    });

    // Return settings getter for save
    return () => settings;
}

/**
 * Open the configuration panel
 */
export async function openConfig() {
    const settings = await getSettings();
    let getSettingsFunc = null;

    await panel.open(
        moduleInfo.id,
        moduleInfo.name,
        moduleInfo.icon,
        getPanelContent(settings),
        {
            onInit: (container) => {
                getSettingsFunc = initPanelEvents(container, settings);
            },
            onSave: async () => {
                if (getSettingsFunc) {
                    const newSettings = getSettingsFunc();
                    await saveSettings(newSettings);
                }
            }
        }
    );
}

/**
 * Render module card for the grid
 */
export function renderCard() {
    return `
        <div class="module-card" data-module="${moduleInfo.id}">
            <div class="module-header">
                <div class="module-icon">${moduleInfo.icon}</div>
            </div>
            <h3 class="module-title">${moduleInfo.name}</h3>
            <p class="module-description">${moduleInfo.description}</p>
            <div class="module-status">
                <span class="module-status-dot active"></span>
                <span>Click to customize</span>
            </div>
        </div>
    `;
}

export default {
    moduleInfo,
    openConfig,
    renderCard,
    getSettings,
    saveSettings
};
