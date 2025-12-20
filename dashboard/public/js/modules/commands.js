/**
 * CheapShot Dashboard - Commands Module (Placeholder)
 * Configuration for custom bot commands
 */

import { toast } from '../components/toast.js';

export async function render(guildId, data = {}) {
    return `
        <div class="module-config" data-module="commands" style="position: relative; min-height: 300px;">
            <div class="coming-soon-overlay">
                <div class="coming-soon-badge">Coming Soon</div>
                <p class="coming-soon-text">
                    Custom commands will let you create personalized bot responses 
                    for your server.
                </p>
            </div>

            <!-- Placeholder content -->
            <div class="form-group" style="opacity: 0.3;">
                <label class="form-label">Your Commands</label>
                <div class="command-list">
                    <div class="command-item">
                        <code class="command-trigger">!hello</code>
                        <span class="command-response">Hello {user}! Welcome to the server!</span>
                        <div class="command-actions">
                            <button class="btn btn-ghost btn-sm">✏️</button>
                            <button class="btn btn-ghost btn-sm">🗑️</button>
                        </div>
                    </div>
                    <div class="command-item">
                        <code class="command-trigger">!rules</code>
                        <span class="command-response">Check out <#rules> for server rules...</span>
                        <div class="command-actions">
                            <button class="btn btn-ghost btn-sm">✏️</button>
                            <button class="btn btn-ghost btn-sm">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function init(container, options = {}) {
    // Placeholder - no functionality yet
}
