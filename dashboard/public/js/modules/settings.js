/**
 * CheapShot Dashboard - Settings Module
 * General bot settings for a guild
 */

import { api } from '../api.js';
import { toast } from '../components/toast.js';

/**
 * Render the settings configuration panel content
 */
export async function render(guildId, data = {}) {
    // Fetch current settings
    let settings = {};
    try {
        settings = await api.getSettings(guildId) || {};
    } catch (e) {
        console.warn('Could not load settings:', e);
    }

    return `
        <div class="module-config" data-module="settings">
            <!-- Bot Prefix -->
            <div class="form-group">
                <label class="form-label">Command Prefix</label>
                <input type="text" class="form-input" id="prefix" 
                       value="${settings.prefix || '!'}" 
                       maxlength="5" style="width: 120px;">
                <p class="form-hint">The prefix for bot commands (e.g., !help)</p>
            </div>

            <div class="divider"></div>

            <!-- Bot Nickname -->
            <div class="form-group">
                <label class="form-label">Bot Nickname</label>
                <input type="text" class="form-input" id="nickname" 
                       value="${settings.nickname || ''}" 
                       placeholder="Leave empty for default">
                <p class="form-hint">Custom nickname for the bot in this server</p>
            </div>

            <div class="divider"></div>

            <!-- Behavior Settings -->
            <h4 class="text-white mb-md">Behavior</h4>

            <div class="settings-list">
                <div class="setting-row">
                    <div class="setting-info">
                        <div class="text-white font-medium">Delete Command Messages</div>
                        <div class="text-sm text-muted">Automatically delete command triggers after execution</div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" class="toggle-input" id="delete-commands" 
                               ${settings.deleteCommands ? 'checked' : ''}>
                        <span class="toggle-track">
                            <span class="toggle-thumb"></span>
                        </span>
                    </label>
                </div>
            </div>

            <div class="divider"></div>

            <!-- Danger Zone -->
            <h4 class="text-danger mb-md">⚠️ Danger Zone</h4>
            
            <div class="danger-zone">
                <div class="danger-item">
                    <div>
                        <div class="text-white font-medium">Reset All Settings</div>
                        <div class="text-sm text-muted">Reset all bot settings for this server to default</div>
                    </div>
                    <button class="btn btn-danger btn-sm" id="reset-settings-btn">
                        Reset Settings
                    </button>
                </div>
            </div>

            <div class="divider"></div>

            <!-- Save Button -->
            <div class="flex justify-end gap-md">
                <button class="btn btn-primary" id="save-settings-btn">
                    💾 Save Settings
                </button>
            </div>
        </div>

        <style>
            .settings-list {
                display: flex;
                flex-direction: column;
                gap: var(--space-sm);
            }
            
            .setting-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--space-md);
                background: var(--graphite);
                border-radius: var(--radius-md);
                border: 1px solid var(--glass-border);
            }
            
            .setting-info {
                flex: 1;
            }
            
            .danger-zone {
                border: 1px solid var(--danger);
                border-radius: var(--radius-md);
                overflow: hidden;
            }
            
            .danger-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--space-md);
                background: var(--danger-dim);
            }
        </style>
    `;
}

/**
 * Initialize event handlers for the settings panel
 */
export function init(container, options = {}) {
    const { guildId } = options;

    // Save settings
    const saveBtn = container.querySelector('#save-settings-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';

            try {
                const settings = {
                    prefix: container.querySelector('#prefix').value || '!',
                    nickname: container.querySelector('#nickname').value || null,
                    deleteCommands: container.querySelector('#delete-commands').checked
                };

                await api.updateSettings(guildId, settings);
                toast.success('Settings saved!');
            } catch (error) {
                console.error('Failed to save settings:', error);
                toast.error('Failed to save settings');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '💾 Save Settings';
            }
        });
    }

    // Reset settings
    const resetBtn = container.querySelector('#reset-settings-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to reset all settings? This cannot be undone.')) {
                return;
            }

            resetBtn.disabled = true;

            try {
                await api.updateSettings(guildId, {});
                toast.success('Settings reset to default');
                // Refresh the panel
                window.location.reload();
            } catch (error) {
                console.error('Failed to reset settings:', error);
                toast.error('Failed to reset settings');
                resetBtn.disabled = false;
            }
        });
    }
}
