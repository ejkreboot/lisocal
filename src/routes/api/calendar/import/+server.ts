import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'
import * as ical from 'node-ical'

interface ImportRequest {
    url: string
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

export const POST: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }

    try {
        const { url }: ImportRequest = await request.json()
        
        if (!url) {
            throw error(400, 'URL is required')
        }

        // Convert webcal:// to http:// if needed
        let normalizedUrl = url
        if (url.toLowerCase().startsWith('webcal://')) {
            normalizedUrl = url.replace(/^webcal:\/\//i, 'http://')
        }

        // Validate URL format
        let parsedUrl: URL
        try {
            parsedUrl = new URL(normalizedUrl)
        } catch {
            throw error(400, 'Invalid URL format')
        }

        // Only allow http/https protocols
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw error(400, 'Only HTTP and HTTPS URLs are supported')
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

        // Parse the ICS file from URL
                const events = await ical.fromURL(normalizedUrl)
        
        const importedEvents: Array<{
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

            // Skip "Unavailable" events - these are scheduling blocks, not actual work assignments
            if (icalEvent.summary.toLowerCase().trim() === 'unavailable') {
                continue
            }

            // Determine if it's an all-day event
            const isAllDay = icalEvent.datetype === 'date'
            
            // Store as UTC timestamp - node-ical already gives us the correct Date object
            // toISOString() converts to UTC format (e.g., "2025-12-14T17:00:00.000Z")
            const startDatetimeUtc = icalEvent.start.toISOString()
            const endDatetimeUtc = icalEvent.end ? icalEvent.end.toISOString() : undefined

            importedEvents.push({
                calendar_id: calendar.id,
                title: icalEvent.summary,
                description: icalEvent.summary,
                start_datetime_utc: startDatetimeUtc,
                end_datetime_utc: endDatetimeUtc,
                is_all_day: isAllDay,
                external_id: key,
                external_calendar_url: normalizedUrl
            })
        }

        if (importedEvents.length === 0) {
            return json({ 
                success: true, 
                message: 'No events found in the calendar',
                imported: 0,
                updated: 0,
                deleted: 0
            })
        }

        // Delete existing events from this external calendar URL
        const { error: deleteError } = await supabaseAdmin
            .from('events')
            .delete()
            .eq('calendar_id', calendar.id)
            .eq('external_calendar_url', normalizedUrl)

        if (deleteError) {
            console.error('Error deleting existing events:', deleteError)
            throw error(500, 'Failed to clean up existing events')
        }

        // Insert new events
        const { data: insertedEvents, error: insertError } = await supabaseAdmin
            .from('events')
            .insert(importedEvents)
            .select()

        if (insertError) {
            console.error('Error inserting events:', insertError)
            throw error(500, 'Failed to import events')
        }

        return json({
            success: true,
            message: `Successfully imported ${importedEvents.length} events from external calendar`,
            imported: importedEvents.length,
            updated: 0,
            deleted: 0,
            events: insertedEvents
        })

    } catch (err: any) {
        console.error('Import error:', err)
        
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

        throw error(500, 'Failed to import calendar')
    }
}