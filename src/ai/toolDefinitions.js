/**
 * Tool Definitions
 * 
 * This file contains all the tool schemas that define what actions
 * the AI can take. These are passed to the AI model to let it know
 * what capabilities it has.
 * 
 * Handlers for these tools are in their respective files:
 * - discordTools.js - Discord channel/category management
 * - imageClient.js - Image generation
 */

// ============================================================
// IMAGE GENERATION TOOLS
// ============================================================

/**
 * Tool definition for generating images
 */
export const IMAGE_TOOL = {
    type: "function",
    function: {
        name: "generate_image",
        description: "Generate an image based on a text description. Use this when the user asks you to create, draw, generate, or make an image or picture of something.",
        parameters: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description: "A detailed description of the image to generate. Be descriptive and specific about what should be in the image, the style, colors, composition, etc."
                },
                size: {
                    type: "string",
                    enum: ["1024x1024", "1792x1024", "1024x1792"],
                    description: "The size of the image. Use 1024x1024 for square, 1792x1024 for landscape, 1024x1792 for portrait."
                }
            },
            required: ["prompt"]
        }
    }
};

// ============================================================
// DISCORD CHANNEL MANAGEMENT TOOLS
// ============================================================

/**
 * Tool definition for creating a voice channel
 */
export const CREATE_VOICE_CHANNEL_TOOL = {
    type: "function",
    function: {
        name: "create_voice_channel",
        description: "Create a new voice channel in the Discord server. Use this when the user asks you to create, make, or add a voice channel.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name for the new voice channel. Keep it short and descriptive."
                },
                category: {
                    type: "string",
                    description: "Optional: The name of the category to place the channel in. If not specified, the best category will be chosen automatically."
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for creating a text channel
 */
export const CREATE_TEXT_CHANNEL_TOOL = {
    type: "function",
    function: {
        name: "create_text_channel",
        description: "Create a new text channel in the Discord server. Use this when the user asks you to create, make, or add a text channel.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name for the new text channel. Use lowercase with hyphens (e.g., 'general-chat')."
                },
                category: {
                    type: "string",
                    description: "Optional: The name of the category to place the channel in. If not specified, the best category will be chosen automatically."
                },
                topic: {
                    type: "string",
                    description: "Optional: A description/topic for the channel that appears at the top."
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for creating a category
 */
export const CREATE_CATEGORY_TOOL = {
    type: "function",
    function: {
        name: "create_category",
        description: "Create a new category (channel group) in the Discord server. Use this when the user asks you to create a category, section, or channel group.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name for the new category. Categories appear as collapsible sections in the channel list."
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for deleting a single channel or category
 */
export const DELETE_CHANNEL_TOOL = {
    type: "function",
    function: {
        name: "delete_channel",
        description: "Delete a single text channel, voice channel, or category from the Discord server. For deleting multiple channels, use delete_channels_bulk instead.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name of the channel or category to delete. Can be partial match."
                },
                type: {
                    type: "string",
                    enum: ["text", "voice", "category", "any"],
                    description: "The type of channel to delete. Use 'any' if unsure."
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for listing channels in the server
 */
export const LIST_CHANNELS_TOOL = {
    type: "function",
    function: {
        name: "list_channels",
        description: "List all channels and categories in the Discord server. ALWAYS use this first when the user asks to delete channels, so you can see what exists and decide what to delete.",
        parameters: {
            type: "object",
            properties: {
                type: {
                    type: "string",
                    enum: ["all", "text", "voice", "category"],
                    description: "Filter by channel type. Default is 'all'."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for bulk deleting multiple channels at once
 */
export const DELETE_CHANNELS_BULK_TOOL = {
    type: "function",
    function: {
        name: "delete_channels_bulk",
        description: "Delete multiple channels and/or categories at once, processed in parallel for speed. Use this after using list_channels to see what exists, then call this with the specific channels you want to delete. You must have first used list_channels to know what channels exist.",
        parameters: {
            type: "object",
            properties: {
                channels: {
                    type: "array",
                    description: "Array of channels to delete. Each item should have a name and optionally a type.",
                    items: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "The exact name of the channel or category to delete"
                            },
                            type: {
                                type: "string",
                                enum: ["text", "voice", "category", "any"],
                                description: "The type of channel. Use 'any' if unsure."
                            }
                        },
                        required: ["name"]
                    }
                }
            },
            required: ["channels"]
        }
    }
};

/**
 * Tool definition for getting complete server info (channels + roles) in one call
 * This is the PREFERRED reconnaissance tool before setup_server_structure
 */
export const GET_SERVER_INFO_TOOL = {
    type: "function",
    function: {
        name: "get_server_info",
        description: "Get a complete overview of the server's current structure including all channels, categories, and roles in one call. USE THIS FIRST before setup_server_structure or setup_roles to see what already exists. This helps you understand what to add vs what already exists.",
        parameters: {
            type: "object",
            properties: {
                include_permissions: {
                    type: "boolean",
                    description: "Optional: Whether to include permission details for roles. Default is false for cleaner output."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for setting up a complete server structure in parallel
 * This is the PREFERRED tool when creating multiple channels/categories at once
 */
export const SETUP_SERVER_STRUCTURE_TOOL = {
    type: "function",
    function: {
        name: "setup_server_structure",
        description: "Create multiple categories, channels, and roles at once in parallel. IMPORTANT: Before using this tool, you MUST first call list_channels and list_roles to see what already exists in the server. Only include items that don't already exist - do NOT recreate existing channels/categories/roles. This ensures you ADD to the server structure instead of duplicating it.",
        parameters: {
            type: "object",
            properties: {
                categories: {
                    type: "array",
                    description: "Array of categories to create. Create these first so channels can be placed in them.",
                    items: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "Category name. Can include emoji prefix (e.g., '📢 Announcements')"
                            },
                            private: {
                                type: "boolean",
                                description: "If true, this category is hidden from @everyone by default. Roles in role_access can still see it."
                            },
                            role_access: {
                                type: "array",
                                description: "Array of role names that should have access to this category (can view and interact).",
                                items: { type: "string" }
                            }
                        },
                        required: ["name"]
                    }
                },
                text_channels: {
                    type: "array",
                    description: "Array of text channels to create.",
                    items: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "Channel name in lowercase with hyphens (e.g., 'general-chat')"
                            },
                            category: {
                                type: "string",
                                description: "Name of category to place this channel in"
                            },
                            topic: {
                                type: "string",
                                description: "Optional channel topic/description"
                            },
                            private: {
                                type: "boolean",
                                description: "If true, this channel is hidden from @everyone. Only roles in role_access can see it."
                            },
                            role_access: {
                                type: "array",
                                description: "Array of role names that should have access to this channel (can view and send messages).",
                                items: { type: "string" }
                            },
                            read_only: {
                                type: "boolean",
                                description: "If true, @everyone can view but NOT send messages (announcement-style channel)."
                            },
                            read_only_except: {
                                type: "array",
                                description: "Array of role names that CAN send messages even if read_only is true.",
                                items: { type: "string" }
                            }
                        },
                        required: ["name"]
                    }
                },
                voice_channels: {
                    type: "array",
                    description: "Array of voice channels to create.",
                    items: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "Voice channel name (can have spaces and capitals)"
                            },
                            category: {
                                type: "string",
                                description: "Name of category to place this channel in"
                            },
                            private: {
                                type: "boolean",
                                description: "If true, this voice channel is hidden from @everyone. Only roles in role_access can see it."
                            },
                            role_access: {
                                type: "array",
                                description: "Array of role names that should have access to this voice channel (can view and connect).",
                                items: { type: "string" }
                            }
                        },
                        required: ["name"]
                    }
                },
                roles: {
                    type: "array",
                    description: "Array of roles to create BEFORE creating channels. Create roles first if you need to reference them in channel permissions.",
                    items: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "The name for the role"
                            },
                            color: {
                                type: "string",
                                description: "Color as hex code (e.g., '#FF5733') or name ('red', 'blue', 'gold', etc.)"
                            },
                            hoist: {
                                type: "boolean",
                                description: "Display separately in member list"
                            },
                            mentionable: {
                                type: "boolean",
                                description: "Allow anyone to mention this role"
                            },
                            permissions: {
                                type: "array",
                                description: "Permission names to grant (e.g., 'SendMessages', 'ManageChannels', 'Administrator')",
                                items: { type: "string" }
                            }
                        },
                        required: ["name"]
                    }
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for configuring permissions on an existing channel
 * Use this to make channels private, add role access, make read-only, etc.
 */
export const CONFIGURE_CHANNEL_PERMISSIONS_TOOL = {
    type: "function",
    function: {
        name: "configure_channel_permissions",
        description: "Configure permissions for an existing channel or category. Use this to make channels private/public, restrict access to certain roles, or make channels read-only. Perfect for fixing permission issues or updating channel access.",
        parameters: {
            type: "object",
            properties: {
                channel_name: {
                    type: "string",
                    description: "The name of the channel or category to configure permissions for."
                },
                channel_type: {
                    type: "string",
                    enum: ["text", "voice", "category", "any"],
                    description: "The type of channel. Use 'any' if unsure."
                },
                private: {
                    type: "boolean",
                    description: "If true, hide this channel from @everyone. If false, make it visible to everyone."
                },
                role_access: {
                    type: "array",
                    description: "Array of role names that should have access to this channel EVEN IF it's private. These roles will be able to view and interact.",
                    items: { type: "string" }
                },
                role_deny: {
                    type: "array",
                    description: "Array of role names that should be DENIED access to this channel. These roles won't be able to see it.",
                    items: { type: "string" }
                },
                read_only: {
                    type: "boolean",
                    description: "For text channels: if true, prevent @everyone from sending messages. Channel becomes announcement-style."
                },
                read_only_except: {
                    type: "array",
                    description: "For text channels: Array of role names that CAN send messages even if read_only is true.",
                    items: { type: "string" }
                },
                sync_with_category: {
                    type: "boolean",
                    description: "If true, sync this channel's permissions with its parent category. Overrides other permission settings."
                }
            },
            required: ["channel_name"]
        }
    }
};

/**
 * Tool definition for editing a text channel
 */
export const EDIT_TEXT_CHANNEL_TOOL = {
    type: "function",
    function: {
        name: "edit_text_channel",
        description: "Edit an existing text channel's name, topic, category, slowmode, or NSFW setting. Use this when the user asks to rename, modify, or update a text channel.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The current name of the text channel to edit. Can be a partial match."
                },
                new_name: {
                    type: "string",
                    description: "Optional: The new name for the channel."
                },
                topic: {
                    type: "string",
                    description: "Optional: The new topic/description for the channel. Set to empty string to clear."
                },
                category: {
                    type: "string",
                    description: "Optional: The name of the category to move the channel to. Set to empty string to remove from category."
                },
                slowmode: {
                    type: "integer",
                    description: "Optional: Slowmode delay in seconds (0-21600). 0 disables slowmode."
                },
                nsfw: {
                    type: "boolean",
                    description: "Optional: Whether the channel should be marked as NSFW."
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for editing a voice channel
 */
export const EDIT_VOICE_CHANNEL_TOOL = {
    type: "function",
    function: {
        name: "edit_voice_channel",
        description: "Edit an existing voice channel's name, category, user limit, or bitrate. Use this when the user asks to rename, modify, or update a voice channel.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The current name of the voice channel to edit. Can be a partial match."
                },
                new_name: {
                    type: "string",
                    description: "Optional: The new name for the channel."
                },
                category: {
                    type: "string",
                    description: "Optional: The name of the category to move the channel to. Set to empty string to remove from category."
                },
                user_limit: {
                    type: "integer",
                    description: "Optional: Maximum number of users allowed (0-99). 0 means unlimited."
                },
                bitrate: {
                    type: "integer",
                    description: "Optional: Audio bitrate in bits per second (8000-384000). Higher is better quality but uses more bandwidth."
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for editing a category
 */
export const EDIT_CATEGORY_TOOL = {
    type: "function",
    function: {
        name: "edit_category",
        description: "Edit an existing category's name. Use this when the user asks to rename a category.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The current name of the category to edit. Can be a partial match."
                },
                new_name: {
                    type: "string",
                    description: "The new name for the category."
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for bulk editing multiple channels at once
 */
export const EDIT_CHANNELS_BULK_TOOL = {
    type: "function",
    function: {
        name: "edit_channels_bulk",
        description: "Edit multiple channels at once, processed in parallel for speed. Use this when you need to rename or modify multiple channels simultaneously.",
        parameters: {
            type: "object",
            properties: {
                channels: {
                    type: "array",
                    description: "Array of channels to edit. Each item should have a name and the properties to change.",
                    items: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "The current name of the channel to edit"
                            },
                            type: {
                                type: "string",
                                enum: ["text", "voice", "category", "any"],
                                description: "The type of channel. Use 'any' to auto-detect."
                            },
                            new_name: {
                                type: "string",
                                description: "The new name for the channel"
                            },
                            topic: {
                                type: "string",
                                description: "For text channels: the new topic"
                            },
                            category: {
                                type: "string",
                                description: "The category to move the channel to"
                            },
                            slowmode: {
                                type: "integer",
                                description: "For text channels: slowmode in seconds"
                            },
                            user_limit: {
                                type: "integer",
                                description: "For voice channels: max users (0 = unlimited)"
                            },
                            bitrate: {
                                type: "integer",
                                description: "For voice channels: audio bitrate"
                            }
                        },
                        required: ["name"]
                    }
                }
            },
            required: ["channels"]
        }
    }
};

// ============================================================
// DISCORD VOICE CHANNEL TOOLS
// ============================================================

/**
 * Tool definition for joining a voice channel
 */
export const JOIN_VOICE_TOOL = {
    type: "function",
    function: {
        name: "join_voice",
        description: "Join a voice channel to listen and talk with users. Use this when someone asks you to join VC, hop in voice, come talk, etc. You can optionally specify a channel name, or join the channel the requesting user is in.",
        parameters: {
            type: "object",
            properties: {
                channel_name: {
                    type: "string",
                    description: "Optional: Name of the voice channel to join. If not specified, joins the voice channel the user is currently in."
                },
                start_listening: {
                    type: "boolean",
                    description: "Optional: Whether to immediately start listening and transcribing. Default is true."
                },
                conversation_mode: {
                    type: "boolean",
                    description: "Optional: Whether to enable conversation mode (AI responds to voice with voice). Default is true."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for leaving a voice channel
 */
export const LEAVE_VOICE_TOOL = {
    type: "function",
    function: {
        name: "leave_voice",
        description: "Leave the current voice channel. Use this when someone asks you to leave VC, disconnect, go away, etc.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
};

/**
 * Tool definition for listing voice channels and their members
 */
export const LIST_VOICE_CHANNELS_TOOL = {
    type: "function",
    function: {
        name: "list_voice_channels",
        description: "List all voice channels in the server and show who is currently in each one. Use this to find out which voice channels exist, who is where, and pick the right channel when moving users.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
};

/**
 * Tool definition for toggling conversation mode
 */
export const VOICE_CONVERSATION_TOOL = {
    type: "function",
    function: {
        name: "voice_conversation",
        description: "Enable or disable voice conversation mode. When enabled, the AI will listen and respond with voice. Use this when someone asks you to start/stop talking, enable/disable conversation mode, etc.",
        parameters: {
            type: "object",
            properties: {
                enabled: {
                    type: "boolean",
                    description: "Whether to enable (true) or disable (false) conversation mode."
                }
            },
            required: ["enabled"]
        }
    }
};

/**
 * Tool definition for moving a member to another voice channel
 */
export const MOVE_MEMBER_TOOL = {
    type: "function",
    function: {
        name: "move_member",
        description: "Move a user from their current voice channel to a different voice channel. Use this when someone asks you to move someone to a different VC, drag them to another channel, etc.",
        parameters: {
            type: "object",
            properties: {
                member: {
                    type: "string",
                    description: "The username or nickname of the member to move. Can be partial match."
                },
                target_channel: {
                    type: "string",
                    description: "The name of the voice channel to move them to."
                }
            },
            required: ["member", "target_channel"]
        }
    }
};

/**
 * Tool definition for moving multiple members to a voice channel at once
 */
export const MOVE_MEMBERS_BULK_TOOL = {
    type: "function",
    function: {
        name: "move_members_bulk",
        description: "Move multiple users from their current voice channels to a different voice channel all at once. Use this when someone asks you to drag/move multiple people to another VC.",
        parameters: {
            type: "object",
            properties: {
                members: {
                    type: "array",
                    description: "Array of usernames or nicknames of the members to move. Can also be user IDs.",
                    items: {
                        type: "string"
                    }
                },
                target_channel: {
                    type: "string",
                    description: "The name of the voice channel to move them to."
                }
            },
            required: ["members", "target_channel"]
        }
    }
};

// ============================================================
// DISCORD ROLE MANAGEMENT TOOLS
// ============================================================

/**
 * Tool definition for creating a role
 */
export const CREATE_ROLE_TOOL = {
    type: "function",
    function: {
        name: "create_role",
        description: "Create a new role in the Discord server with optional color, permissions, and settings. Use this when the user asks you to create, make, or add a role.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name for the new role."
                },
                color: {
                    type: "string",
                    description: "Optional: The color for the role. Can be a hex color code (e.g., '#FF5733' or 'FF5733'), or a color name like 'red', 'blue', 'green', 'purple', 'orange', 'yellow', 'pink', 'cyan', 'gold', 'navy', 'teal', 'lime', 'coral', 'crimson', 'indigo', 'violet', 'salmon', 'magenta', 'aqua', 'maroon'."
                },
                hoist: {
                    type: "boolean",
                    description: "Optional: Whether to display the role separately in the member list (true) or not (false). Default is false."
                },
                mentionable: {
                    type: "boolean",
                    description: "Optional: Whether the role can be mentioned by everyone (true) or not (false). Default is false."
                },
                permissions: {
                    type: "array",
                    description: "Optional: Array of permission names to grant. Examples: 'SendMessages', 'ManageChannels', 'ManageRoles', 'KickMembers', 'BanMembers', 'ManageMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'MentionEveryone', 'Connect', 'Speak', 'MuteMembers', 'DeafenMembers', 'MoveMembers', 'UseVAD', 'ChangeNickname', 'ManageNicknames', 'ManageWebhooks', 'ManageEmojisAndStickers', 'Administrator'.",
                    items: {
                        type: "string"
                    }
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for deleting a role
 */
export const DELETE_ROLE_TOOL = {
    type: "function",
    function: {
        name: "delete_role",
        description: "Delete a role from the Discord server. Use this when the user asks you to delete, remove, or get rid of a role.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name of the role to delete. Can be a partial match."
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for bulk deleting multiple roles at once
 */
export const DELETE_ROLES_BULK_TOOL = {
    type: "function",
    function: {
        name: "delete_roles_bulk",
        description: "Delete multiple roles at once, processed in parallel for speed. Use this after using list_roles to see what exists, then call this with the specific roles you want to delete.",
        parameters: {
            type: "object",
            properties: {
                roles: {
                    type: "array",
                    description: "Array of role names to delete.",
                    items: {
                        type: "string",
                        description: "The name of the role to delete"
                    }
                }
            },
            required: ["roles"]
        }
    }
};

/**
 * Tool definition for editing a role
 */
export const EDIT_ROLE_TOOL = {
    type: "function",
    function: {
        name: "edit_role",
        description: "Edit an existing role's name, color, permissions, or other settings. Use this when the user asks you to rename, recolor, change, or modify a role.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The current name of the role to edit. Can be a partial match."
                },
                new_name: {
                    type: "string",
                    description: "Optional: The new name for the role."
                },
                color: {
                    type: "string",
                    description: "Optional: The new color for the role. Can be a hex code (e.g., '#FF5733') or color name like 'red', 'blue', 'green', 'purple', 'gold', etc."
                },
                hoist: {
                    type: "boolean",
                    description: "Optional: Whether to display the role separately in the member list."
                },
                mentionable: {
                    type: "boolean",
                    description: "Optional: Whether the role can be mentioned by everyone."
                },
                add_permissions: {
                    type: "array",
                    description: "Optional: Array of permission names to ADD to the role.",
                    items: {
                        type: "string"
                    }
                },
                remove_permissions: {
                    type: "array",
                    description: "Optional: Array of permission names to REMOVE from the role.",
                    items: {
                        type: "string"
                    }
                }
            },
            required: ["name"]
        }
    }
};

/**
 * Tool definition for listing roles
 */
export const LIST_ROLES_TOOL = {
    type: "function",
    function: {
        name: "list_roles",
        description: "List all roles in the Discord server with their colors, member counts, and key permissions. Use this to see what roles exist before creating, editing, or deleting roles.",
        parameters: {
            type: "object",
            properties: {
                include_permissions: {
                    type: "boolean",
                    description: "Optional: Whether to include permission details for each role. Default is false for cleaner output."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for assigning a role to a member
 */
export const ASSIGN_ROLE_TOOL = {
    type: "function",
    function: {
        name: "assign_role",
        description: "Assign or remove a role from a server member. Use this when the user asks to give someone a role or take a role away.",
        parameters: {
            type: "object",
            properties: {
                role_name: {
                    type: "string",
                    description: "The name of the role to assign or remove. Can be a partial match."
                },
                member: {
                    type: "string",
                    description: "The username, display name, or mention of the member. Can be a partial match."
                },
                action: {
                    type: "string",
                    enum: ["add", "remove"],
                    description: "Whether to add the role to the member or remove it. Default is 'add'."
                }
            },
            required: ["role_name", "member"]
        }
    }
};

/**
 * Tool definition for setting up multiple roles at once
 * This is the PREFERRED tool when creating multiple roles at once
 */
export const SETUP_ROLES_TOOL = {
    type: "function",
    function: {
        name: "setup_roles",
        description: "Create multiple roles at once in parallel. IMPORTANT: Before using this tool, you MUST first call list_roles to see what roles already exist. Only include roles that don't already exist - do NOT recreate existing roles. Roles are created in the order specified (first = highest position).",
        parameters: {
            type: "object",
            properties: {
                roles: {
                    type: "array",
                    description: "Array of roles to create. Order matters - first role will be highest in hierarchy.",
                    items: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "The name for the role"
                            },
                            color: {
                                type: "string",
                                description: "Color as hex code (e.g., '#FF5733') or name ('red', 'blue', 'gold', etc.)"
                            },
                            hoist: {
                                type: "boolean",
                                description: "Display separately in member list"
                            },
                            mentionable: {
                                type: "boolean",
                                description: "Allow anyone to mention this role"
                            },
                            permissions: {
                                type: "array",
                                description: "Permission names to grant (e.g., 'SendMessages', 'ManageChannels', 'Administrator')",
                                items: {
                                    type: "string"
                                }
                            }
                        },
                        required: ["name"]
                    }
                }
            },
            required: ["roles"]
        }
    }
};

// ============================================================
// MODERATION TOOLS
// ============================================================

/**
 * Tool definition for kicking a member from the server
 */
export const KICK_MEMBER_TOOL = {
    type: "function",
    function: {
        name: "kick_member",
        description: "Kick a member from the Discord server. They can rejoin with an invite. IMPORTANT: If you can't find a member, use search_members first to find them by name and get their exact username or ID.",
        parameters: {
            type: "object",
            properties: {
                member: {
                    type: "string",
                    description: "The username, display name, or mention of the member to kick."
                },
                reason: {
                    type: "string",
                    description: "Optional: The reason for kicking this member. Will be logged in audit log."
                }
            },
            required: ["member"]
        }
    }
};

/**
 * Tool definition for banning a member from the server
 */
export const BAN_MEMBER_TOOL = {
    type: "function",
    function: {
        name: "ban_member",
        description: "Ban a member from the Discord server. They cannot rejoin unless unbanned. IMPORTANT: If you can't find a member, use search_members first to find them by name and get their exact username or ID.",
        parameters: {
            type: "object",
            properties: {
                member: {
                    type: "string",
                    description: "The username, display name, user ID, or mention of the member to ban."
                },
                reason: {
                    type: "string",
                    description: "Optional: The reason for banning this member. Will be logged in audit log."
                },
                delete_messages: {
                    type: "integer",
                    description: "Optional: Number of days of messages to delete from this user (0-7). Default is 0."
                }
            },
            required: ["member"]
        }
    }
};

/**
 * Tool definition for timing out a member
 */
export const TIMEOUT_MEMBER_TOOL = {
    type: "function",
    function: {
        name: "timeout_member",
        description: "Timeout (mute) a member for a specified duration. They won't be able to send messages or speak in voice channels. IMPORTANT: If you can't find a member, use search_members first to find them by name and get their exact username or ID.",
        parameters: {
            type: "object",
            properties: {
                member: {
                    type: "string",
                    description: "The username, display name, or mention of the member to timeout."
                },
                duration: {
                    type: "string",
                    description: "How long to timeout the member. Examples: '5m' (5 minutes), '1h' (1 hour), '1d' (1 day), '1w' (1 week). Max is 28 days."
                },
                reason: {
                    type: "string",
                    description: "Optional: The reason for timing out this member. Will be logged in audit log."
                }
            },
            required: ["member", "duration"]
        }
    }
};

/**
 * Tool definition for managing (deleting/purging) messages
 */
export const MANAGE_MESSAGES_TOOL = {
    type: "function",
    function: {
        name: "manage_messages",
        description: "Delete messages from a channel. Can delete a specific number of recent messages or messages from a specific user. Use this to clean up spam or inappropriate content.",
        parameters: {
            type: "object",
            properties: {
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel to delete messages from. Defaults to the current channel."
                },
                count: {
                    type: "integer",
                    description: "Number of messages to delete (1-100). Default is 10."
                },
                from_user: {
                    type: "string",
                    description: "Optional: Only delete messages from this user (username or ID)."
                },
                reason: {
                    type: "string",
                    description: "Optional: The reason for deleting messages. Will be logged."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for renaming any channel
 */
export const RENAME_CHANNEL_TOOL = {
    type: "function",
    function: {
        name: "rename_channel",
        description: "Rename a channel (text, voice, or category). This is a quick way to rename without specifying channel type.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The current name of the channel to rename."
                },
                new_name: {
                    type: "string",
                    description: "The new name for the channel."
                }
            },
            required: ["name", "new_name"]
        }
    }
};

/**
 * Tool definition for moving a channel to a different category
 */
export const MOVE_CHANNEL_TOOL = {
    type: "function",
    function: {
        name: "move_channel",
        description: "Move a channel to a different category. Use this to reorganize channels in the server.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name of the channel to move."
                },
                category: {
                    type: "string",
                    description: "The name of the category to move the channel to. Use empty string to remove from any category."
                }
            },
            required: ["name", "category"]
        }
    }
};

// ============================================================
// UTILITY / INFO TOOLS
// ============================================================

/**
 * Tool definition for checking a user's permissions
 * This is an OPTIONAL tool - the AI can use it if it wants to check permissions
 * before attempting an action, but it's not required (the permission checker handles denials)
 */
export const CHECK_PERMS_TOOL = {
    type: "function",
    function: {
        name: "check_perms",
        description: "Check what permissions a user has in this server. Use this to see someone's roles and permissions. If no user is specified, checks the permissions of the user who made the request.",
        parameters: {
            type: "object",
            properties: {
                member: {
                    type: "string",
                    description: "Optional: The username, display name, or mention of the member to check. If not provided, checks the requesting user."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for listing roles with detailed permissions
 * Use this when the user wants to see what permissions each role has
 */
export const LIST_ROLE_PERMISSIONS_TOOL = {
    type: "function",
    function: {
        name: "list_role_permissions",
        description: "List all roles in the server with their DETAILED permissions. Use this when someone asks about role permissions, what a role can do, or wants to audit permissions. For just listing roles without permission details, use list_roles instead.",
        parameters: {
            type: "object",
            properties: {
                role: {
                    type: "string",
                    description: "Optional: Name of a specific role to check. If not provided, lists permissions for all roles."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for searching/finding members in the server
 * IMPORTANT: Use this BEFORE moderation actions (kick, ban, timeout) if you're unsure of the exact username
 * This returns matching members with their IDs so you can target the correct user
 */
export const SEARCH_MEMBERS_TOOL = {
    type: "function",
    function: {
        name: "search_members",
        description: "Search for members in the server by name. IMPORTANT: Use this BEFORE kick_member, ban_member, or timeout_member if you can't find a user. Returns up to 10 matching members with their IDs, usernames, and nicknames. This helps you find the correct user even in large servers with millions of members.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The name to search for. Can be a partial username, display name, or nickname."
                },
                limit: {
                    type: "integer",
                    description: "Optional: Maximum number of results to return (1-25). Default is 10."
                }
            },
            required: ["query"]
        }
    }
};

// ============================================================
// TOOL COLLECTIONS
// ============================================================

/**
 * All Discord-related tools
 */
export const DISCORD_TOOLS = [
    // Channel Management
    CREATE_VOICE_CHANNEL_TOOL,
    CREATE_TEXT_CHANNEL_TOOL,
    CREATE_CATEGORY_TOOL,
    DELETE_CHANNEL_TOOL,
    DELETE_CHANNELS_BULK_TOOL,
    LIST_CHANNELS_TOOL,
    GET_SERVER_INFO_TOOL,
    SETUP_SERVER_STRUCTURE_TOOL,
    CONFIGURE_CHANNEL_PERMISSIONS_TOOL,
    EDIT_TEXT_CHANNEL_TOOL,
    EDIT_VOICE_CHANNEL_TOOL,
    EDIT_CATEGORY_TOOL,
    EDIT_CHANNELS_BULK_TOOL,
    RENAME_CHANNEL_TOOL,
    MOVE_CHANNEL_TOOL,
    // Voice Channel Tools
    JOIN_VOICE_TOOL,
    LEAVE_VOICE_TOOL,
    VOICE_CONVERSATION_TOOL,
    MOVE_MEMBER_TOOL,
    MOVE_MEMBERS_BULK_TOOL,
    LIST_VOICE_CHANNELS_TOOL,
    // Role Management
    CREATE_ROLE_TOOL,
    DELETE_ROLE_TOOL,
    DELETE_ROLES_BULK_TOOL,
    EDIT_ROLE_TOOL,
    LIST_ROLES_TOOL,
    ASSIGN_ROLE_TOOL,
    SETUP_ROLES_TOOL,
    // Moderation
    KICK_MEMBER_TOOL,
    BAN_MEMBER_TOOL,
    TIMEOUT_MEMBER_TOOL,
    MANAGE_MESSAGES_TOOL,
    // Utility
    CHECK_PERMS_TOOL,
    LIST_ROLE_PERMISSIONS_TOOL,
    SEARCH_MEMBERS_TOOL
];

/**
 * All available tools (image + Discord)
 */
export const ALL_TOOLS = [
    IMAGE_TOOL,
    ...DISCORD_TOOLS
];

/**
 * Generate a summary of all available tools for the AI system prompt
 * This auto-updates when new tools are added, so the AI always knows what it can do
 * @param {Array} tools - Array of tool definitions (defaults to ALL_TOOLS)
 * @returns {string} Formatted summary of tools
 */
export function getToolsSummary(tools = ALL_TOOLS) {
    const lines = ['AVAILABLE TOOLS:'];

    for (const tool of tools) {
        const func = tool.function;
        if (!func) continue;

        // Get the tool name in a readable format
        const name = func.name;

        // Get a short description (first sentence only)
        const desc = func.description?.split('.')[0] || 'No description';

        lines.push(`- ${name}: ${desc}`);
    }

    return lines.join('\n');
}

/**
 * Get a concise tools list for voice prompts (shorter format)
 * @param {Array} tools - Array of tool definitions
 * @returns {string} Comma-separated list of tool names
 */
export function getToolNames(tools = ALL_TOOLS) {
    return tools
        .map(t => t.function?.name)
        .filter(Boolean)
        .join(', ');
}
