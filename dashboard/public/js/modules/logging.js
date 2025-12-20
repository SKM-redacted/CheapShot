/**
 * CheapShot Dashboard - Logging Module (Placeholder)
 * Configuration for event and message logging
 */

import { api } from '../api.js';
import { toast } from '../components/toast.js';

export async function render(guildId, data = {}) {
    // Fetch channels
    let channels = [];
    try {
        channels = await api.getChannels(guildId);
    } catch (e) {
        console.warn('Could not load channels:', e);
    }

    const textChannels = channels.filter(c => c.type === 0);

    return `
        <div class="module-config" data-module="logging">
            <div class="form-group">
                <div class="flex items-center justify-between p-md" 
                     style="background: var(--glass-bg); border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
                    <div>
                        <div class="text-white font-medium">Enable Logging</div>
                        <div class="text-sm text-muted mt-xs">Log events and actions to designated channels</div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" class="toggle-input" id="logging-enabled">
                        <span class="toggle-track">
                            <span class="toggle-thumb"></span>
                        </span>
                    </label>
                </div>
            </div>

            <div class="divider"></div>

            <h4 class="text-white mb-md">Log Channels</h4>

            <div class="form-group">
                <label class="form-label">Message Logs</label>
                <select class="form-select" id="msg-log-channel">
                    <option value="">Disabled</option>
                    ${textChannels.map(c => `<option value="${c.id}"># ${c.name}</option>`).join('')}
                </select>
                <p class="form-hint">Logs message edits and deletions</p>
            </div>

            <div class="form-group">
                <label class="form-label">Member Logs</label>
                <select class="form-select" id="member-log-channel">
                    <option value="">Disabled</option>
                    ${textChannels.map(c => `<option value="${c.id}"># ${c.name}</option>`).join('')}
                </select>
                <p class="form-hint">Logs joins, leaves, and role changes</p>
            </div>

            <div class="form-group">
                <label class="form-label">Moderation Logs</label>
                <select class="form-select" id="mod-log-channel">
                    <option value="">Disabled</option>
                    ${textChannels.map(c => `<option value="${c.id}"># ${c.name}</option>`).join('')}
                </select>
                <p class="form-hint">Logs bans, kicks, timeouts, and warnings</p>
            </div>

            <div class="divider"></div>

            <div class="flex justify-end gap-md">
                <button class="btn btn-primary" id="save-logging-btn">
                    💾 Save Configuration
                </button>
            </div>
        </div>
    `;
}

export function init(container, options = {}) {
    const { guildId } = options;

    const saveBtn = container.querySelector('#save-logging-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';

            try {
                const config = {
                    enabled: container.querySelector('#logging-enabled').checked,
                    messageLogChannel: container.querySelector('#msg-log-channel').value || null,
                    memberLogChannel: container.querySelector('#member-log-channel').value || null,
                    modLogChannel: container.querySelector('#mod-log-channel').value || null
                };

                await api.updateModuleConfig(guildId, 'logging', config);
                toast.success('Logging configuration saved!');
            } catch (error) {
                console.error('Failed to save logging config:', error);
                toast.error('Failed to save configuration');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '💾 Save Configuration';
            }
        });
    }
}
