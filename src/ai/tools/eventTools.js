/**
 * Discord Tools - Scheduled Events Management
 * 
 * Handlers for creating, deleting, and listing scheduled events.
 * Includes bulk operations.
 */

import {
    ChannelType,
    GuildScheduledEventEntityType,
    GuildScheduledEventPrivacyLevel
} from 'discord.js';
import {
    logger,
    findChannel,
    parseEventTime
} from './helpers.js';

// ============================================================
// SINGLE EVENT HANDLERS
// ============================================================

/**
 * Handler for creating a scheduled event
 */
export async function handleCreateEvent(guild, args) {
    const { name, description, start_time, end_time, location, location_type } = args;

    if (!name || !start_time || !location_type) {
        return { success: false, error: 'Must specify name, start_time, and location_type' };
    }

    try {
        const startDate = parseEventTime(start_time);
        if (isNaN(startDate.getTime())) {
            return { success: false, error: `Invalid start_time format: "${start_time}"` };
        }

        const endDate = end_time ? parseEventTime(end_time) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

        let entityType, channelId = null, entityMetadata = null;

        if (location_type === 'voice') {
            const channel = findChannel(guild, location, 'voice');
            if (!channel) return { success: false, error: `Could not find voice channel "${location}"` };
            entityType = GuildScheduledEventEntityType.Voice;
            channelId = channel.id;
        } else if (location_type === 'stage') {
            const channel = guild.channels.cache.find(c =>
                c.type === ChannelType.GuildStageVoice &&
                c.name.toLowerCase().includes(location.toLowerCase())
            );
            if (!channel) return { success: false, error: `Could not find stage channel "${location}"` };
            entityType = GuildScheduledEventEntityType.StageInstance;
            channelId = channel.id;
        } else { // external
            entityType = GuildScheduledEventEntityType.External;
            entityMetadata = { location: location || 'External' };
        }

        const event = await guild.scheduledEvents.create({
            name,
            description,
            scheduledStartTime: startDate,
            scheduledEndTime: endDate,
            privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
            entityType,
            channel: channelId,
            entityMetadata
        });

        logger.info('TOOL', `Created event "${name}" starting ${startDate.toISOString()}`);

        return {
            success: true,
            event: {
                id: event.id,
                name: event.name,
                start: startDate.toISOString(),
                location: location
            },
            message: `📅 Created event "${name}" starting ${startDate.toLocaleString()}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create event: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for deleting a scheduled event
 */
export async function handleDeleteEvent(guild, args) {
    const { event_name } = args;

    if (!event_name) return { success: false, error: 'Must specify event_name' };

    try {
        const events = await guild.scheduledEvents.fetch();
        const event = events.find(e => e.name.toLowerCase().includes(event_name.toLowerCase()));

        if (!event) return { success: false, error: `Could not find event "${event_name}"` };

        await event.delete();
        logger.info('TOOL', `Deleted event "${event.name}"`);

        return { success: true, message: `🗑️ Deleted event "${event.name}"` };
    } catch (error) {
        logger.error('TOOL', `Failed to delete event: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for listing scheduled events
 */
export async function handleListEvents(guild, args) {
    try {
        const events = await guild.scheduledEvents.fetch();

        const eventList = events.map(e => ({
            id: e.id,
            name: e.name,
            description: e.description,
            start: e.scheduledStartAt.toISOString(),
            status: e.status,
            location: e.channel?.name || e.entityMetadata?.location || 'Unknown'
        }));

        const summary = `📅 **${eventList.length} scheduled events**`;
        logger.info('TOOL', `Listed ${eventList.length} events`);

        return { success: true, events: eventList, count: eventList.length, summary };
    } catch (error) {
        logger.error('TOOL', `Failed to list events: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================================
// BULK EVENT HANDLERS
// ============================================================

/**
 * Handler for bulk creating events
 */
export async function handleCreateEventsBulk(guild, args) {
    const { events } = args;

    if (!events || !Array.isArray(events)) {
        return { success: false, error: 'Must provide array of events' };
    }

    try {
        const results = await Promise.allSettled(
            events.map(async (event) => {
                // Reuse the createEvent logic from handleCreateEvent
                const result = await handleCreateEvent(guild, event);
                if (!result.success) throw new Error(result.error);
                return event.name;
            })
        );

        const created = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk created ${created.length} events, ${failed} failed`);

        return {
            success: created.length > 0,
            created: created.length,
            failed,
            message: `📅 Created ${created.length} event(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to create events bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Handler for bulk deleting events
 */
export async function handleDeleteEventsBulk(guild, args) {
    const { event_names } = args;

    if (!event_names || !Array.isArray(event_names)) {
        return { success: false, error: 'Must provide array of event_names' };
    }

    try {
        const allEvents = await guild.scheduledEvents.fetch();

        const results = await Promise.allSettled(
            event_names.map(async (name) => {
                const event = allEvents.find(e => e.name.toLowerCase().includes(name.toLowerCase()));
                if (!event) throw new Error(`Event "${name}" not found`);
                await event.delete();
                return name;
            })
        );

        const deleted = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info('TOOL', `Bulk deleted ${deleted.length} events, ${failed} failed`);

        return {
            success: deleted.length > 0,
            deleted: deleted.length,
            failed,
            message: `🗑️ Deleted ${deleted.length} event(s)${failed > 0 ? `, ${failed} failed` : ''}`
        };
    } catch (error) {
        logger.error('TOOL', `Failed to delete events bulk: ${error.message}`);
        return { success: false, error: error.message };
    }
}
