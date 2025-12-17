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
    'delete_roles_bulk': [PermissionFlagsBits.ManageRoles],
    'edit_role': [PermissionFlagsBits.ManageRoles],
    'list_roles': [PermissionFlagsBits.ManageRoles],
    'list_role_permissions': [PermissionFlagsBits.ManageRoles],
    'assign_role': [PermissionFlagsBits.ManageRoles],
    'setup_roles': [PermissionFlagsBits.ManageRoles],
    'kick_member': [PermissionFlagsBits.KickMembers],
    'ban_member': [PermissionFlagsBits.BanMembers],
    'timeout_member': [PermissionFlagsBits.ModerateMembers],
    'move_member': [PermissionFlagsBits.MoveMembers],
    'move_members_bulk': [PermissionFlagsBits.MoveMembers],
    'manage_messages': [PermissionFlagsBits.ManageMessages],
    'delete_message': [PermissionFlagsBits.ManageMessages],
    'delete_messages_bulk': [PermissionFlagsBits.ManageMessages],
    'pin_message': [PermissionFlagsBits.ManageMessages],
    'unpin_message': [PermissionFlagsBits.ManageMessages],
    'pin_messages_bulk': [PermissionFlagsBits.ManageMessages],
    'unpin_messages_bulk': [PermissionFlagsBits.ManageMessages],
    'publish_message': [PermissionFlagsBits.ManageMessages], // Crossposting usually requires Manage Messages
    'search_members': [PermissionFlagsBits.ModerateMembers],
    'list_channels': [PermissionFlagsBits.ManageChannels],
    'get_server_info': [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
    'configure_channel_permissions': [PermissionFlagsBits.ManageChannels],
    'edit_text_channel': [PermissionFlagsBits.ManageChannels],
    'edit_voice_channel': [PermissionFlagsBits.ManageChannels],
    'edit_category': [PermissionFlagsBits.ManageChannels],
    'edit_channels_bulk': [PermissionFlagsBits.ManageChannels],
    'check_perms': [PermissionFlagsBits.ManageRoles],
    'list_pinned_messages': [PermissionFlagsBits.ReadMessageHistory],
    'list_messages': [PermissionFlagsBits.ReadMessageHistory],
    // Sticker Management - requires ManageGuildExpressions (newer) or ManageEmojisAndStickers (legacy)
    'create_sticker': [PermissionFlagsBits.ManageGuildExpressions],
    'delete_sticker': [PermissionFlagsBits.ManageGuildExpressions],
    'list_stickers': [PermissionFlagsBits.ManageGuildExpressions],
    'create_stickers_bulk': [PermissionFlagsBits.ManageGuildExpressions],
    'delete_stickers_bulk': [PermissionFlagsBits.ManageGuildExpressions],
    // These don't need special permissions
    'generate_image': [],
    'join_voice': [],
    'leave_voice': [],
    'voice_conversation': [],
    'list_voice_channels': []
};

/**
 * Human-readable permission names for error messages
 * This is a comprehensive list of ALL Discord permissions
 */
