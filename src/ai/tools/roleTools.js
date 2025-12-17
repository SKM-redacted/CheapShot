/**
 * Discord Tools - Role Management
 * 
 * Handlers for creating, deleting, editing, and listing roles.
 * Includes bulk operations and role assignment.
 */

import { PermissionFlagsBits } from 'discord.js';
import {
    logger,
    findRole,
    findMember,
    parseColor,
    parsePermissions
} from './helpers.js';

// ============================================================
// ROLE CREATION HANDLERS
// ============================================================

/**
 * Handler for creating a role
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, color?, hoist?, mentionable?, permissions? }
 * @returns {Promise<{success: boolean, role?: Object, error?: string}>}
 */
export async function handleCreateRole(guild, args) {
    const { name, color, hoist = false, mentionable = false, permissions = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot create role: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot create role: Invalid name');
        return { success: false, error: 'Invalid role name' };
    }

    try {
        logger.info('TOOL', `Creating role "${name}" in guild ${guild.name}`);

        const roleOptions = {
            name: name,
            hoist: Boolean(hoist),
            mentionable: Boolean(mentionable),
            reason: 'Created by CheapShot AI via tool call'
        };

        // Parse and apply color
        if (color) {
            const parsedColor = parseColor(color);
            if (parsedColor !== null) {
                roleOptions.color = parsedColor;
            } else {
                logger.warn('TOOL', `Invalid color "${color}", using default`);
            }
        }

        // Parse and apply permissions
        if (permissions && permissions.length > 0) {
            const { valid, invalid } = parsePermissions(permissions);
            if (valid.length > 0) {
                roleOptions.permissions = valid;
            }
            if (invalid.length > 0) {
                logger.warn('TOOL', `Invalid permissions ignored: ${invalid.join(', ')}`);
            }
        }

        const role = await guild.roles.create(roleOptions);

        logger.info('TOOL', `Role "${name}" created successfully (ID: ${role.id})`);

        return {
            success: true,
            role: {
                id: role.id,
                name: role.name,
                color: role.hexColor,
                hoist: role.hoist,
                mentionable: role.mentionable,
                position: role.position
            }
        };

    } catch (error) {
        logger.error('TOOL', `Failed to create role: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to create role'
        };
    }
}

// ============================================================
// ROLE DELETION HANDLERS
// ============================================================

/**
 * Handler for deleting a role
 * Includes smart recovery: if role not found, suggests similar roles that exist.
 * 
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name }
 * @returns {Promise<{success: boolean, deleted?: Object, similar_roles?: Array, error?: string}>}
 */
export async function handleDeleteRole(guild, args) {
    const { name } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot delete role: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot delete role: Invalid name');
        return { success: false, error: 'Invalid role name' };
    }

    try {
        const role = findRole(guild, name);

        if (!role) {
            logger.warn('TOOL', `No role found matching "${name}"`);

            // Smart recovery: find similar role names
            const searchLower = name.toLowerCase().replace(/[^\w\s]/g, ''); // Remove emojis/symbols for matching
            const allRoles = guild.roles.cache
                .filter(r => r.name !== '@everyone')
                .sort((a, b) => b.position - a.position);

            // Find roles with similar names (partial match or cleaned name match)
            const similarRoles = allRoles
                .filter(r => {
                    const roleLower = r.name.toLowerCase();
                    const roleClean = roleLower.replace(/[^\w\s]/g, '');
                    return roleLower.includes(searchLower) ||
                        roleClean.includes(searchLower) ||
                        searchLower.includes(roleClean);
                })
                .map(r => r.name)
                .slice(0, 5);

            // Get all role names for context
            const allRoleNames = allRoles.map(r => r.name).slice(0, 15);

            return {
                success: false,
                error: `No role found matching "${name}"`,
                similar_roles: similarRoles.length > 0 ? similarRoles : undefined,
                available_roles: allRoleNames,
                hint: similarRoles.length > 0
                    ? `Did you mean: ${similarRoles.map(r => `"${r}"`).join(', ')}?`
                    : `Available roles: ${allRoleNames.map(r => `"${r}"`).join(', ')}`
            };
        }

        // Check if role is manageable
        if (!role.editable) {
            return { success: false, error: `Cannot delete role "${role.name}" - it's higher than my highest role or is a bot role` };
        }

        const roleName = role.name;
        const roleId = role.id;

        logger.info('TOOL', `Deleting role "${roleName}" (ID: ${roleId}) in guild ${guild.name}`);

        await role.delete('Deleted by CheapShot AI via tool call');

        logger.info('TOOL', `Role "${roleName}" deleted successfully`);

        return {
            success: true,
            deleted: {
                id: roleId,
                name: roleName
            }
        };

    } catch (error) {
        logger.error('TOOL', `Failed to delete role: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to delete role'
        };
    }
}

/**
 * Handler for bulk deleting multiple roles at once
 * PRE-FLIGHT: Always fetches and returns the actual role list so the AI
 * always sees what roles exist, preventing wrong guesses.
 * 
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { roles: Array<string> }
 * @returns {Promise<{success: boolean, deleted?: Array, failed?: Array, summary?: string, actual_roles: Array, error?: string}>}
 */
export async function handleDeleteRolesBulk(guild, args) {
    const { roles = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot bulk delete roles: No guild context');
        return { success: false, error: 'No server context available' };
    }

    // PRE-FLIGHT: Always get actual roles first so AI can see what exists
    const actualRoles = guild.roles.cache
        .filter(r => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .map(r => ({
            name: r.name,
            color: r.hexColor,
            members: r.members.size
        }));

    const actualRoleNames = actualRoles.map(r => r.name);

    if (!Array.isArray(roles) || roles.length === 0) {
        logger.error('TOOL', 'Cannot bulk delete roles: No roles specified');
        return {
            success: false,
            error: 'No roles specified for deletion',
            actual_roles: actualRoles,
            actual_role_names: actualRoleNames,
            hint: `Here are the roles that exist: ${actualRoleNames.map(r => `"${r}"`).join(', ')}`
        };
    }

    logger.info('TOOL', `Bulk deleting ${roles.length} roles in parallel`);

    // Execute all deletions in parallel
    const deletePromises = roles.map(async (roleName) => {
        try {
            const result = await handleDeleteRole(guild, { name: roleName });
            return {
                name: roleName,
                ...result
            };
        } catch (error) {
            return {
                name: roleName,
                success: false,
                error: error.message
            };
        }
    });

    const results = await Promise.all(deletePromises);

    const deleted = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    logger.info('TOOL', `Bulk role delete complete: ${deleted.length} deleted, ${failed.length} failed`);

    // Re-fetch actual roles after deletion to show current state
    const remainingRoles = guild.roles.cache
        .filter(r => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .map(r => ({
            name: r.name,
            color: r.hexColor,
            members: r.members.size
        }));

    // Build response - ALWAYS include actual roles
    const response = {
        success: deleted.length > 0 || failed.length === 0,
        deleted: deleted.map(r => ({ name: r.deleted?.name || r.name })),
        failed: failed.map(r => ({ name: r.name, error: r.error })),
        summary: `Deleted ${deleted.length} role${deleted.length !== 1 ? 's' : ''}${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
        // ALWAYS include remaining roles so AI knows current state
        remaining_roles: remainingRoles.map(r => r.name)
    };

    // If there were failures, add extra context
    if (failed.length > 0) {
        const notFoundCount = failed.filter(r =>
            r.error?.includes('No role found') || r.error?.includes('not found')
        ).length;

        if (notFoundCount > 0) {
            response.message = `⚠️ ${notFoundCount} role(s) were not found. The remaining roles on this server are: ${remainingRoles.map(r => `"${r.name}"`).join(', ')}`;
        }
    }

    return response;
}

// ============================================================
// ROLE EDITING HANDLERS
// ============================================================

/**
 * Handler for editing a role
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { name, new_name?, color?, hoist?, mentionable?, add_permissions?, remove_permissions? }
 * @returns {Promise<{success: boolean, role?: Object, changes?: Array, error?: string}>}
 */
export async function handleEditRole(guild, args) {
    const { name, new_name, color, hoist, mentionable, add_permissions = [], remove_permissions = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot edit role: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!name || typeof name !== 'string') {
        logger.error('TOOL', 'Cannot edit role: Invalid name');
        return { success: false, error: 'Invalid role name' };
    }

    try {
        const role = findRole(guild, name);

        if (!role) {
            logger.warn('TOOL', `No role found matching "${name}"`);
            return { success: false, error: `No role found matching "${name}"` };
        }

        // Check if role is editable
        if (!role.editable) {
            return { success: false, error: `Cannot edit role "${role.name}" - it's higher than my highest role or is a bot role` };
        }

        const changes = [];
        const editOptions = {
            reason: 'Edited by CheapShot AI via tool call'
        };

        // Apply new name
        if (new_name && new_name !== role.name) {
            editOptions.name = new_name;
            changes.push(`renamed from "${role.name}" to "${new_name}"`);
        }

        // Apply new color
        if (color !== undefined) {
            const parsedColor = parseColor(color);
            if (parsedColor !== null) {
                editOptions.color = parsedColor;
                changes.push(`color changed to ${color}`);
            }
        }

        // Apply hoist setting
        if (hoist !== undefined && hoist !== role.hoist) {
            editOptions.hoist = Boolean(hoist);
            changes.push(`hoist ${hoist ? 'enabled' : 'disabled'}`);
        }

        // Apply mentionable setting
        if (mentionable !== undefined && mentionable !== role.mentionable) {
            editOptions.mentionable = Boolean(mentionable);
            changes.push(`mentionable ${mentionable ? 'enabled' : 'disabled'}`);
        }

        // Handle permission changes
        if (add_permissions.length > 0 || remove_permissions.length > 0) {
            let currentPerms = role.permissions.bitfield;

            if (add_permissions.length > 0) {
                const { valid, invalid } = parsePermissions(add_permissions);
                for (const perm of valid) {
                    currentPerms |= perm;
                }
                if (valid.length > 0) {
                    changes.push(`added ${valid.length} permission(s)`);
                }
            }

            if (remove_permissions.length > 0) {
                const { valid, invalid } = parsePermissions(remove_permissions);
                for (const perm of valid) {
                    currentPerms &= ~perm;
                }
                if (valid.length > 0) {
                    changes.push(`removed ${valid.length} permission(s)`);
                }
            }

            editOptions.permissions = currentPerms;
        }

        if (changes.length === 0) {
            return { success: false, error: 'No changes specified' };
        }

        logger.info('TOOL', `Editing role "${role.name}": ${changes.join(', ')}`);

        const updatedRole = await role.edit(editOptions);

        logger.info('TOOL', `Role "${updatedRole.name}" edited successfully`);

        return {
            success: true,
            role: {
                id: updatedRole.id,
                name: updatedRole.name,
                color: updatedRole.hexColor,
                hoist: updatedRole.hoist,
                mentionable: updatedRole.mentionable,
                position: updatedRole.position
            },
            changes
        };

    } catch (error) {
        logger.error('TOOL', `Failed to edit role: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to edit role'
        };
    }
}

// ============================================================
// ROLE LISTING HANDLERS
// ============================================================

/**
 * Handler for listing roles
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { include_permissions? }
 * @returns {Promise<{success: boolean, roles?: Array, summary?: string, error?: string}>}
 */
export async function handleListRoles(guild, args) {
    const { include_permissions = false } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot list roles: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        // Get all roles sorted by position (highest first, excluding @everyone)
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(r => {
                const roleData = {
                    name: r.name,
                    id: r.id,
                    color: r.hexColor,
                    members: r.members.size,
                    hoist: r.hoist,
                    mentionable: r.mentionable,
                    position: r.position
                };

                if (include_permissions) {
                    // Get key permissions as readable names
                    const keyPerms = [];
                    if (r.permissions.has(PermissionFlagsBits.Administrator)) keyPerms.push('Administrator');
                    if (r.permissions.has(PermissionFlagsBits.ManageChannels)) keyPerms.push('ManageChannels');
                    if (r.permissions.has(PermissionFlagsBits.ManageRoles)) keyPerms.push('ManageRoles');
                    if (r.permissions.has(PermissionFlagsBits.ManageMessages)) keyPerms.push('ManageMessages');
                    if (r.permissions.has(PermissionFlagsBits.KickMembers)) keyPerms.push('KickMembers');
                    if (r.permissions.has(PermissionFlagsBits.BanMembers)) keyPerms.push('BanMembers');
                    if (r.permissions.has(PermissionFlagsBits.ModerateMembers)) keyPerms.push('ModerateMembers');
                    if (r.permissions.has(PermissionFlagsBits.MentionEveryone)) keyPerms.push('MentionEveryone');
                    roleData.key_permissions = keyPerms;
                }

                return roleData;
            });

        // Build summary
        let summaryLines = [`🎭 **Server Roles** (${roles.length} total):`];
        for (const r of roles) {
            let line = `  • **${r.name}** ${r.color !== '#000000' ? `[${r.color}]` : ''} - ${r.members} member${r.members !== 1 ? 's' : ''}`;
            if (r.hoist) line += ' 📌';
            if (r.mentionable) line += ' @';
            if (include_permissions && r.key_permissions?.length > 0) {
                line += ` (${r.key_permissions.join(', ')})`;
            }
            summaryLines.push(line);
        }

        logger.info('TOOL', `Listed ${roles.length} roles in guild ${guild.name}`);

        return {
            success: true,
            roles,
            summary: summaryLines.join('\n')
        };

    } catch (error) {
        logger.error('TOOL', `Failed to list roles: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to list roles'
        };
    }
}

/**
 * Handler for listing roles with their detailed permissions
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { role?: string }
 * @returns {Promise<{success: boolean, roles?: Array, summary?: string, error?: string}>}
 */
export async function handleListRolePermissions(guild, args) {
    const { role: roleName } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot list role permissions: No guild context');
        return { success: false, error: 'No server context available' };
    }

    try {
        // Get roles to check (either specific role or all)
        let rolesToCheck;
        if (roleName) {
            const role = guild.roles.cache.find(r =>
                r.name.toLowerCase() === roleName.toLowerCase() ||
                r.name.toLowerCase().includes(roleName.toLowerCase())
            );
            if (!role) {
                return { success: false, error: `Could not find role "${roleName}"` };
            }
            rolesToCheck = [role];
        } else {
            rolesToCheck = guild.roles.cache
                .filter(r => r.name !== '@everyone')
                .sort((a, b) => b.position - a.position)
                .map(r => r);
        }

        // Permission categories for organized display
        const permCategories = {
            'General': [
                { flag: PermissionFlagsBits.Administrator, name: 'Administrator', emoji: '👑' },
                { flag: PermissionFlagsBits.ManageGuild, name: 'Manage Server', emoji: '⚙️' },
                { flag: PermissionFlagsBits.ManageChannels, name: 'Manage Channels', emoji: '📁' },
                { flag: PermissionFlagsBits.ManageRoles, name: 'Manage Roles', emoji: '🎭' },
                { flag: PermissionFlagsBits.ViewAuditLog, name: 'View Audit Log', emoji: '📋' },
                { flag: PermissionFlagsBits.ManageWebhooks, name: 'Manage Webhooks', emoji: '🔗' },
                { flag: PermissionFlagsBits.ManageEmojisAndStickers, name: 'Manage Emojis', emoji: '😀' },
            ],
            'Moderation': [
                { flag: PermissionFlagsBits.KickMembers, name: 'Kick Members', emoji: '👢' },
                { flag: PermissionFlagsBits.BanMembers, name: 'Ban Members', emoji: '🔨' },
                { flag: PermissionFlagsBits.ModerateMembers, name: 'Timeout Members', emoji: '⏰' },
                { flag: PermissionFlagsBits.ManageNicknames, name: 'Manage Nicknames', emoji: '📝' },
                { flag: PermissionFlagsBits.ManageMessages, name: 'Manage Messages', emoji: '🗑️' },
            ],
            'Voice': [
                { flag: PermissionFlagsBits.MoveMembers, name: 'Move Members', emoji: '📍' },
                { flag: PermissionFlagsBits.MuteMembers, name: 'Mute Members', emoji: '🔇' },
                { flag: PermissionFlagsBits.DeafenMembers, name: 'Deafen Members', emoji: '🔕' },
                { flag: PermissionFlagsBits.PrioritySpeaker, name: 'Priority Speaker', emoji: '🎤' },
            ],
            'Text': [
                { flag: PermissionFlagsBits.MentionEveryone, name: 'Mention Everyone', emoji: '📢' },
                { flag: PermissionFlagsBits.ManageThreads, name: 'Manage Threads', emoji: '🧵' },
                { flag: PermissionFlagsBits.SendTTSMessages, name: 'Send TTS', emoji: '🔊' },
            ]
        };

        const roleResults = [];
        const summaryLines = [];

        for (const role of rolesToCheck) {
            const permissions = role.permissions;
            const hasAdmin = permissions.has(PermissionFlagsBits.Administrator);

            const rolePerms = {
                name: role.name,
                color: role.hexColor,
                position: role.position,
                members: role.members.size,
                isAdmin: hasAdmin,
                permissions: {}
            };

            // Header for this role
            summaryLines.push(`\n**${role.name}** ${role.hexColor !== '#000000' ? `[${role.hexColor}]` : ''} - ${role.members.size} member(s)`);

            if (hasAdmin) {
                summaryLines.push(`  👑 **ADMINISTRATOR** - Has all permissions`);
                rolePerms.permissions = { Administrator: true };
            } else {
                // Check each category
                for (const [category, perms] of Object.entries(permCategories)) {
                    const hasPerms = perms.filter(p => permissions.has(p.flag));
                    if (hasPerms.length > 0) {
                        const permList = hasPerms.map(p => `${p.emoji} ${p.name}`).join(', ');
                        summaryLines.push(`  **${category}:** ${permList}`);
                        rolePerms.permissions[category] = hasPerms.map(p => p.name);
                    }
                }

                // If no special permissions
                if (Object.keys(rolePerms.permissions).length === 0) {
                    summaryLines.push(`  *(Basic member permissions only)*`);
                }
            }

            roleResults.push(rolePerms);
        }

        const header = roleName
            ? `🔐 **Permissions for ${rolesToCheck[0].name}:**`
            : `🔐 **Role Permissions** (${roleResults.length} roles):`;

        logger.info('TOOL', `Listed permissions for ${roleResults.length} role(s) in guild ${guild.name}`);

        return {
            success: true,
            roles: roleResults,
            summary: header + summaryLines.join('\n'),
            message: header + summaryLines.join('\n')
        };

    } catch (error) {
        logger.error('TOOL', `Failed to list role permissions: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to list role permissions'
        };
    }
}

// ============================================================
// ROLE ASSIGNMENT HANDLERS
// ============================================================

/**
 * Handler for assigning or removing a role from a member
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { role_name, member, action? }
 * @returns {Promise<{success: boolean, member?: Object, role?: Object, action?: string, error?: string}>}
 */
export async function handleAssignRole(guild, args) {
    const { role_name, member: memberIdentifier, action = 'add' } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot assign role: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!role_name || typeof role_name !== 'string') {
        logger.error('TOOL', 'Cannot assign role: Invalid role name');
        return { success: false, error: 'Invalid role name' };
    }

    if (!memberIdentifier || typeof memberIdentifier !== 'string') {
        logger.error('TOOL', 'Cannot assign role: Invalid member identifier');
        return { success: false, error: 'Invalid member identifier' };
    }

    try {
        // Find the role
        const role = findRole(guild, role_name);
        if (!role) {
            return { success: false, error: `No role found matching "${role_name}"` };
        }

        // Check if role is assignable by the bot
        if (!role.editable) {
            return { success: false, error: `Cannot assign role "${role.name}" - it's higher than my highest role` };
        }

        // Find the member
        const member = await findMember(guild, memberIdentifier);
        if (!member) {
            return { success: false, error: `No member found matching "${memberIdentifier}"` };
        }

        const isAdd = action.toLowerCase() === 'add';
        const hasRole = member.roles.cache.has(role.id);

        // Check if change is needed
        if (isAdd && hasRole) {
            return {
                success: true,
                member: { name: member.displayName, id: member.id },
                role: { name: role.name, id: role.id },
                action: 'none',
                message: `${member.displayName} already has the ${role.name} role`
            };
        }
        if (!isAdd && !hasRole) {
            return {
                success: true,
                member: { name: member.displayName, id: member.id },
                role: { name: role.name, id: role.id },
                action: 'none',
                message: `${member.displayName} doesn't have the ${role.name} role`
            };
        }

        // Apply the change
        logger.info('TOOL', `${isAdd ? 'Adding' : 'Removing'} role "${role.name}" ${isAdd ? 'to' : 'from'} ${member.displayName}`);

        if (isAdd) {
            await member.roles.add(role, 'Assigned by CheapShot AI via tool call');
        } else {
            await member.roles.remove(role, 'Removed by CheapShot AI via tool call');
        }

        logger.info('TOOL', `Successfully ${isAdd ? 'added' : 'removed'} role "${role.name}" ${isAdd ? 'to' : 'from'} ${member.displayName}`);

        return {
            success: true,
            member: { name: member.displayName, id: member.id },
            role: { name: role.name, id: role.id },
            action: isAdd ? 'added' : 'removed'
        };

    } catch (error) {
        logger.error('TOOL', `Failed to assign role: ${error.message}`);
        return {
            success: false,
            error: error.message || 'Failed to assign role'
        };
    }
}

// ============================================================
// BULK ROLE SETUP
// ============================================================

/**
 * Handler for setting up multiple roles at once in parallel
 * Similar to handleSetupServerStructure but for roles
 * @param {Object} guild - Discord guild object
 * @param {Object} args - Tool arguments { roles: Array<{name, color?, hoist?, mentionable?, permissions?}> }
 * @returns {Promise<{success: boolean, created?: Object, failed?: Object, summary?: string, error?: string}>}
 */
export async function handleSetupRoles(guild, args) {
    const { roles = [] } = args;

    if (!guild) {
        logger.error('TOOL', 'Cannot setup roles: No guild context');
        return { success: false, error: 'No server context available' };
    }

    if (!Array.isArray(roles) || roles.length === 0) {
        logger.error('TOOL', 'Cannot setup roles: No roles specified');
        return { success: false, error: 'No roles specified' };
    }

    logger.info('TOOL', `Setting up ${roles.length} roles in parallel`);

    const results = {
        success: 0,
        failed: 0,
        details: []
    };

    // Create all roles in parallel
    const rolePromises = roles.map(async (roleConfig, index) => {
        try {
            const result = await handleCreateRole(guild, {
                name: roleConfig.name,
                color: roleConfig.color,
                hoist: roleConfig.hoist,
                mentionable: roleConfig.mentionable,
                permissions: roleConfig.permissions
            });
            return {
                ...roleConfig,
                result,
                success: result.success,
                index // Track original order for positioning
            };
        } catch (error) {
            return {
                ...roleConfig,
                result: { success: false, error: error.message },
                success: false,
                index
            };
        }
    });

    const roleResults = await Promise.all(rolePromises);

    // Collect results
    const createdRoles = [];
    for (const res of roleResults) {
        if (res.success) {
            results.success++;
            results.details.push({
                name: res.name,
                color: res.result.role?.color,
                success: true
            });
            createdRoles.push({
                role: res.result.role,
                index: res.index
            });
        } else {
            results.failed++;
            results.details.push({
                name: res.name,
                success: false,
                error: res.result.error
            });
        }
    }

    // Try to reorder roles based on original order (first = highest)
    // Discord creates roles at position 1 by default, so we need to reposition
    if (createdRoles.length > 1) {
        try {
            // Sort by original index (first in array should be highest)
            createdRoles.sort((a, b) => a.index - b.index);

            // Get the bot's highest manageable position
            const botMember = guild.members.me;
            const botHighestRole = botMember.roles.highest;
            const maxPosition = botHighestRole.position - 1;

            // Build position array - first role gets highest position
            const positionUpdates = createdRoles.map((item, idx) => ({
                role: item.role.id,
                position: Math.max(1, maxPosition - idx)
            }));

            await guild.roles.setPositions(positionUpdates);
            logger.debug('TOOL', `Repositioned ${createdRoles.length} roles in hierarchy`);
        } catch (e) {
            // Non-fatal - roles are created, just not in ideal order
            logger.warn('TOOL', `Could not reposition roles: ${e.message}`);
        }
    }

    logger.info('TOOL', `Role setup complete: ${results.success} created, ${results.failed} failed`);

    return {
        success: results.success > 0,
        created: results.success,
        failed: results.failed,
        details: results.details,
        summary: `Created ${results.success} role${results.success !== 1 ? 's' : ''}${results.failed > 0 ? `, ${results.failed} failed` : ''}`
    };
}
