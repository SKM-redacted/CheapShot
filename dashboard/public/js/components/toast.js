/**
 * CheapShot Dashboard - Toast Notifications
 */

class ToastManager {
    constructor() {
        this.container = null;
    }

    init() {
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            document.body.appendChild(this.container);
        }

        // Add styles if not already present
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                #toast-container {
                    position: fixed;
                    top: 1rem;
                    right: 1rem;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    pointer-events: none;
                }

                .toast {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    padding: 0.875rem 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    min-width: 280px;
                    max-width: 400px;
                    box-shadow: var(--shadow-lg);
                    pointer-events: auto;
                    transform: translateX(120%);
                    opacity: 0;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .toast.show {
                    transform: translateX(0);
                    opacity: 1;
                }

                .toast-icon {
                    font-size: 1.25rem;
                    flex-shrink: 0;
                }

                .toast-content {
                    flex: 1;
                    min-width: 0;
                }

                .toast-message {
                    font-size: 0.9rem;
                    line-height: 1.4;
                }

                .toast-close {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 0.25rem;
                    font-size: 1rem;
                    line-height: 1;
                    transition: color 0.15s;
                }

                .toast-close:hover {
                    color: var(--text-primary);
                }

                .toast.success {
                    border-color: var(--success);
                    background: linear-gradient(135deg, rgba(59, 165, 93, 0.1) 0%, var(--bg-card) 100%);
                }

                .toast.error {
                    border-color: var(--danger);
                    background: linear-gradient(135deg, rgba(237, 66, 69, 0.1) 0%, var(--bg-card) 100%);
                }

                .toast.warning {
                    border-color: var(--warning);
                    background: linear-gradient(135deg, rgba(250, 166, 26, 0.1) 0%, var(--bg-card) 100%);
                }

                .toast.info {
                    border-color: var(--accent-primary);
                    background: linear-gradient(135deg, rgba(88, 101, 242, 0.1) 0%, var(--bg-card) 100%);
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Show a toast notification
     */
    show(message, type = 'info', duration = 4000) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">×</button>
        `;

        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.hide(toast);
        });

        this.container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto-hide
        if (duration > 0) {
            setTimeout(() => this.hide(toast), duration);
        }

        return toast;
    }

    hide(toast) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }

    // Convenience methods
    success(message, duration) { return this.show(message, 'success', duration); }
    error(message, duration) { return this.show(message, 'error', duration); }
    warning(message, duration) { return this.show(message, 'warning', duration); }
    info(message, duration) { return this.show(message, 'info', duration); }
}

export const toast = new ToastManager();
export default toast;
