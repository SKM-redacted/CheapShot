/**
 * Discord Tool Handlers
 * 
 * This file re-exports all handlers from the modular tools directory.
 * Tool implementations are split into separate files for better organization:
 * 
 * - helpers.js: Shared utility functions (color parsing, finding channels/members/roles, etc.)
 * - channelTools.js: Channel creation, deletion, editing, and listing
 * - roleTools.js: Role creation, deletion, editing, listing, and assignment
 * - voiceTools.js: Voice channel joining, leaving, and member movement
 * - moderationTools.js: Kick, ban, timeout, and message management
 * - messageTools.js: Pin, unpin, publish, and delete messages
 * - webhookTools.js: Webhook creation, deletion, and listing
 * - eventTools.js: Scheduled event management
 * - emojiTools.js: Custom emoji management
 * - threadTools.js: Thread creation and archiving
 * - inviteTools.js: Server invite management
 * - serverTools.js: Server info, settings, and structure setup
 * 
 * Tool definitions (schemas) are in toolDefinitions.js
 */

// Re-export everything from the modular tools index
export * from './tools/index.js';
