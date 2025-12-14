import { PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';

/**
 * Permission Checker - Validates user permissions before tool execution
 * 
 * This acts as a security layer to ensure users can only trigger
 * tools for actions they would be allowed to do manually.
 */

/**
 * Map of tool names to required Discord permissions
 * Each tool can require one or more permissions
 */
const TOOL_PERMISSIONS = {
    'create_voice_channel': [PermissionFlagsBits.ManageChannels],
    'create_text_channel': [PermissionFlagsBits.ManageChannels],
    'create_category': [PermissionFlagsBits.ManageChannels],
    'delete_channel': [PermissionFlagsBits.ManageChannels],
    'delete_channels_bulk': [PermissionFlagsBits.ManageChannels],
    'setup_server_structure': [PermissionFlagsBits.ManageChannels],
    'rename_channel': [PermissionFlagsBits.ManageChannels],
    'move_channel': [PermissionFlagsBits.ManageChannels],
    'create_role': [PermissionFlagsBits.ManageRoles],
    'delete_role': [PermissionFlagsBits.ManageRoles],
    'assign_role': [PermissionFlagsBits.ManageRoles],
    'kick_member': [PermissionFlagsBits.KickMembers],
    'ban_member': [PermissionFlagsBits.BanMembers],
    'timeout_member': [PermissionFlagsBits.ModerateMembers],
    'move_member': [PermissionFlagsBits.MoveMembers],
    'manage_messages': [PermissionFlagsBits.ManageMessages],
    'list_channels': [PermissionFlagsBits.ManageChannels], // Requires manage channels due to private channels
    // These don't need special permissions
    'generate_image': [],
    'image_generation': [],
};

/**
 * Human-readable permission names for error messages
 */
const PERMISSION_NAMES = {
    [PermissionFlagsBits.ManageChannels]: 'Manage Channels',
    [PermissionFlagsBits.ManageRoles]: 'Manage Roles',
    [PermissionFlagsBits.KickMembers]: 'Kick Members',
    [PermissionFlagsBits.BanMembers]: 'Ban Members',
    [PermissionFlagsBits.ModerateMembers]: 'Timeout Members',
    [PermissionFlagsBits.MoveMembers]: 'Move Members',
    [PermissionFlagsBits.ManageMessages]: 'Manage Messages',
    [PermissionFlagsBits.Administrator]: 'Administrator',
};

/**
 * Check if a user has permission to execute a specific tool
 * 
 * @param {Object} member - Discord GuildMember object
 * @param {string} toolName - Name of the tool being executed
 * @param {Object} guild - Discord Guild object (optional, for logging)
 * @returns {{allowed: boolean, error?: string, missingPermissions?: string[]}}
 */
export function checkToolPermission(member, toolName, guild = null) {
    // If no member context, deny by default (safety first)
    if (!member) {
        logger.warn('PERMISSION', `No member context for tool "${toolName}" - denying`);
        return {
            allowed: false,
            error: 'Error 502: Unable to verify your permissions. Please try again.',
            code: 502
        };
    }

    // Get required permissions for this tool
    const requiredPermissions = TOOL_PERMISSIONS[toolName];

    // If tool isn't in our map, DENY by default for security
    // Unknown tools should be explicitly added to the map
    if (requiredPermissions === undefined) {
        logger.warn('PERMISSION', `Tool "${toolName}" not in permission map - DENYING for security`);
        return {
            allowed: false,
            error: `Error 502: This action is not configured. Please contact an administrator.`,
            code: 502
        };
    }

    // No permissions required for this tool
    if (requiredPermissions.length === 0) {
        return { allowed: true };
    }

    // Check if user is an administrator (admins can do anything)
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        logger.debug('PERMISSION', `${member.displayName} is admin - allowing "${toolName}"`);
        return { allowed: true };
    }

    // Check each required permission
    const missingPermissions = [];
    for (const permission of requiredPermissions) {
        if (!member.permissions.has(permission)) {
            const permName = PERMISSION_NAMES[permission] || `Permission ${permission}`;
            missingPermissions.push(permName);
        }
    }

    // If any permissions are missing, deny
    if (missingPermissions.length > 0) {
        const guildName = guild?.name || 'this server';
        logger.info('PERMISSION', `${member.displayName} denied "${toolName}" - missing: ${missingPermissions.join(', ')}`);
        return {
            allowed: false,
            error: `Error 502: You don't have permission to do that. You need: ${missingPermissions.join(', ')}`,
            missingPermissions,
            code: 502
        };
    }

    // All permissions satisfied
    logger.debug('PERMISSION', `${member.displayName} authorized for "${toolName}"`);
    return { allowed: true };
}

/**
 * Get a user-friendly error message for permission denial
 * @param {string} toolName - The tool that was denied
 * @param {string[]} missingPermissions - List of missing permission names
 * @returns {string} User-friendly error message
 */
export function getPermissionDeniedMessage(toolName, missingPermissions = []) {
    const actionName = getToolActionName(toolName);

    if (missingPermissions.length > 0) {
        return `Error 502: You don't have permission to ${actionName}. Required: ${missingPermissions.join(', ')}.`;
    }

    return `Error 502: You don't have permission to ${actionName}.`;
}

/**
 * Get a human-readable action name for a tool
 * @param {string} toolName - The tool name
 * @returns {string} Human-readable action description
 */
function getToolActionName(toolName) {
    const actionNames = {
        'create_voice_channel': 'create voice channels',
        'create_text_channel': 'create text channels',
        'create_category': 'create categories',
        'delete_channel': 'delete channels',
        'delete_channels_bulk': 'delete multiple channels',
        'rename_channel': 'rename channels',
        'move_channel': 'move channels',
        'create_role': 'create roles',
        'delete_role': 'delete roles',
        'assign_role': 'assign roles',
        'kick_member': 'kick members',
        'ban_member': 'ban members',
        'timeout_member': 'timeout members',
        'move_member': 'move members in voice',
        'manage_messages': 'manage messages',
    };

    return actionNames[toolName] || toolName.replace(/_/g, ' ');
}

/**
 * Add or update permissions for a tool
 * Useful for dynamically registering new tools
 * @param {string} toolName - The tool name
 * @param {Array} permissions - Array of PermissionFlagsBits
 */
export function registerToolPermissions(toolName, permissions) {
    TOOL_PERMISSIONS[toolName] = permissions;
    logger.debug('PERMISSION', `Registered permissions for tool "${toolName}": ${permissions.length} required`);
}
