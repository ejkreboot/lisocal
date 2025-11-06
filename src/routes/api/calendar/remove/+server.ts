import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

interface RemoveRequest {
    url: string
}

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }

    try {
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

        // Get all unique external calendar URLs and their event counts
        const { data: externalCalendars, error: queryError } = await supabaseAdmin
            .from('events')
            .select('external_calendar_url')
            .eq('calendar_id', calendar.id)
            .not('external_calendar_url', 'is', null)

        if (queryError) {
            console.error('Error fetching external calendars:', queryError)
            throw error(500, 'Failed to fetch external calendars')
        }

        // Group by URL and count events
        const calendarMap = new Map<string, number>()
        
        for (const event of externalCalendars || []) {
            const url = event.external_calendar_url!
            calendarMap.set(url, (calendarMap.get(url) || 0) + 1)
        }

        // Convert to array with metadata
        const calendars = Array.from(calendarMap.entries()).map(([url, count]) => ({
            url,
            eventCount: count,
            // Extract a friendly name from the URL if possible
            name: extractCalendarName(url)
        }))

        return json({
            success: true,
            calendars
        })

    } catch (err: any) {
        console.error('List external calendars error:', err)
        
        // Re-throw SvelteKit errors
        if (err.status) {
            throw err
        }

        throw error(500, 'Failed to list external calendars')
    }
}

/**
 * Extract a friendly name from a calendar URL
 */
function extractCalendarName(url: string): string {
    try {
        const urlObj = new URL(url)
        
        // For Amion calendars, try to extract meaningful parts
        if (urlObj.hostname.includes('amion.com')) {
            const pathParts = urlObj.pathname.split('/')
            const filename = pathParts[pathParts.length - 1]
            if (filename.endsWith('.ics')) {
                return `Amion Schedule (${filename.replace('.ics', '')})`
            }
            return 'Amion Schedule'
        }
        
        // For other calendars, use the hostname
        return urlObj.hostname.replace('www.', '')
        
    } catch {
        // Fallback to the full URL if parsing fails
        return url
    }
}

export const DELETE: RequestHandler = async ({ locals, request }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }

    try {
        const { url }: RemoveRequest = await request.json()
        
        if (!url) {
            throw error(400, 'URL is required')
        }

        // Convert webcal:// to http:// if needed
        let normalizedUrl = url
        if (url.toLowerCase().startsWith('webcal://')) {
            normalizedUrl = url.replace(/^webcal:\/\//i, 'http://')
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

        // First, get count of events that will be deleted for reporting
        const { data: eventsToDelete, error: countError } = await supabaseAdmin
            .from('events')
            .select('id, title')
            .eq('calendar_id', calendar.id)
            .eq('external_calendar_url', normalizedUrl)

        if (countError) {
            console.error('Error counting events to delete:', countError)
            throw error(500, 'Failed to check events for deletion')
        }

        const eventCount = eventsToDelete?.length || 0

        if (eventCount === 0) {
            return json({
                success: true,
                message: 'No events found for the specified external calendar',
                removed: 0
            })
        }

        // Delete all events from this external calendar URL
        const { error: deleteError } = await supabaseAdmin
            .from('events')
            .delete()
            .eq('calendar_id', calendar.id)
            .eq('external_calendar_url', normalizedUrl)

        if (deleteError) {
            console.error('Error deleting external calendar events:', deleteError)
            throw error(500, 'Failed to remove external calendar events')
        }


        return json({
            success: true,
            message: `Successfully removed ${eventCount} events from external calendar`,
            removed: eventCount,
            url: normalizedUrl
        })

    } catch (err: any) {
        console.error('Remove external calendar error:', err)
        
        // Re-throw SvelteKit errors
        if (err.status) {
            throw err
        }

        throw error(500, 'Failed to remove external calendar')
    }
}