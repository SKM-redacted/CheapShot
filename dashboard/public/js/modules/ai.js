/**
 * CheapShot Dashboard - AI Chat Module
 * Configuration panel for AI chat features
 */

import { api } from '../api.js';
import { state } from '../state.js';
import { toast } from '../components/toast.js';

/**
 * Render the AI configuration panel content
 */
export async function render(guildId, data = {}) {
    // Fetch current config
    let config = {};
    try {
        config = await api.getModuleConfig(guildId, 'ai') || {};
    } catch (e) {
        console.warn('Could not load AI config:', e);
    }

    // Fetch available channels
    let channels = [];
    try {
        channels = await api.getChannels(guildId);
    } catch (e) {
        console.warn('Could not load channels:', e);
    }

    const textChannels = channels.filter(c => c.type === 0);

    return `
        <div class="module-config" data-module="ai">
            <!-- Enable/Disable -->
            <div class="form-group">
                <div class="flex items-center justify-between p-md" 
                     style="background: var(--glass-bg); border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
                    <div>
                        <div class="text-white font-medium">Enable AI Chat</div>
                        <div class="text-sm text-muted mt-xs">Allow the bot to respond with AI in configured channels</div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" class="toggle-input" id="ai-enabled" 
                               ${config.enabled ? 'checked' : ''}>
                        <span class="toggle-track">
                            <span class="toggle-thumb"></span>
                        </span>
                    </label>
                </div>
            </div>

            <div class="divider"></div>

            <!-- Channel Selection -->
            <div class="form-group">
                <label class="form-label">AI Response Channels</label>
                <p class="form-hint mb-md">
                    Select which channels the bot should respond in. 
                    The bot will only auto-respond to messages in these channels.
                </p>
                
                <div class="channel-list" id="channel-list">
                    ${textChannels.length === 0 ? `
                        <div class="empty-state p-lg">
                            <div class="text-muted">No text channels found</div>
                        </div>
                    ` : textChannels.map(channel => {
        const isSelected = config.channels?.[channel.name];
        return `
                            <label class="channel-item ${isSelected ? 'selected' : ''}" data-channel-id="${channel.id}">
                                <input type="checkbox" class="channel-checkbox" 
                                       value="${channel.id}" 
                                       data-name="${channel.name}"
                                       ${isSelected ? 'checked' : ''}>
                                <span class="channel-icon">#</span>
                                <span class="channel-name">${channel.name}</span>
                                ${isSelected ? '<span class="badge badge-ember">Active</span>' : ''}
                            </label>
                        `;
    }).join('')}
                </div>
            </div>

            <div class="divider"></div>

            <!-- Quick Actions -->
            <div class="form-group">
                <label class="form-label">Quick Setup</label>
                <div class="flex gap-sm flex-wrap">
                    <button class="btn btn-secondary btn-sm" id="auto-detect-btn">
                        🔍 Auto-Detect Channels
                    </button>
                    <button class="btn btn-secondary btn-sm" id="clear-channels-btn">
                        🗑️ Clear Selection
                    </button>
                </div>
                <p class="form-hint mt-sm">
                    Auto-detect will find channels named "cheapshot" or "cheapshot-private"
                </p>
            </div>

            <div class="divider"></div>

            <!-- AI Behavior Settings -->
            <h4 class="text-white mb-md">AI Behavior</h4>
            
            <div class="settings-list">
                <div class="setting-row">
                    <div class="setting-info">
                        <div class="text-white font-medium">Respond to @mentions</div>
                        <div class="text-sm text-muted">Bot responds when mentioned, even outside AI channels</div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" class="toggle-input" id="mention-respond" 
                               ${config.mentionRespond !== false ? 'checked' : ''}>
                        <span class="toggle-track">
                            <span class="toggle-thumb"></span>
                        </span>
                    </label>
                </div>

                <div class="setting-row">
                    <div class="setting-info">
                        <div class="text-white font-medium">Typing Indicator</div>
                        <div class="text-sm text-muted">Show typing indicator while generating responses</div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" class="toggle-input" id="typing-indicator" 
                               ${config.typingIndicator !== false ? 'checked' : ''}>
                        <span class="toggle-track">
                            <span class="toggle-thumb"></span>
                        </span>
                    </label>
                </div>
            </div>

            <div class="divider"></div>

            <!-- Save Button -->
            <div class="flex justify-end gap-md">
                <button class="btn btn-primary" id="save-ai-btn">
                    💾 Save Configuration
                </button>
            </div>
        </div>

        <style>
            .channel-list {
                max-height: 300px;
                overflow-y: auto;
                border: 1px solid var(--glass-border);
                border-radius: var(--radius-md);
                background: var(--graphite);
            }
            
            .channel-item {
                display: flex;
                align-items: center;
                gap: var(--space-md);
                padding: var(--space-md);
                border-bottom: 1px solid var(--glass-border);
                cursor: pointer;
                transition: background var(--transition-fast);
            }
            
            .channel-item:last-child {
                border-bottom: none;
            }
            
            .channel-item:hover {
                background: var(--glass-hover);
            }
            
            .channel-item.selected {
                background: var(--blush);
            }
            
            .channel-item input {
                display: none;
            }
            
            .channel-icon {
                color: var(--silver);
                font-weight: 500;
            }
            
            .channel-name {
                flex: 1;
                color: var(--cloud);
            }
            
            .channel-item.selected .channel-name {
                color: var(--white);
            }

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
        </style>
    `;
}

