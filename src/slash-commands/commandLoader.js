import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../ai/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Stores all loaded slash commands
 * Each command module should export:
 * - commands: Array of SlashCommandBuilder.toJSON() objects
 * - handleCommand: async function(interaction) => boolean (returns true if handled)
 */
const loadedModules = [];
let allCommands = [];

/**
 * Recursively load all slash command modules from a directory
 * @param {string} directory - Directory to load from
 */
async function loadSlashCommandsRecursively(directory) {
    if (!fs.existsSync(directory)) {
        logger.warn('SLASH_LOADER', `Directory not found: ${directory}`);
        return;
    }

    const files = fs.readdirSync(directory, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(directory, file.name);

        if (file.isDirectory()) {
            // Recursively load subdirectories
            await loadSlashCommandsRecursively(fullPath);
        } else if (file.name.endsWith('.js') && file.name !== 'commandLoader.js') {
            try {
                // Convert to file URL for ESM import
                const fileUrl = `file://${fullPath.replace(/\\/g, '/')}`;
                const module = await import(fileUrl);

                // Check for commands array (new format)
                if (module.contextCommands && Array.isArray(module.contextCommands)) {
                    allCommands.push(...module.contextCommands);
                    loadedModules.push({
                        name: file.name,
                        commands: module.contextCommands,
                        handler: module.handleContextCommand
                    });
                    logger.info('SLASH_LOADER', `✅ Loaded context commands from: ${file.name}`);
                }
                // Check for voiceCommands (existing format)
                else if (module.voiceCommands && Array.isArray(module.voiceCommands)) {
                    allCommands.push(...module.voiceCommands);
                    loadedModules.push({
                        name: file.name,
                        commands: module.voiceCommands,
                        handler: module.handleVoiceCommand
                    });
                    logger.info('SLASH_LOADER', `✅ Loaded voice commands from: ${file.name}`);
                }
                // Generic commands export
                else if (module.commands && Array.isArray(module.commands)) {
                    allCommands.push(...module.commands);
                    loadedModules.push({
                        name: file.name,
                        commands: module.commands,
                        handler: module.handleCommand || module.execute
                    });
                    logger.info('SLASH_LOADER', `✅ Loaded commands from: ${file.name}`);
                }
                // Single command with data property
                else if (module.data) {
                    const cmdData = typeof module.data.toJSON === 'function' ? module.data.toJSON() : module.data;
                    allCommands.push(cmdData);
                    loadedModules.push({
                        name: file.name,
                        commands: [cmdData],
                        handler: module.execute,
                        modalHandler: module.handleModalSubmit,
                        buttonHandler: module.handleButtonInteraction
                    });
                    logger.info('SLASH_LOADER', `✅ Loaded command: ${cmdData.name} from ${file.name}`);
                }
            } catch (error) {
                logger.error('SLASH_LOADER', `❌ Failed to load ${fullPath}:`, error);
            }
        }
    }
}

/**
 * Load all slash commands from src/slash-commands directory
 */
export async function loadAllSlashCommands() {
    allCommands = [];
    loadedModules.length = 0;

    logger.info('SLASH_LOADER', '--- Loading Slash Commands ---');

    // Load from src/slash-commands (misc commands)
    await loadSlashCommandsRecursively(__dirname);

    // Load from src/economy/economy/commands (economy commands)
    const economyCommandsPath = path.join(__dirname, '..', 'economy', 'economy', 'commands');
    await loadSlashCommandsRecursively(economyCommandsPath);

    logger.info('SLASH_LOADER', `--- Loaded ${allCommands.length} total slash command(s) ---`);

    return { commands: allCommands, modules: loadedModules };
}

/**
 * Get all loaded commands (call after loadAllSlashCommands)
 */
export function getAllCommands() {
    return allCommands;
}

/**
 * Get all loaded modules with their handlers
 */
export function getLoadedModules() {
    return loadedModules;
}

/**
 * Handle an interaction by passing it through all loaded command handlers
 * @param {Object} interaction - Discord interaction
 * @returns {boolean} True if handled by any module
 */
export async function handleSlashInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;

    for (const module of loadedModules) {
        if (module.handler) {
            try {
                const handled = await module.handler(interaction);
                if (handled) return true;
            } catch (error) {
                logger.error('SLASH_LOADER', `Error in handler from ${module.name}:`, error);
            }
        }
    }

    return false;
}

/**
 * Handle a modal submission by passing it through all loaded modal handlers
 * @param {Object} interaction - Modal submit interaction
 * @returns {boolean} True if handled by any module
 */
export async function handleModalInteraction(interaction) {
    if (!interaction.isModalSubmit()) return false;

    for (const module of loadedModules) {
        if (module.modalHandler) {
            try {
                const handled = await module.modalHandler(interaction);
                if (handled) return true;
            } catch (error) {
                logger.error('SLASH_LOADER', `Error in modal handler from ${module.name}:`, error);
            }
        }
    }

    return false;
}

/**
 * Handle a button interaction by passing it through all loaded button handlers
 * @param {Object} interaction - Button interaction
 * @returns {boolean} True if handled by any module
 */
export async function handleButtonInteraction(interaction) {
    if (!interaction.isButton()) return false;

    for (const module of loadedModules) {
        if (module.buttonHandler) {
            try {
                const handled = await module.buttonHandler(interaction);
                if (handled) return true;
            } catch (error) {
                logger.error('SLASH_LOADER', `Error in button handler from ${module.name}:`, error);
            }
        }
    }

    return false;
}

/**
 * Generate a summary of all slash commands for the AI system prompt
 * @returns {string} Formatted summary of available slash commands
 */
export function getSlashCommandsSummary() {
    if (allCommands.length === 0) {
        return '';
    }

    let summary = `\nYOUR SLASH COMMANDS (IMPORTANT - THESE ARE YOUR COMMANDS):\n`;
    summary += `The following slash commands are YOUR built-in commands that users can invoke:\n`;

    for (const cmd of allCommands) {
        const name = cmd.name;
        const description = cmd.description || 'No description';

        // Check for subcommands
        if (cmd.options && cmd.options.length > 0) {
            const subcommands = cmd.options.filter(opt => opt.type === 1); // type 1 = subcommand
            if (subcommands.length > 0) {
                for (const sub of subcommands) {
                    summary += `- /${name} ${sub.name} - ${sub.description || 'No description'}\n`;
                }
            } else {
                summary += `- /${name} - ${description}\n`;
            }
        } else {
            summary += `- /${name} - ${description}\n`;
        }
    }

    summary += `\nIf a user mentions or types one of these commands in chat (like "/citizen register" or "citizen register"), recognize it as YOUR command and guide them to use the slash command properly by typing / in Discord to see the autocomplete menu.\n`;

    return summary;
}
