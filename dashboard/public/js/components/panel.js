/**
 * CheapShot Dashboard - Panel Component
 * Handles the slide-out configuration panel
 */

class PanelManager {
    constructor() {
        this.overlay = null;
        this.panel = null;
        this.currentModule = null;
        this.isOpen = false;
        this.onCloseCallback = null;
    }

    /**
     * Initialize panel elements
     */
    init() {
        this.overlay = document.getElementById('panel-overlay');
        this.panel = document.getElementById('slide-panel');

        if (!this.overlay || !this.panel) {
            console.error('Panel elements not found');
            return;
        }

        // Close on overlay click
        this.overlay.addEventListener('click', () => this.close());

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Close button
        const closeBtn = this.panel.querySelector('.panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
    }

    /**
     * Open the panel with specific content
     * @param {Object} options - { title, icon, content, wide, onClose }
     */
    async open(options = {}) {
        const { title = 'Configuration', icon = '⚙️', content = '', wide = false, onClose = null } = options;

        this.onCloseCallback = onClose;

        // Set panel width
        this.panel.classList.toggle('wide', wide);

        // Set header
        const titleEl = this.panel.querySelector('.panel-title');
        if (titleEl) {
            titleEl.innerHTML = `
                <span class="panel-title-icon">${icon}</span>
                ${title}
            `;
        }

        // Set body content
        const bodyEl = this.panel.querySelector('.panel-body');
        if (bodyEl) {
            if (typeof content === 'string') {
                bodyEl.innerHTML = content;
            } else if (content instanceof HTMLElement) {
                bodyEl.innerHTML = '';
                bodyEl.appendChild(content);
            }
        }

        // Show panel
        this.overlay.classList.add('active');
        this.panel.classList.add('active');
        this.isOpen = true;

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Focus first input if any
        setTimeout(() => {
            const firstInput = bodyEl.querySelector('input, select, textarea');
            if (firstInput) firstInput.focus();
        }, 300);
    }

    /**
     * Load module content into panel
     * @param {string} moduleName - Name of the module to load
     * @param {Object} moduleConfig - Configuration for the module
     */
    async openModule(moduleName, moduleConfig = {}) {
        this.currentModule = moduleName;

        // Show loading state
        await this.open({
            title: moduleConfig.title || moduleName,
            icon: moduleConfig.icon || '📦',
            content: `
                <div class="flex items-center justify-center p-xl">
                    <div class="spinner"></div>
                </div>
            `,
            wide: moduleConfig.wide || false
        });

        try {
            // Dynamically import the module
            const module = await import(`../modules/${moduleName}.js`);

            if (module.render) {
                const content = await module.render(moduleConfig.guildId, moduleConfig.data);
                const bodyEl = this.panel.querySelector('.panel-body');

                if (typeof content === 'string') {
                    bodyEl.innerHTML = content;
                } else {
                    bodyEl.innerHTML = '';
                    bodyEl.appendChild(content);
                }

                // Initialize module if it has an init function
                if (module.init) {
                    await module.init(bodyEl, moduleConfig);
                }
            }
        } catch (error) {
            console.error(`Failed to load module ${moduleName}:`, error);
            this.setContent(`
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <h3 class="empty-state-title">Failed to load</h3>
                    <p class="empty-state-text">Could not load the ${moduleName} module.</p>
                </div>
            `);
        }
    }

    /**
     * Update panel body content
     */
    setContent(content) {
        const bodyEl = this.panel?.querySelector('.panel-body');
        if (bodyEl) {
            if (typeof content === 'string') {
                bodyEl.innerHTML = content;
            } else {
                bodyEl.innerHTML = '';
                bodyEl.appendChild(content);
            }
        }
    }

    /**
     * Update panel footer
     */
    setFooter(content) {
        const footerEl = this.panel?.querySelector('.panel-footer');
        if (footerEl) {
            if (typeof content === 'string') {
                footerEl.innerHTML = content;
            } else {
                footerEl.innerHTML = '';
                footerEl.appendChild(content);
            }
            footerEl.classList.toggle('hidden', !content);
        }
    }

    /**
     * Close the panel
     */
    close() {
        if (!this.isOpen) return;

        this.overlay.classList.remove('active');
        this.panel.classList.remove('active');
        this.isOpen = false;
        this.currentModule = null;

        // Restore body scroll
        document.body.style.overflow = '';

        // Call close callback if set
        if (this.onCloseCallback) {
            this.onCloseCallback();
            this.onCloseCallback = null;
        }
    }

    /**
     * Check if panel is currently open
     */
    getIsOpen() {
        return this.isOpen;
    }
}

// Export singleton
export const panel = new PanelManager();
export default panel;