/**
 * Initialize event handlers for the AI config panel
 */
export function init(container, options = {}) {
    const { guildId } = options;

    // Toggle channel selection
    container.querySelectorAll('.channel-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const checkbox = item.querySelector('.channel-checkbox');
            checkbox.checked = !checkbox.checked;
            item.classList.toggle('selected', checkbox.checked);

            // Update badge
            let badge = item.querySelector('.badge');
            if (checkbox.checked && !badge) {
                badge = document.createElement('span');
                badge.className = 'badge badge-ember';
                badge.textContent = 'Active';
                item.appendChild(badge);
            } else if (!checkbox.checked && badge) {
                badge.remove();
            }
        });
    });

    // Auto-detect channels
    const autoDetectBtn = container.querySelector('#auto-detect-btn');
    if (autoDetectBtn) {
        autoDetectBtn.addEventListener('click', () => {
            container.querySelectorAll('.channel-item').forEach(item => {
                const name = item.querySelector('.channel-checkbox').dataset.name.toLowerCase();
                const shouldSelect = name.includes('cheapshot');

                item.querySelector('.channel-checkbox').checked = shouldSelect;
                item.classList.toggle('selected', shouldSelect);

                let badge = item.querySelector('.badge');
                if (shouldSelect && !badge) {
                    badge = document.createElement('span');
                    badge.className = 'badge badge-ember';
                    badge.textContent = 'Active';
                    item.appendChild(badge);
                } else if (!shouldSelect && badge) {
                    badge.remove();
                }
            });
            toast.success('Auto-detected CheapShot channels');
        });
    }

    // Clear selection
    const clearBtn = container.querySelector('#clear-channels-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            container.querySelectorAll('.channel-item').forEach(item => {
                item.querySelector('.channel-checkbox').checked = false;
                item.classList.remove('selected');
                const badge = item.querySelector('.badge');
                if (badge) badge.remove();
            });
            toast.info('Selection cleared');
        });
    }

    // Save configuration
    const saveBtn = container.querySelector('#save-ai-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';

            try {
                const enabled = container.querySelector('#ai-enabled').checked;
                const mentionRespond = container.querySelector('#mention-respond')?.checked ?? true;
                const typingIndicator = container.querySelector('#typing-indicator')?.checked ?? true;

                // Build channels config
                const channels = {};
                container.querySelectorAll('.channel-checkbox:checked').forEach(cb => {
                    const name = cb.dataset.name;
                    const id = cb.value;

                    // Determine type based on name
                    let type = 'public';
                    if (name.includes('private')) type = 'private';
                    if (name.includes('moderation') || name.includes('mod-log')) type = 'moderation';

                    channels[name] = { id, type };
                });

                // Save module config with behavior settings
                await api.updateModuleConfig(guildId, 'ai', {
                    enabled,
                    channels,
                    mentionRespond,
                    typingIndicator
                });

                // Also sync channel config
                await api.updateChannelConfig(guildId, channels);

                // Update local state so main UI reflects the change
                const guildData = state.getKey('guildData');
                if (guildData[guildId]) {
                    if (!guildData[guildId].settings) {
                        guildData[guildId].settings = {};
                    }
                    if (!guildData[guildId].settings.modules) {
                        guildData[guildId].settings.modules = {};
                    }
                    guildData[guildId].settings.modules.ai = {
                        enabled,
                        channels,
                        mentionRespond,
                        typingIndicator
                    };
                    state.set({ guildData });
                }

                // Update the main dashboard UI (module cards and stats)
                if (window.app) {
                    window.app.renderModuleGrid();
                    window.app.updateStats(guildId);
                }

                toast.success('AI configuration saved!');
            } catch (error) {
                console.error('Failed to save AI config:', error);
                toast.error('Failed to save configuration');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '💾 Save Configuration';
            }
        });
    }
}
