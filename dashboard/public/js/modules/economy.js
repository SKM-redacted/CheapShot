/**
 * CheapShot Dashboard - Economy Module (Placeholder)
 * Configuration for currency and shop system
 */

export async function render(guildId, data = {}) {
    return `
        <div class="module-config" data-module="economy" style="position: relative; min-height: 300px;">
            <div class="coming-soon-overlay">
                <div class="coming-soon-badge">Coming Soon</div>
                <p class="coming-soon-text">
                    The economy system will let members earn and spend currency 
                    on custom shop items and rewards.
                </p>
            </div>

            <!-- Placeholder content -->
            <div style="opacity: 0.3;">
                <div class="form-group">
                    <label class="form-label">Currency Name</label>
                    <input type="text" class="form-input" value="Coins" disabled style="width: 150px;">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Currency Emoji</label>
                    <input type="text" class="form-input" value="🪙" disabled style="width: 80px;">
                </div>

                <div class="form-group">
                    <label class="form-label">Daily Reward</label>
                    <input type="number" class="form-input" value="100" disabled style="width: 100px;">
                </div>
            </div>
        </div>
    `;
}

export function init(container, options = {}) {
    // Placeholder
}
