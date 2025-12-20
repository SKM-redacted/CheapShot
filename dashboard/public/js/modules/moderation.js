/**
 * CheapShot Dashboard - Moderation Module
 * Configuration panel for moderation features
 */

import { api } from '../api.js';
import { toast } from '../components/toast.js';

/**
 * Render the moderation configuration panel content
 */
export async function render(guildId, data = {}) {
    // Fetch current config
    let config = {};
    try {
        config = await api.getModuleConfig(guildId, 'moderation') || {};
    } catch (e) {
        console.warn('Could not load moderation config:', e);
    }

    const automod = config.automod || {};
    const logging = config.logging || {};

    // Fetch channels for logging selector
    let channels = [];
    try {
        channels = await api.getChannels(guildId);
    } catch (e) {
        console.warn('Could not load channels:', e);
    }

    const textChannels = channels.filter(c => c.type === 0);

    return `
        <div class="module-config" data-module="moderation">
            <!-- Enable/Disable -->
            <div class="form-group">
                <div class="flex items-center justify-between p-md" 
                     style="background: var(--glass-bg); border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
                    <div>
                        <div class="text-white font-medium">Enable Moderation</div>
                        <div class="text-sm text-muted mt-xs">AI-powered automatic moderation</div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" class="toggle-input" id="mod-enabled" 
                               ${config.enabled ? 'checked' : ''}>
                        <span class="toggle-track">
                            <span class="toggle-thumb"></span>
                        </span>
                    </label>
                </div>
            </div>

            <div class="divider"></div>

            <!-- Auto-Mod Settings -->
            <h4 class="text-white mb-md">Auto-Moderation</h4>
            
            <div class="settings-grid">
                <div class="setting-item">
                    <label class="checkbox">
                        <input type="checkbox" class="checkbox-input" id="automod-enabled" 
                               ${automod.enabled ? 'checked' : ''}>
                        <span class="checkbox-box"></span>
                        <span class="checkbox-label">Enable Auto-Mod</span>
                    </label>
                    <p class="form-hint">Automatically analyze messages for rule violations</p>
                </div>

                <div class="form-group">
                    <label class="form-label">Spam Detection</label>
                    <div class="flex gap-md items-center">
                        <input type="number" class="form-input" id="spam-threshold" 
                               value="${automod.spamThreshold || 5}" min="2" max="20" style="width: 80px;">
                        <span class="text-muted">messages per 5 seconds</span>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Caps Lock Filter</label>
                    <div class="flex gap-md items-center">
                        <input type="number" class="form-input" id="caps-threshold" 
                               value="${automod.capsPercentage || 70}" min="50" max="100" style="width: 80px;">
                        <span class="text-muted">% uppercase to trigger</span>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Warning Threshold</label>
                    <div class="flex gap-md items-center">
                        <input type="number" class="form-input" id="warning-threshold" 
                               value="${automod.warningThreshold || 3}" min="1" max="10" style="width: 80px;">
                        <span class="text-muted">warnings before timeout</span>
                    </div>
                </div>
            </div>

            <div class="divider"></div>

            <!-- Logging Settings -->
            <h4 class="text-white mb-md">Mod Log Channel</h4>
            
            <div class="form-group">
                <label class="form-label">Log Channel</label>
                <select class="form-select" id="log-channel">
                    <option value="">None (Disable Logging)</option>
                    ${textChannels.map(c => `
                        <option value="${c.id}" ${logging.channelId === c.id ? 'selected' : ''}>
                            # ${c.name}
                        </option>
                    `).join('')}
                </select>
                <p class="form-hint">Where to send moderation logs and alerts</p>
            </div>

            <div class="settings-grid mt-md">
                <label class="checkbox">
                    <input type="checkbox" class="checkbox-input" id="log-deletes" 
                           ${logging.logDeletes !== false ? 'checked' : ''}>
                    <span class="checkbox-box"></span>
                    <span class="checkbox-label">Log message deletions</span>
                </label>

                <label class="checkbox">
                    <input type="checkbox" class="checkbox-input" id="log-edits" 
                           ${logging.logEdits !== false ? 'checked' : ''}>
                    <span class="checkbox-box"></span>
                    <span class="checkbox-label">Log message edits</span>
                </label>

                <label class="checkbox">
                    <input type="checkbox" class="checkbox-input" id="log-joins" 
                           ${logging.logJoins ? 'checked' : ''}>
                    <span class="checkbox-box"></span>
                    <span class="checkbox-label">Log member joins</span>
                </label>

                <label class="checkbox">
                    <input type="checkbox" class="checkbox-input" id="log-leaves" 
                           ${logging.logLeaves ? 'checked' : ''}>
                    <span class="checkbox-box"></span>
                    <span class="checkbox-label">Log member leaves</span>
                </label>
            </div>

            <div class="divider"></div>

            <!-- Save Button -->
            <div class="flex justify-end gap-md">
                <button class="btn btn-primary" id="save-mod-btn">
                    💾 Save Configuration
                </button>
            </div>
        </div>

        <style>
            .settings-grid {
                display: grid;
                gap: var(--space-md);
            }
            
            .setting-item {
                padding: var(--space-md);
                background: var(--graphite);
                border-radius: var(--radius-md);
                border: 1px solid var(--glass-border);
            }
            
            .setting-item .form-hint {
                margin-left: calc(20px + var(--space-sm));
                margin-top: var(--space-xs);
                margin-bottom: 0;
            }
        </style>
    `;
}

/**
 * Initialize event handlers for the moderation config panel
 */
export function init(container, options = {}) {
    const { guildId } = options;

    // Save configuration
    const saveBtn = container.querySelector('#save-mod-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';

            try {
                const config = {
                    enabled: container.querySelector('#mod-enabled').checked,
                    automod: {
                        enabled: container.querySelector('#automod-enabled').checked,
                        spamThreshold: parseInt(container.querySelector('#spam-threshold').value, 10),
                        capsPercentage: parseInt(container.querySelector('#caps-threshold').value, 10),
                        warningThreshold: parseInt(container.querySelector('#warning-threshold').value, 10)
                    },
                    logging: {
                        channelId: container.querySelector('#log-channel').value || null,
                        logDeletes: container.querySelector('#log-deletes').checked,
                        logEdits: container.querySelector('#log-edits').checked,
                        logJoins: container.querySelector('#log-joins').checked,
                        logLeaves: container.querySelector('#log-leaves').checked
                    }
                };

                await api.updateModuleConfig(guildId, 'moderation', config);
                toast.success('Moderation settings saved!');
            } catch (error) {
                console.error('Failed to save moderation config:', error);
                toast.error('Failed to save configuration');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '💾 Save Configuration';
            }
        });
    }
}
