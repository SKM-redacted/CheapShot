/**
 * CheapShot Dashboard - Welcome Module (Placeholder)
 * Configuration for welcome messages and auto-roles
 */

export async function render(guildId, data = {}) {
    return `
        <div class="module-config" data-module="welcome" style="position: relative; min-height: 300px;">
            <div class="coming-soon-overlay">
                <div class="coming-soon-badge">Coming Soon</div>
                <p class="coming-soon-text">
                    Welcome messages will greet new members with customizable 
                    messages and auto-assign roles.
                </p>
            </div>

            <!-- Placeholder content -->
            <div style="opacity: 0.3;">
                <div class="form-group">
                    <label class="form-label">Welcome Channel</label>
                    <select class="form-select" disabled>
                        <option># welcome</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Welcome Message</label>
                    <textarea class="form-textarea" disabled>Welcome to the server, {user}! 🎉</textarea>
                </div>
            </div>
        </div>
    `;
}

export function init(container, options = {}) {
    // Placeholder
}
