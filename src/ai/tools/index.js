/**
 * Discord Tools Index
 * 
 * This file re-exports all handlers from the modular tool files,
 * providing a single import point for the discordTools module.
 */

// ============================================================
// HELPER EXPORTS
// ============================================================
export {
    logger,
    COLOR_MAP,
    parseColor,
    parsePermissions,
    getPermissionName,
    buildPermissionOverwrites,
    findChannel,
    findVoiceChannel,
    findBestVoiceCategory,
    findBestTextCategory,
    findRole,
    findMember,
    findMemberSmart,
    parseDuration,
    parseEventTime
} from './helpers.js';

// ============================================================
// CHANNEL TOOL EXPORTS
// ============================================================
export {
    handleCreateVoiceChannel,
    handleCreateTextChannel,
    handleCreateCategory,
    handleDeleteChannel,
    handleDeleteChannelsBulk,
    handleEditTextChannel,
    handleEditVoiceChannel,
    handleEditCategory,
    handleEditChannelsBulk,
    handleListChannels,
    handleRenameChannel,
    handleMoveChannel,
    handleCreateStageChannel,
    handleCreateForumChannel
} from './channelTools.js';

// ============================================================
// ROLE TOOL EXPORTS
// ============================================================
export {
    handleCreateRole,
    handleDeleteRole,
    handleDeleteRolesBulk,
    handleEditRole,
    handleListRoles,
    handleListRolePermissions,
    handleAssignRole,
    handleSetupRoles
} from './roleTools.js';

// ============================================================
// VOICE TOOL EXPORTS
// ============================================================
export {
    handleJoinVoice,
    handleLeaveVoice,
    handleVoiceConversation,
    handleMoveMember,
    handleMoveMembersBulk,
    handleListVoiceChannels
} from './voiceTools.js';

// ============================================================
// MODERATION TOOL EXPORTS
// ============================================================
export {
    handleCheckPerms,
    handleSearchMembers,
    handleKickMember,
    handleBanMember,
    handleTimeoutMember,
    handleManageMessages
} from './moderationTools.js';

// ============================================================
// MESSAGE TOOL EXPORTS
// ============================================================
export {
    handlePinMessage,
    handleUnpinMessage,
    handleListPinnedMessages,
    handlePublishMessage,
    handleDeleteMessage,
    handlePinMessagesBulk,
    handleUnpinMessagesBulk,
    handleDeleteMessagesBulk,
    handlePublishMessagesBulk,
    handleListMessages
} from './messageTools.js';

// ============================================================
// WEBHOOK TOOL EXPORTS
// ============================================================
export {
    handleCreateWebhook,
    handleDeleteWebhook,
    handleListWebhooks,
    handleCreateWebhooksBulk,
    handleDeleteWebhooksBulk
} from './webhookTools.js';

// ============================================================
// EVENT TOOL EXPORTS
// ============================================================
export {
    handleCreateEvent,
    handleDeleteEvent,
    handleListEvents,
    handleCreateEventsBulk,
    handleDeleteEventsBulk
} from './eventTools.js';

// ============================================================
// EMOJI TOOL EXPORTS
// ============================================================
export {
    handleCreateEmoji,
    handleDeleteEmoji,
    handleListEmojis,
    handleCreateEmojisBulk,
    handleDeleteEmojisBulk
} from './emojiTools.js';

// ============================================================
// STICKER TOOL EXPORTS
// ============================================================
export {
    handleCreateSticker,
    handleDeleteSticker,
    handleListStickers,
    handleCreateStickersBulk,
    handleDeleteStickersBulk
} from './stickerTools.js';

// ============================================================
// THREAD TOOL EXPORTS
// ============================================================
export {
    handleCreateThread,
    handleArchiveThread,
    handleCreateThreadsBulk,
    handleArchiveThreadsBulk
} from './threadTools.js';

// ============================================================
// INVITE TOOL EXPORTS
// ============================================================
export {
    handleCreateInvite,
    handleListInvites
} from './inviteTools.js';

// ============================================================
// SERVER TOOL EXPORTS
// ============================================================
export {
    handleGetServerInfo,
    handleEditServer,
    handleSetupServerStructure,
    handleConfigureChannelPermissions,
    setHandlerReferences
} from './serverTools.js';

// ============================================================
// INITIALIZATION
// ============================================================

// Import handlers to set up circular dependency resolution for serverTools
import { handleListChannels } from './channelTools.js';
import { handleCreateRole } from './roleTools.js';
import { setHandlerReferences } from './serverTools.js';

// Set up handler references for serverTools (to avoid circular dependencies)
setHandlerReferences({
    handleListChannels,
    handleCreateRole
});
