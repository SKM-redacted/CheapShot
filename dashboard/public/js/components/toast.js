/**
 * CheapShot Dashboard - Toast Notifications
 * Beautiful notification system
 */

class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.counter = 0;
    }

    /**
     * Initialize toast container
     */
    init() {
        // Create container if it doesn't exist
        this.container = document.getElementById('toast-container');

        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show a toast notification
     * @param {Object} options - { message, type, duration, icon }
     */
    show(options = {}) {
        const {
            message = '',
            type = 'info', // success, error, warning, info
            duration = 5000,
            icon = null
        } = options;

        const id = ++this.counter;

        // Default icons by type
        const defaultIcons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.dataset.toastId = id;
        toast.innerHTML = `
            <span class="toast-icon">${icon || defaultIcons[type] || ''}</span>
            <div class="toast-content">
                <span class="toast-message">${message}</span>
            </div>
            <button class="toast-close" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        `;

        // Add close handler
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.dismiss(id);
        });

        // Add to container
        this.container.appendChild(toast);
        this.toasts.push({ id, element: toast, timeout: null });

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto dismiss after duration
        if (duration > 0) {
            const toastData = this.toasts.find(t => t.id === id);
            if (toastData) {
                toastData.timeout = setTimeout(() => {
                    this.dismiss(id);
                }, duration);
            }
        }

        return id;
    }

    /**
     * Dismiss a toast by ID
     */
    dismiss(id) {
        const index = this.toasts.findIndex(t => t.id === id);
        if (index === -1) return;

        const toastData = this.toasts[index];

        // Clear timeout if exists
        if (toastData.timeout) {
            clearTimeout(toastData.timeout);
        }

        // Animate out
        toastData.element.classList.remove('show');

        // Remove from DOM after animation
        setTimeout(() => {
            toastData.element.remove();
            this.toasts.splice(index, 1);
        }, 400);
    }

    /**
     * Dismiss all toasts
     */
    dismissAll() {
        [...this.toasts].forEach(t => this.dismiss(t.id));
    }

    // Convenience methods
    success(message, duration) {
        return this.show({ message, type: 'success', duration });
    }

    error(message, duration) {
        return this.show({ message, type: 'error', duration });
    }

    warning(message, duration) {
        return this.show({ message, type: 'warning', duration });
    }

    info(message, duration) {
        return this.show({ message, type: 'info', duration });
    }
}

// Export singleton
export const toast = new ToastManager();
export default toast;
