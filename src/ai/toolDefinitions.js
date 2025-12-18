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
 * Tool definition for deleting a single message by ID
 */
export const DELETE_MESSAGE_TOOL = {
    type: "function",
    function: {
        name: "delete_message",
        description: "Delete a single message. If the user is replying to a message, you do NOT need to provide the message_id - the replied-to message will be deleted. Only provide message_id if you need to delete a specific message by ID (e.g., from list_messages).",
        parameters: {
            type: "object",
            properties: {
                message_id: {
                    type: "string",
                    description: "Optional: The ID of the message to delete. If not provided and the user is replying to a message, that message will be deleted."
                },
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel the message is in. Defaults to the current channel."
                },
                reason: {
                    type: "string",
                    description: "Optional: The reason for deleting this message. Will be logged."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for bulk deleting messages by their IDs
 * This uses Discord's message.delete() for each ID rather than bulkDelete by count
 */
export const DELETE_MESSAGES_BULK_TOOL = {
    type: "function",
    function: {
        name: "delete_messages_bulk",
        description: "Delete multiple messages at once by their message IDs. Use this when you need to delete specific messages by ID. Note: Messages older than 14 days cannot be bulk deleted by Discord API limitations.",
        parameters: {
            type: "object",
            properties: {
                message_ids: {
                    type: "array",
                    description: "Array of message IDs to delete.",
                    items: {
                        type: "string"
                    }
                },
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel the messages are in. Defaults to the current channel."
                },
                reason: {
                    type: "string",
                    description: "Optional: The reason for deleting these messages. Will be logged."
                }
            },
            required: ["message_ids"]
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
        description: "Rename a channel (text, voice, or category). IMPORTANT: When the user says 'this channel' or 'the current channel', set use_current_channel to true instead of guessing the channel name. If you specify a channel by name and it's not found, the tool will return a list of available channels so you can try again with the correct name.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The current name of the channel to rename. Not required if use_current_channel is true."
                },
                new_name: {
                    type: "string",
                    description: "The new name for the channel (including any emoji if desired)."
                },
                use_current_channel: {
                    type: "boolean",
                    description: "If true, rename the channel where the command was issued (the 'current' or 'this' channel). Preferred when user refers to 'this channel' or 'current channel'."
                }
            },
            required: ["new_name"]
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
// STICKER MANAGEMENT TOOLS
// ============================================================

/**
 * Tool definition for creating a sticker
 */
export const CREATE_STICKER_TOOL = {
    type: "function",
    function: {
        name: "create_sticker",
        description: "Create a new custom sticker for the Discord server. Stickers must be PNG, APNG, or Lottie JSON format, 320x320 pixels, under 512KB. Use this when the user asks to create, make, or add a sticker.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name for the sticker (2-30 characters)."
                },
                file_url: {
                    type: "string",
                    description: "URL to the sticker image file (PNG, APNG, or Lottie JSON). Must be 320x320 pixels and under 512KB."
                },
                tags: {
                    type: "string",
                    description: "A Unicode emoji that represents the sticker's expression (e.g., '😀', '😎', '🎉'). This is used for sticker suggestions."
                },
                description: {
                    type: "string",
                    description: "Optional: A description for the sticker (2-100 characters)."
                }
            },
            required: ["name", "file_url", "tags"]
        }
    }
};

/**
 * Tool definition for deleting a sticker
 */
export const DELETE_STICKER_TOOL = {
    type: "function",
    function: {
        name: "delete_sticker",
        description: "Delete a custom sticker from the Discord server. Use this when the user asks to delete, remove, or get rid of a sticker.",
        parameters: {
            type: "object",
            properties: {
                sticker_name: {
                    type: "string",
                    description: "The name of the sticker to delete."
                }
            },
            required: ["sticker_name"]
        }
    }
};

/**
 * Tool definition for listing stickers
 */
export const LIST_STICKERS_TOOL = {
    type: "function",
    function: {
        name: "list_stickers",
        description: "List all custom stickers in the Discord server. Use this to see what stickers exist before creating or deleting stickers.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
};

/**
 * Tool definition for bulk creating stickers
 */
export const CREATE_STICKERS_BULK_TOOL = {
    type: "function",
    function: {
        name: "create_stickers_bulk",
        description: "Create multiple stickers at once in parallel. Use this when the user wants to add many stickers at once.",
        parameters: {
            type: "object",
            properties: {
                stickers: {
                    type: "array",
                    description: "Array of stickers to create.",
                    items: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "The name for the sticker (2-30 characters)"
                            },
                            file_url: {
                                type: "string",
                                description: "URL to the sticker image file"
                            },
                            tags: {
                                type: "string",
                                description: "A Unicode emoji representing the sticker's expression"
                            },
                            description: {
                                type: "string",
                                description: "Optional description for the sticker"
                            }
                        },
                        required: ["name", "file_url", "tags"]
                    }
                }
            },
            required: ["stickers"]
        }
    }
};

