/**
 * CheapShot Dashboard - Leveling Module (Placeholder)
 * Configuration for XP and leveling system
 */

export async function render(guildId, data = {}) {
    return `
        <div class="module-config" data-module="leveling" style="position: relative; min-height: 300px;">
            <div class="coming-soon-overlay">
                <div class="coming-soon-badge">Coming Soon</div>
                <p class="coming-soon-text">
                    The leveling system will reward members with XP for activity 
                    and grant level-based roles.
                </p>
            </div>

            <!-- Placeholder content -->
            <div style="opacity: 0.3;">
                <div class="form-group">
                    <label class="form-label">XP per Message</label>
                    <input type="number" class="form-input" value="15" disabled style="width: 100px;">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Level Roles</label>
                    <div class="level-role-item">
                        <input class="form-input level-role-level" value="5" disabled>
                        <span class="level-role-arrow">→</span>
                        <select class="form-select level-role-select" disabled>
                            <option>@Active Member</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function init(container, options = {}) {
    // Placeholder
}