const PERMISSION_NAMES = {
    // ============================================================
    // GENERAL SERVER PERMISSIONS
    // ============================================================
    [PermissionFlagsBits.Administrator]: 'Administrator',
    [PermissionFlagsBits.ViewAuditLog]: 'View Audit Log',
    [PermissionFlagsBits.ViewGuildInsights]: 'View Server Insights',
    [PermissionFlagsBits.ManageGuild]: 'Manage Server',
    [PermissionFlagsBits.ManageRoles]: 'Manage Roles',
    [PermissionFlagsBits.ManageChannels]: 'Manage Channels',
    [PermissionFlagsBits.KickMembers]: 'Kick Members',
    [PermissionFlagsBits.BanMembers]: 'Ban Members',
    [PermissionFlagsBits.CreateInstantInvite]: 'Create Invite',
    [PermissionFlagsBits.ChangeNickname]: 'Change Nickname',
    [PermissionFlagsBits.ManageNicknames]: 'Manage Nicknames',
    [PermissionFlagsBits.ManageGuildExpressions]: 'Manage Expressions',
    [PermissionFlagsBits.CreateGuildExpressions]: 'Create Expressions',
    [PermissionFlagsBits.ManageWebhooks]: 'Manage Webhooks',
    [PermissionFlagsBits.ViewChannel]: 'View Channels',
    [PermissionFlagsBits.ModerateMembers]: 'Timeout Members',

    // ============================================================
    // TEXT CHANNEL PERMISSIONS
    // ============================================================
    [PermissionFlagsBits.SendMessages]: 'Send Messages',
    [PermissionFlagsBits.SendTTSMessages]: 'Send TTS Messages',
    [PermissionFlagsBits.ManageMessages]: 'Manage Messages',
    [PermissionFlagsBits.EmbedLinks]: 'Embed Links',
    [PermissionFlagsBits.AttachFiles]: 'Attach Files',
    [PermissionFlagsBits.ReadMessageHistory]: 'Read Message History',
    [PermissionFlagsBits.MentionEveryone]: 'Mention @everyone',
    [PermissionFlagsBits.UseExternalEmojis]: 'Use External Emojis',
    [PermissionFlagsBits.UseExternalStickers]: 'Use External Stickers',
    [PermissionFlagsBits.AddReactions]: 'Add Reactions',
    [PermissionFlagsBits.ManageThreads]: 'Manage Threads',
    [PermissionFlagsBits.CreatePublicThreads]: 'Create Public Threads',
    [PermissionFlagsBits.CreatePrivateThreads]: 'Create Private Threads',
    [PermissionFlagsBits.SendMessagesInThreads]: 'Send Messages in Threads',
    [PermissionFlagsBits.UseApplicationCommands]: 'Use Application Commands',

    // ============================================================
    // VOICE CHANNEL PERMISSIONS
    // ============================================================
    [PermissionFlagsBits.Connect]: 'Connect',
    [PermissionFlagsBits.Speak]: 'Speak',
    [PermissionFlagsBits.Stream]: 'Video/Stream',
    [PermissionFlagsBits.MuteMembers]: 'Mute Members',
    [PermissionFlagsBits.DeafenMembers]: 'Deafen Members',
    [PermissionFlagsBits.MoveMembers]: 'Move Members',
    [PermissionFlagsBits.UseVAD]: 'Use Voice Activity',
    [PermissionFlagsBits.PrioritySpeaker]: 'Priority Speaker',
    [PermissionFlagsBits.UseSoundboard]: 'Use Soundboard',
    [PermissionFlagsBits.UseExternalSounds]: 'Use External Sounds',
    [PermissionFlagsBits.SendVoiceMessages]: 'Send Voice Messages',

    // ============================================================
    // STAGE CHANNEL PERMISSIONS
    // ============================================================
    [PermissionFlagsBits.RequestToSpeak]: 'Request to Speak',

    // ============================================================
    // EVENTS PERMISSIONS
    // ============================================================
    [PermissionFlagsBits.ManageEvents]: 'Manage Events',
    [PermissionFlagsBits.CreateEvents]: 'Create Events',

    // ============================================================
    // MONETIZATION PERMISSIONS
    // ============================================================
    [PermissionFlagsBits.ViewCreatorMonetizationAnalytics]: 'View Monetization Analytics',

    // ============================================================
    // APPS/ACTIVITIES PERMISSIONS
    // ============================================================
    [PermissionFlagsBits.UseEmbeddedActivities]: 'Use Activities',
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
            error: 'Error 493: Unable to verify your permissions. Please try again.',
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
            error: `Error 493: This action is not configured. Please contact an administrator.`,
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
            error: `Error 493: You don't have permission to do that. You need: ${missingPermissions.join(', ')}`,
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
        return `Error 493: You don't have permission to ${actionName}. Required: ${missingPermissions.join(', ')}.`;
    }

    return `Error 493: You don't have permission to ${actionName}.`;
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
        'delete_roles_bulk': 'delete multiple roles',
        'edit_role': 'edit roles',
        'list_roles': 'list roles',
        'assign_role': 'assign roles',
        'setup_roles': 'set up roles',
        'kick_member': 'kick members',
        'ban_member': 'ban members',
        'timeout_member': 'timeout members',
        'move_member': 'move members in voice',
        'move_members_bulk': 'move multiple members in voice',
        'manage_messages': 'manage messages',
        'delete_message': 'delete messages',
        'delete_messages_bulk': 'delete multiple messages',
        'pin_message': 'pin messages',
        'unpin_message': 'unpin messages',
        'pin_messages_bulk': 'pin multiple messages',
        'unpin_messages_bulk': 'unpin multiple messages',
        'list_pinned_messages': 'read pinned messages',
        'list_messages': 'read channel history',
        'publish_message': 'publish announcements',
        'get_server_info': 'view server information',
        'configure_channel_permissions': 'configure channel permissions',
        'edit_text_channel': 'edit text channels',
        'edit_voice_channel': 'edit voice channels',
        'edit_category': 'edit categories',
        'edit_channels_bulk': 'edit multiple channels',
        'rename_channel': 'rename channels',
        'move_channel': 'move channels',
        'setup_server_structure': 'set up server structure',
        'list_channels': 'list channels',
        'list_role_permissions': 'check role permissions',
        'check_perms': 'check user permissions',
        // Sticker management
        'create_sticker': 'create stickers',
        'delete_sticker': 'delete stickers',
        'list_stickers': 'list stickers',
        'create_stickers_bulk': 'create multiple stickers',
        'delete_stickers_bulk': 'delete multiple stickers',
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