/**
 * Tool definition for bulk deleting stickers
 */
export const DELETE_STICKERS_BULK_TOOL = {
    type: "function",
    function: {
        name: "delete_stickers_bulk",
        description: "Delete multiple stickers at once in parallel. Use this after using list_stickers to see what exists, then call this with the specific stickers you want to delete.",
        parameters: {
            type: "object",
            properties: {
                sticker_names: {
                    type: "array",
                    description: "Array of sticker names to delete.",
                    items: {
                        type: "string",
                        description: "The name of the sticker to delete"
                    }
                }
            },
            required: ["sticker_names"]
        }
    }
};



/**
 * Tool definition for listing recent messages in a channel
 */
export const LIST_MESSAGES_TOOL = {
    type: "function",
    function: {
        name: "list_messages",
        description: "List recent messages in a channel to get their IDs. Use this when you need to pin/delete/interact with a message but don't have its ID.",
        parameters: {
            type: "object",
            properties: {
                count: {
                    type: "integer",
                    description: "Number of messages to list (default 10, max 50)."
                },
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel to list messages from. Defaults to current channel."
                }
            },
            required: []
        }
    }
};

// ============================================================
// MESSAGE MANAGEMENT TOOLS (Pinning, Publishing)
// ============================================================

/**
 * Tool definition for pinning a message
 */
