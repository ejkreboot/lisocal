import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'
import ical from 'node-ical'

interface SyncRequest {
    url: string
    etag?: string
    lastModified?: string
}

interface ICalEvent {
    uid?: string
    summary?: string
    description?: string
    start?: Date
    end?: Date
    datetype?: 'date' | 'date-time'
    location?: string
    organizer?: string
    status?: string
    type: string
}

async function fetchWithHeaders(url: string, etag?: string, lastModified?: string) {
    const headers: Record<string, string> = {}
    
    if (etag) {
        headers['If-None-Match'] = etag
    }
    
    if (lastModified) {
        headers['If-Modified-Since'] = lastModified
    }

    const response = await fetch(url, { headers })
    
    return {
        status: response.status,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        text: response.status === 304 ? null : await response.text()
    }
}

export const POST: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }

    try {
        const { url, etag, lastModified }: SyncRequest = await request.json()
        
        if (!url) {
            throw error(400, 'URL is required')
        }

        // Get user's calendar
        const { data: calendar, error: calendarError } = await supabaseAdmin
            .from('calendars')
            .select('id')
            .eq('user_id', locals.user.id)
            .limit(1)
            .single()

        if (calendarError || !calendar) {
            throw error(500, 'Failed to find user calendar')
        }

        // Check if the calendar has been modified using HTTP conditional requests
                const fetchResult = await fetchWithHeaders(url, etag, lastModified)
        
        if (fetchResult.status === 304) {
            // Calendar hasn't changed
            return json({
                success: true,
                message: 'Calendar is up to date',
                hasChanges: false,
                imported: 0,
                updated: 0,
                deleted: 0
            })
        }

        if (fetchResult.status !== 200 || !fetchResult.text) {
            throw error(400, 'Could not fetch calendar from the provided URL')
        }

        // Parse the ICS content
        const events = ical.parseICS(fetchResult.text)
        
        // Get existing events from this external calendar
        const { data: existingEvents, error: existingError } = await supabaseAdmin
            .from('events')
            .select('external_id, id')
            .eq('calendar_id', calendar.id)
            .eq('external_calendar_url', url)

        if (existingError) {
            throw error(500, 'Failed to fetch existing events')
        }

        const existingEventIds = new Set(existingEvents?.map(e => e.external_id) || [])
        const currentEventIds = new Set<string>()
        
        const eventsToImport: Array<{
            calendar_id: string
            title: string
            description?: string
            start_datetime_utc: string
            end_datetime_utc?: string
            is_all_day: boolean
            external_id: string
            external_calendar_url: string
        }> = []

        // Process each event
        for (const [key, event] of Object.entries(events)) {
            const icalEvent = event as ICalEvent
            
            // Only process VEVENT type events
            if (icalEvent.type !== 'VEVENT' || !icalEvent.uid || !icalEvent.summary || !icalEvent.start) {
                continue
            }

            // Skip "Unavailable" events with empty descriptions
            if (icalEvent.summary === 'Unavailable' && (!icalEvent.description || icalEvent.description.trim() === '')) {
                                continue
            }

            currentEventIds.add(icalEvent.uid)

            // Determine if it's an all-day event
            const isAllDay = icalEvent.datetype === 'date'
            
            // Store as UTC timestamp - node-ical already gives us the correct Date object
            const startDatetimeUtc = icalEvent.start.toISOString()
            const endDatetimeUtc = icalEvent.end ? icalEvent.end.toISOString() : undefined

            eventsToImport.push({
                calendar_id: calendar.id,
                title: icalEvent.summary,
                description: icalEvent.description || undefined,
                start_datetime_utc: startDatetimeUtc,
                end_datetime_utc: endDatetimeUtc,
                is_all_day: isAllDay,
                external_id: icalEvent.uid,
                external_calendar_url: url
            })
        }

        // Find events to delete (exist in DB but not in current ICS)
        const eventsToDelete = existingEvents?.filter(e => !currentEventIds.has(e.external_id)) || []
        
        // Find new events (exist in ICS but not in DB)
        const newEvents = eventsToImport.filter(e => !existingEventIds.has(e.external_id))

        let deletedCount = 0
        let importedCount = 0
        let updatedCount = 0

        // Delete removed events
        if (eventsToDelete.length > 0) {
            const { error: deleteError } = await supabaseAdmin
                .from('events')
                .delete()
                .in('id', eventsToDelete.map(e => e.id))

            if (deleteError) {
                console.error('Error deleting events:', deleteError)
            } else {
                deletedCount = eventsToDelete.length
            }
        }

        // Replace all existing events with current ones (simpler than updating individual events)
        // This handles both new and updated events
        if (eventsToImport.length > 0) {
            // Delete all existing events from this calendar
            const { error: deleteAllError } = await supabaseAdmin
                .from('events')
                .delete()
                .eq('calendar_id', calendar.id)
                .eq('external_calendar_url', url)

            if (deleteAllError) {
                throw error(500, 'Failed to clean up existing events')
            }

            // Insert all current events
            const { error: insertError } = await supabaseAdmin
                .from('events')
                .insert(eventsToImport)

            if (insertError) {
                console.error('Error inserting events:', insertError)
                throw error(500, 'Failed to sync events')
            }

            importedCount = newEvents.length
            updatedCount = eventsToImport.length - newEvents.length
        }

        // Update sync metadata
        await supabaseAdmin
            .from('external_calendar_sync')
            .upsert({
                calendar_id: calendar.id,
                external_url: url,
                etag: fetchResult.etag,
                last_modified: fetchResult.lastModified,
                last_synced: new Date().toISOString()
            }, {
                onConflict: 'calendar_id,external_url'
            })

        return json({
            success: true,
            message: `Sync completed: ${importedCount} new, ${updatedCount} updated, ${deletedCount} deleted`,
            hasChanges: importedCount > 0 || updatedCount > 0 || deletedCount > 0,
            imported: importedCount,
            updated: updatedCount,
            deleted: deletedCount,
            etag: fetchResult.etag,
            lastModified: fetchResult.lastModified
        })

    } catch (err: any) {
        console.error('Sync error:', err)
        
        // Handle node-ical specific errors
        if (err.message?.includes('Invalid URL') || err.message?.includes('ENOTFOUND')) {
            throw error(400, 'Could not fetch calendar from the provided URL')
        }
        
        if (err.message?.includes('Invalid calendar')) {
            throw error(400, 'The URL does not contain a valid iCalendar file')
        }

        // Re-throw SvelteKit errors
        if (err.status) {
            throw err
        }

        throw error(500, 'Failed to sync calendar')
    }
}