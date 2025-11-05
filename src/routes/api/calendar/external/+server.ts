import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

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

        // Get unique external calendar URLs
        const { data: externalUrls, error: urlsError } = await supabaseAdmin
            .from('events')
            .select('external_calendar_url, created_at')
            .eq('calendar_id', calendar.id)
            .not('external_calendar_url', 'is', null)
            .order('created_at', { ascending: false })

        if (urlsError) {
            throw error(500, 'Failed to fetch external calendars')
        }

        // Group by URL and get counts
        const urlMap = new Map<string, { url: string; count: number; lastImported: string }>()
        
        for (const event of externalUrls || []) {
            const url = event.external_calendar_url!
            if (urlMap.has(url)) {
                urlMap.get(url)!.count++
            } else {
                urlMap.set(url, {
                    url,
                    count: 1,
                    lastImported: event.created_at
                })
            }
        }

        const externalCalendars = Array.from(urlMap.values())

        return json({
            externalCalendars
        })

    } catch (err: any) {
        console.error('External calendars fetch error:', err)
        
        // Re-throw SvelteKit errors
        if (err.status) {
            throw err
        }

        throw error(500, 'Failed to fetch external calendars')
    }
}

export const DELETE: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }

    try {
        const calendarUrl = url.searchParams.get('url')
        
        if (!calendarUrl) {
            throw error(400, 'Calendar URL is required')
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

        // Delete all events from this external calendar
        const { data: deletedEvents, error: deleteError } = await supabaseAdmin
            .from('events')
            .delete()
            .eq('calendar_id', calendar.id)
            .eq('external_calendar_url', calendarUrl)
            .select()

        if (deleteError) {
            throw error(500, 'Failed to delete external calendar events')
        }

        return json({
            success: true,
            message: `Removed ${deletedEvents?.length || 0} events from external calendar`,
            deletedCount: deletedEvents?.length || 0
        })

    } catch (err: any) {
        console.error('External calendar deletion error:', err)
        
        // Re-throw SvelteKit errors
        if (err.status) {
            throw err
        }

        throw error(500, 'Failed to remove external calendar')
    }
}