export const PIN_MESSAGE_TOOL = {
    type: "function",
    function: {
        name: "pin_message",
        description: "Pin a message to the channel. If the user is replying to a message, you do NOT need to provide the message_id - the replied-to message will be pinned. Only provide message_id if you need to pin a specific message by ID.",
        parameters: {
            type: "object",
            properties: {
                message_id: {
                    type: "string",
                    description: "Optional: The ID of the message to pin. If not provided and the user is replying to a message, that message will be pinned."
                },
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel the message is in. Defaults to current channel."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for unpinning a message
 */
export const UNPIN_MESSAGE_TOOL = {
    type: "function",
    function: {
        name: "unpin_message",
        description: "Unpin a message from the channel. If the user is replying to a message, you do NOT need to provide the message_id - the replied-to message will be unpinned. Only provide message_id if you need to unpin a specific message by ID.",
        parameters: {
            type: "object",
            properties: {
                message_id: {
                    type: "string",
                    description: "Optional: The ID of the message to unpin. If not provided and the user is replying to a message, that message will be unpinned."
                },
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel the message is in. Defaults to current channel."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for listing pinned messages
 */
export const LIST_PINNED_MESSAGES_TOOL = {
    type: "function",
    function: {
        name: "list_pinned_messages",
        description: "List all pinned messages in a channel.",
        parameters: {
            type: "object",
            properties: {
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel to list pins from. Defaults to current channel."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for publishing a message (Announcement channels only)
 */
export const PUBLISH_MESSAGE_TOOL = {
    type: "function",
    function: {
        name: "publish_message",
        description: "Publish a message in an Announcement channel so it is pushed to following servers. If the user is replying to a message, you do NOT need to provide the message_id - the replied-to message will be published. Only provide message_id if you need to publish a specific message by ID.",
        parameters: {
            type: "object",
            properties: {
                message_id: {
                    type: "string",
                    description: "Optional: The ID of the message to publish. If not provided and the user is replying to a message, that message will be published."
                },
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel the message is in. Defaults to current channel."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for bulk pinning messages
 */
export const PIN_MESSAGES_BULK_TOOL = {
    type: "function",
    function: {
        name: "pin_messages_bulk",
        description: "Pin multiple recent messages at once. PREFERRED: Use 'count' to pin the N most recent messages (no need to list IDs). Alternatively, provide message_ids if you have specific IDs.",
        parameters: {
            type: "object",
            properties: {
                count: {
                    type: "integer",
                    description: "RECOMMENDED: Number of recent messages to pin (1-50). The tool will fetch and pin the N most recent messages automatically."
                },
                message_ids: {
                    type: "array",
                    description: "Alternative: Array of specific message IDs to pin. Only use if you have exact IDs.",
                    items: { type: "string" }
                },
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel the messages are in. Defaults to current channel."
                }
            },
            required: []
        }
    }
};

/**
 * Tool definition for bulk unpinning messages
 */
export const UNPIN_MESSAGES_BULK_TOOL = {
    type: "function",
    function: {
        name: "unpin_messages_bulk",
        description: "Unpin multiple messages at once. PREFERRED: Use 'all: true' to unpin ALL pinned messages (no need to list IDs). Alternatively, provide message_ids if you have specific IDs.",
        parameters: {
            type: "object",
            properties: {
                all: {
                    type: "boolean",
                    description: "RECOMMENDED: Set to true to unpin ALL pinned messages in the channel. No need to specify IDs."
                },
                message_ids: {
                    type: "array",
                    description: "Alternative: Array of specific message IDs to unpin. Only use if you have exact IDs.",
                    items: { type: "string" }
                },
                channel: {
                    type: "string",
                    description: "Optional: The name of the channel the messages are in. Defaults to current channel."
                }
            },
            required: []
        }
    }
};

// ============================================================
// EMOJI MANAGEMENT TOOLS
// ============================================================

export const CREATE_EMOJI_TOOL = {
    type: "function",
    function: {
        name: "create_emoji",
        description: "Create a custom emoji from an image URL. The image should be under 256KB and will be resized to 128x128.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name for the emoji (2-32 characters, alphanumeric and underscores only)."
                },
                image_url: {
                    type: "string",
                    description: "URL to the image file (PNG, JPG, or GIF for animated)."
                }
            },
            required: ["name", "image_url"]
        }
    }
};

export const DELETE_EMOJI_TOOL = {
    type: "function",
    function: {
        name: "delete_emoji",
        description: "Delete a custom emoji from the server.",
        parameters: {
            type: "object",
            properties: {
                emoji_name: {
                    type: "string",
                    description: "The name of the emoji to delete."
                }
            },
            required: ["emoji_name"]
        }
    }
};

export const LIST_EMOJIS_TOOL = {
    type: "function",
    function: {
        name: "list_emojis",
        description: "List all custom emojis in the server. Use this to see what emojis exist before creating or deleting.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
};

export const CREATE_EMOJIS_BULK_TOOL = {
    type: "function",
    function: {
        name: "create_emojis_bulk",
        description: "Create multiple custom emojis at once.",
        parameters: {
            type: "object",
            properties: {
                emojis: {
                    type: "array",
                    description: "Array of emojis to create.",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Emoji name" },
                            image_url: { type: "string", description: "URL to image" }
                        },
                        required: ["name", "image_url"]
                    }
                }
            },
            required: ["emojis"]
        }
    }
};

export const DELETE_EMOJIS_BULK_TOOL = {
    type: "function",
    function: {
        name: "delete_emojis_bulk",
        description: "Delete multiple custom emojis at once.",
        parameters: {
            type: "object",
            properties: {
                emoji_names: {
                    type: "array",
                    description: "Array of emoji names to delete.",
                    items: { type: "string" }
                }
            },
            required: ["emoji_names"]
        }
    }
};

// ============================================================
// INVITE MANAGEMENT TOOLS
// ============================================================

export const CREATE_INVITE_TOOL = {
    type: "function",
    function: {
        name: "create_invite",
        description: "Create a server invite link. Can specify expiration and max uses.",
        parameters: {
            type: "object",
            properties: {
                channel: {
                    type: "string",
                    description: "Optional: Channel to create invite for. Defaults to first text channel."
                },
                max_age: {
                    type: "integer",
                    description: "Optional: Invite expiry in seconds. 0 = never expire. Default is 86400 (24 hours)."
                },
                max_uses: {
                    type: "integer",
                    description: "Optional: Max number of uses. 0 = unlimited. Default is 0."
                },
                temporary: {
                    type: "boolean",
                    description: "Optional: If true, members are kicked when they disconnect unless assigned a role. Default is false."
                }
            },
            required: []
        }
    }
};

export const LIST_INVITES_TOOL = {
    type: "function",
    function: {
        name: "list_invites",
        description: "List all active invites for the server with usage statistics.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
};

// ============================================================
// WEBHOOK MANAGEMENT TOOLS
// ============================================================

export const CREATE_WEBHOOK_TOOL = {
    type: "function",
    function: {
        name: "create_webhook",
        description: "Create a webhook for a channel. Webhooks let you send messages with custom names and avatars.",
        parameters: {
            type: "object",
            properties: {
                channel: {
                    type: "string",
                    description: "The channel to create the webhook in."
                },
                name: {
                    type: "string",
                    description: "The name for the webhook."
                },
                avatar_url: {
                    type: "string",
                    description: "Optional: URL to an image for the webhook avatar."
                }
            },
            required: ["channel", "name"]
        }
    }
};

export const DELETE_WEBHOOK_TOOL = {
    type: "function",
    function: {
        name: "delete_webhook",
        description: "Delete a webhook from the server.",
        parameters: {
            type: "object",
            properties: {
                webhook_name: {
                    type: "string",
                    description: "The name of the webhook to delete."
                },
                channel: {
                    type: "string",
                    description: "Optional: Channel to search in. If not specified, searches all channels."
                }
            },
            required: ["webhook_name"]
        }
    }
};

export const LIST_WEBHOOKS_TOOL = {
    type: "function",
    function: {
        name: "list_webhooks",
        description: "List all webhooks in the server or a specific channel. Call this ONCE to get the list, then respond to the user with what you found. Do NOT call this multiple times - the results won't change.",
        parameters: {
            type: "object",
            properties: {
                channel: {
                    type: "string",
                    description: "Optional: Channel to list webhooks from. If not specified, lists all server webhooks."
                }
            },
            required: []
        }
    }
};

export const CREATE_WEBHOOKS_BULK_TOOL = {
    type: "function",
    function: {
        name: "create_webhooks_bulk",
        description: "Create multiple webhooks at once.",
        parameters: {
            type: "object",
            properties: {
                webhooks: {
                    type: "array",
                    description: "Array of webhooks to create.",
                    items: {
                        type: "object",
                        properties: {
                            channel: { type: "string", description: "Channel name" },
                            name: { type: "string", description: "Webhook name" },
                            avatar_url: { type: "string", description: "Optional avatar URL" }
                        },
                        required: ["channel", "name"]
                    }
                }
            },
            required: ["webhooks"]
        }
    }
};

export const DELETE_WEBHOOKS_BULK_TOOL = {
    type: "function",
    function: {
        name: "delete_webhooks_bulk",
        description: "Delete multiple webhooks at once.",
        parameters: {
            type: "object",
            properties: {
                webhook_names: {
                    type: "array",
                    description: "Array of webhook names to delete.",
                    items: { type: "string" }
                }
            },
            required: ["webhook_names"]
        }
    }
};

// ============================================================
// THREAD MANAGEMENT TOOLS
// ============================================================

export const CREATE_THREAD_TOOL = {
    type: "function",
    function: {
        name: "create_thread",
        description: "Create a new thread in a channel. Can create from a message or as a standalone thread.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name for the thread."
                },
                channel: {
                    type: "string",
                    description: "Optional: Channel to create thread in. Defaults to current channel."
                },
                message_id: {
                    type: "string",
                    description: "Optional: Message ID to start thread from. If not provided, creates standalone thread."
                },
                auto_archive: {
                    type: "integer",
                    description: "Optional: Auto-archive duration in minutes (60, 1440, 4320, 10080). Default is 1440 (24 hours)."
                },
                private: {
                    type: "boolean",
                    description: "Optional: If true, creates a private thread. Default is false (public thread)."
                }
            },
            required: ["name"]
        }
    }
};

export const ARCHIVE_THREAD_TOOL = {
    type: "function",
    function: {
        name: "archive_thread",
        description: "Archive an active thread.",
        parameters: {
            type: "object",
            properties: {
                thread_name: {
                    type: "string",
                    description: "The name of the thread to archive."
                }
            },
            required: ["thread_name"]
        }
    }
};

export const LIST_THREADS_TOOL = {
    type: "function",
    function: {
        name: "list_threads",
        description: "List all active threads in the server. Call this ONCE to get the list, then respond to the user with what you found. Do NOT call this multiple times - the results won't change.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
};

export const CREATE_THREADS_BULK_TOOL = {
    type: "function",
    function: {
        name: "create_threads_bulk",
        description: "Create multiple threads at once.",
        parameters: {
            type: "object",
            properties: {
                threads: {
                    type: "array",
                    description: "Array of threads to create.",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Thread name" },
                            channel: { type: "string", description: "Optional channel name" },
                            private: { type: "boolean", description: "Optional: private thread" }
                        },
                        required: ["name"]
                    }
                }
            },
            required: ["threads"]
        }
    }
};

export const ARCHIVE_THREADS_BULK_TOOL = {
    type: "function",
    function: {
        name: "archive_threads_bulk",
        description: "Archive multiple threads at once.",
        parameters: {
            type: "object",
            properties: {
                thread_names: {
                    type: "array",
                    description: "Array of thread names to archive.",
                    items: { type: "string" }
                }
            },
            required: ["thread_names"]
        }
    }
};

// ============================================================
// SCHEDULED EVENT TOOLS
// ============================================================

export const CREATE_EVENT_TOOL = {
    type: "function",
    function: {
        name: "create_event",
        description: "Create a scheduled event. Can be voice channel, stage channel, or external location. Call this ONCE to create the event.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The name of the event."
                },
                description: {
                    type: "string",
                    description: "Optional: Description of the event."
                },
                start_time: {
                    type: "string",
                    description: "When the event starts. Supports: ISO 8601 (2024-01-15T14:00:00), day names (Saturday at 9pm, next Friday at 2pm), relative (tomorrow at 3pm, in 2 hours)."
                },
                end_time: {
                    type: "string",
                    description: "Optional: When the event ends. Defaults to 2 hours after start."
                },
                location_type: {
                    type: "string",
                    enum: ["voice", "stage", "external"],
                    description: "Type of location: 'voice' for voice channel, 'stage' for stage channel, 'external' for outside Discord."
                },
                location: {
                    type: "string",
                    description: "For voice/stage: channel name. For external: location text (e.g., 'Zoom Meeting', 'https://meet.google.com/xyz')."
                }
            },
            required: ["name", "start_time", "location_type", "location"]
        }
    }
};

export const DELETE_EVENT_TOOL = {
    type: "function",
    function: {
        name: "delete_event",
        description: "Delete a scheduled event. First call list_events to find the exact event name, then call this ONCE to delete it.",
        parameters: {
            type: "object",
            properties: {
                event_name: {
                    type: "string",
                    description: "The name of the event to delete. Must match an existing event from list_events."
                }
            },
            required: ["event_name"]
        }
    }
};

export const LIST_EVENTS_TOOL = {
    type: "function",
    function: {
        name: "list_events",
        description: "List all scheduled events in the server. Call this ONCE to get the list, then respond to the user with what you found. Do NOT call this multiple times - the results won't change.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
};

export const CREATE_EVENTS_BULK_TOOL = {
    type: "function",
    function: {
        name: "create_events_bulk",
        description: "Create multiple scheduled events at once.",
        parameters: {
            type: "object",
            properties: {
                events: {
                    type: "array",
                    description: "Array of events to create.",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Event name" },
                            start_time: { type: "string", description: "Start time" },
                            location_type: { type: "string", description: "voice, stage, or external" },
                            location: { type: "string", description: "Channel name or external location" },
                            description: { type: "string", description: "Optional description" }
                        },
                        required: ["name", "start_time", "location_type", "location"]
                    }
                }
            },
            required: ["events"]
        }
    }
};

export const DELETE_EVENTS_BULK_TOOL = {
    type: "function",
    function: {
        name: "delete_events_bulk",
        description: "Delete multiple scheduled events at once.",
        parameters: {
            type: "object",
            properties: {
                event_names: {
                    type: "array",
                    description: "Array of event names to delete.",
                    items: { type: "string" }
                }
            },
            required: ["event_names"]
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
    DELETE_MESSAGE_TOOL,
    DELETE_MESSAGES_BULK_TOOL,
    PIN_MESSAGE_TOOL,
    UNPIN_MESSAGE_TOOL,
    LIST_PINNED_MESSAGES_TOOL,
    LIST_MESSAGES_TOOL,
    PUBLISH_MESSAGE_TOOL,
    PIN_MESSAGES_BULK_TOOL,
    UNPIN_MESSAGES_BULK_TOOL,
    // Sticker Management
    CREATE_STICKER_TOOL,
    DELETE_STICKER_TOOL,
    LIST_STICKERS_TOOL,
    CREATE_STICKERS_BULK_TOOL,
    DELETE_STICKERS_BULK_TOOL,
    // Emoji Management
    CREATE_EMOJI_TOOL,
    DELETE_EMOJI_TOOL,
    LIST_EMOJIS_TOOL,
    CREATE_EMOJIS_BULK_TOOL,
    DELETE_EMOJIS_BULK_TOOL,
    // Invite Management
    CREATE_INVITE_TOOL,
    LIST_INVITES_TOOL,
    // Webhook Management
    CREATE_WEBHOOK_TOOL,
    DELETE_WEBHOOK_TOOL,
    LIST_WEBHOOKS_TOOL,
    CREATE_WEBHOOKS_BULK_TOOL,
    DELETE_WEBHOOKS_BULK_TOOL,
    // Thread Management
    CREATE_THREAD_TOOL,
    ARCHIVE_THREAD_TOOL,
    LIST_THREADS_TOOL,
    CREATE_THREADS_BULK_TOOL,
    ARCHIVE_THREADS_BULK_TOOL,
    // Scheduled Events
    CREATE_EVENT_TOOL,
    DELETE_EVENT_TOOL,
    LIST_EVENTS_TOOL,
    CREATE_EVENTS_BULK_TOOL,
    DELETE_EVENTS_BULK_TOOL,
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
