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
 * Tool definition for setting up a complete server structure in parallel
 * This is the PREFERRED tool when creating multiple channels/categories at once
 */
export const SETUP_SERVER_STRUCTURE_TOOL = {
    type: "function",
    function: {
        name: "setup_server_structure",
        description: "Create multiple categories and channels at once, all processed in parallel for maximum speed. USE THIS instead of calling create_category/create_text_channel/create_voice_channel multiple times. Perfect for setting up a server structure, creating a template, or adding multiple channels at once.",
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

// ============================================================
// TOOL COLLECTIONS
// ============================================================

/**
 * All Discord-related tools
 */
export const DISCORD_TOOLS = [
    CREATE_VOICE_CHANNEL_TOOL,
    CREATE_TEXT_CHANNEL_TOOL,
    CREATE_CATEGORY_TOOL,
    DELETE_CHANNEL_TOOL,
    DELETE_CHANNELS_BULK_TOOL,
    LIST_CHANNELS_TOOL,
    SETUP_SERVER_STRUCTURE_TOOL
];

/**
 * All available tools (image + Discord)
 */
export const ALL_TOOLS = [
    IMAGE_TOOL,
    ...DISCORD_TOOLS
];
