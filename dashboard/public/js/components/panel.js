/**
 * CheapShot Dashboard - Panel Component
 * Slide-out configuration panel manager
 */

import state from '../state.js';

class PanelManager {
    constructor() {
        this.panel = null;
        this.overlay = null;
        this.content = null;
        this.currentModule = null;
        this.onSave = null;
        this.onCancel = null;
    }

    /**
     * Initialize panel elements
     */
    init() {
        this.panel = document.getElementById('config-panel');
        this.overlay = document.getElementById('panel-overlay');
        this.content = document.getElementById('panel-content');
        this.mainWrapper = document.getElementById('main-wrapper');

        // Close button
        document.getElementById('panel-close').addEventListener('click', () => this.close());
        document.getElementById('panel-cancel').addEventListener('click', () => this.close());

        // Overlay click closes panel
        this.overlay.addEventListener('click', () => this.close());

        // Save button
        document.getElementById('panel-save').addEventListener('click', () => this.save());

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.get('panelOpen')) {
                this.close();
            }
        });
    }

    /**
     * Open panel with module content
     */
    async open(moduleId, title, icon, contentHtml, options = {}) {
        this.currentModule = moduleId;
        this.onSave = options.onSave || null;
        this.onCancel = options.onCancel || null;

        // Update header
        document.getElementById('panel-icon').textContent = icon;
        document.getElementById('panel-title').textContent = title;

        // Load content
        if (typeof contentHtml === 'string') {
            this.content.innerHTML = contentHtml;
        } else if (contentHtml instanceof HTMLElement) {
            this.content.innerHTML = '';
            this.content.appendChild(contentHtml);
        }

        // Show/hide footer based on options
        const footer = document.getElementById('panel-footer');
        footer.classList.toggle('hidden', options.hideFooter === true);

        // Update save button text
        const saveBtn = document.getElementById('panel-save');
        saveBtn.textContent = options.saveText || 'Save Changes';
        saveBtn.disabled = false;

        // Show panel
        this.panel.classList.add('open');
        this.overlay.classList.add('visible');
        this.mainWrapper.classList.add('panel-open');
        state.set('panelOpen', true);
        state.set('activeModule', moduleId);

        // Run init callback if provided
        if (options.onInit) {
            await options.onInit(this.content);
        }
    }

    /**
     * Close panel
     */
    close() {
        // Check for unsaved changes
        if (state.get('unsavedChanges')) {
            if (!confirm('You have unsaved changes. Discard them?')) {
                return;
            }
        }

        this.panel.classList.remove('open');
        this.overlay.classList.remove('visible');
        this.mainWrapper.classList.remove('panel-open');
        state.set('panelOpen', false);
        state.set('activeModule', null);
        state.set('unsavedChanges', false);

        if (this.onCancel) {
            this.onCancel();
        }

        // Clear content after animation
        setTimeout(() => {
            this.content.innerHTML = '';
            this.currentModule = null;
        }, 300);
    }

    /**
     * Save panel changes
     */
    async save() {
        const saveBtn = document.getElementById('panel-save');
        const originalText = saveBtn.textContent;

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            if (this.onSave) {
                await this.onSave(this.content);
            }

            state.set('unsavedChanges', false);

            // Show success state briefly
            saveBtn.textContent = '✓ Saved!';
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }, 1500);

        } catch (error) {
            console.error('Save failed:', error);
            saveBtn.textContent = 'Save Failed';
            saveBtn.disabled = false;
            setTimeout(() => {
                saveBtn.textContent = originalText;
            }, 2000);
            throw error;
        }
    }

    /**
     * Update panel content without reopening
     */
    updateContent(html) {
        if (typeof html === 'string') {
            this.content.innerHTML = html;
        } else if (html instanceof HTMLElement) {
            this.content.innerHTML = '';
            this.content.appendChild(html);
        }
    }

    /**
     * Check if panel is open
     */
    isOpen() {
        return state.get('panelOpen');
    }

    /**
     * Get current module
     */
    getCurrentModule() {
        return this.currentModule;
    }
}

// Singleton instance
export const panel = new PanelManager();
export default panel;
