import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

// GET events for a shared calendar
export const GET: RequestHandler = async ({ url }) => {
    const shareToken = url.searchParams.get('shareToken')
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    
    if (!shareToken) {
        throw error(400, 'Share token is required')
    }
    
    try {
        // Verify the share token and get calendar info
        const { data: sharedLink, error: linkError } = await supabaseAdmin
            .from('shared_links')
            .select(`
                id,
                calendar_id,
                permissions,
                expires_at,
                calendars!inner (
                    id,
                    name,
                    description
                )
            `)
            .eq('share_token', shareToken)
            .single()
        
        if (linkError || !sharedLink) {
            throw error(404, 'Shared calendar not found')
        }
        
        // Check if link has expired
        if (sharedLink.expires_at && new Date(sharedLink.expires_at) <= new Date()) {
            throw error(404, 'Shared calendar link has expired')
        }
        
        // Get events for the calendar
        let eventsQuery = supabaseAdmin
            .from('events')
            .select('*')
            .eq('calendar_id', sharedLink.calendar_id)
            .order('start_datetime_utc')
        
        if (startDate) {
            eventsQuery = eventsQuery.gte('start_datetime_utc', startDate)
        }
        
        if (endDate) {
            eventsQuery = eventsQuery.lte('start_datetime_utc', endDate)
        }
        
        const { data: events, error: eventsError } = await eventsQuery
        
        if (eventsError) {
            console.error('Error fetching events:', eventsError)
            throw error(500, 'Failed to fetch events')
        }
        
        const calendar = Array.isArray(sharedLink.calendars) ? sharedLink.calendars[0] : sharedLink.calendars
        
        return json({
            events: events || [],
            calendar: {
                id: sharedLink.calendar_id,
                name: calendar?.name || 'Shared Calendar',
                description: calendar?.description || null
            },
            permissions: sharedLink.permissions
        })
        
    } catch (err) {
        console.error('Shared events fetch error:', err)
        if (err instanceof Error && 'status' in err) {
            throw err // Re-throw SvelteKit errors
        }
        throw error(500, 'Internal server error')
    }
}

// POST - Create new event in shared calendar (if edit permissions)
export const POST: RequestHandler = async ({ request, url }) => {
    const shareToken = url.searchParams.get('shareToken')
    
    if (!shareToken) {
        throw error(400, 'Share token is required')
    }
    
    try {
        // Verify the share token has edit permissions
        const { data: sharedLink, error: linkError } = await supabaseAdmin
            .from('shared_links')
            .select('calendar_id, permissions, expires_at')
            .eq('share_token', shareToken)
            .single()
        
        if (linkError || !sharedLink) {
            throw error(404, 'Shared calendar not found')
        }
        
        // Check if link has expired
        if (sharedLink.expires_at && new Date(sharedLink.expires_at) <= new Date()) {
            throw error(404, 'Shared calendar link has expired')
        }
        
        // Check if user has edit permissions
        if (sharedLink.permissions !== 'edit') {
            throw error(403, 'Edit permission required')
        }
        
        const eventData = await request.json()
        
        // Create the event
        const { data: newEvent, error: createError } = await supabaseAdmin
            .from('events')
            .insert({
                calendar_id: sharedLink.calendar_id,
                title: eventData.title,
                description: eventData.description || null,
                start_datetime_utc: eventData.start_datetime_utc,
                end_datetime_utc: eventData.end_datetime_utc || null,
                is_all_day: eventData.is_all_day || false
            })
            .select()
            .single()
        
        if (createError) {
            console.error('Error creating event:', createError)
            throw error(500, 'Failed to create event')
        }
        
        return json({ event: newEvent })
        
    } catch (err) {
        console.error('Shared event creation error:', err)
        if (err instanceof Error && 'status' in err) {
            throw err // Re-throw SvelteKit errors
        }
        throw error(500, 'Internal server error')
    }
}

// PUT - Update event in shared calendar (if edit permissions)
export const PUT: RequestHandler = async ({ request, url }) => {
    const shareToken = url.searchParams.get('shareToken')
    const eventId = url.searchParams.get('eventId')
    
    if (!shareToken || !eventId) {
        throw error(400, 'Share token and event ID are required')
    }
    
    try {
        // Verify the share token has edit permissions
        const { data: sharedLink, error: linkError } = await supabaseAdmin
            .from('shared_links')
            .select('calendar_id, permissions, expires_at')
            .eq('share_token', shareToken)
            .single()
        
        if (linkError || !sharedLink) {
            throw error(404, 'Shared calendar not found')
        }
        
        // Check if link has expired
        if (sharedLink.expires_at && new Date(sharedLink.expires_at) <= new Date()) {
            throw error(404, 'Shared calendar link has expired')
        }
        
        // Check if user has edit permissions
        if (sharedLink.permissions !== 'edit') {
            throw error(403, 'Edit permission required')
        }
        
        const eventData = await request.json()
        
        // Update the event (only if it belongs to the shared calendar)
        const { data: updatedEvent, error: updateError } = await supabaseAdmin
            .from('events')
            .update({
                title: eventData.title,
                description: eventData.description,
                start_datetime_utc: eventData.start_datetime_utc,
                end_datetime_utc: eventData.end_datetime_utc,
                is_all_day: eventData.is_all_day
            })
            .eq('id', eventId)
            .eq('calendar_id', sharedLink.calendar_id)
            .select()
            .single()
        
        if (updateError) {
            console.error('Error updating event:', updateError)
            throw error(500, 'Failed to update event')
        }
        
        return json({ event: updatedEvent })
        
    } catch (err) {
        console.error('Shared event update error:', err)
        if (err instanceof Error && 'status' in err) {
            throw err // Re-throw SvelteKit errors
        }
        throw error(500, 'Internal server error')
    }
}

// DELETE - Delete event from shared calendar (if edit permissions)
export const DELETE: RequestHandler = async ({ url }) => {
    const shareToken = url.searchParams.get('shareToken')
    const eventId = url.searchParams.get('eventId')
    
    if (!shareToken || !eventId) {
        throw error(400, 'Share token and event ID are required')
    }
    
    try {
        // Verify the share token has edit permissions
        const { data: sharedLink, error: linkError } = await supabaseAdmin
            .from('shared_links')
            .select('calendar_id, permissions, expires_at')
            .eq('share_token', shareToken)
            .single()
        
        if (linkError || !sharedLink) {
            throw error(404, 'Shared calendar not found')
        }
        
        // Check if link has expired
        if (sharedLink.expires_at && new Date(sharedLink.expires_at) <= new Date()) {
            throw error(404, 'Shared calendar link has expired')
        }
        
        // Check if user has edit permissions
        if (sharedLink.permissions !== 'edit') {
            throw error(403, 'Edit permission required')
        }
        
        // Delete the event (only if it belongs to the shared calendar)
        const { error: deleteError } = await supabaseAdmin
            .from('events')
            .delete()
            .eq('id', eventId)
            .eq('calendar_id', sharedLink.calendar_id)
        
        if (deleteError) {
            console.error('Error deleting event:', deleteError)
            throw error(500, 'Failed to delete event')
        }
        
        return json({ success: true })
        
    } catch (err) {
        console.error('Shared event deletion error:', err)
        if (err instanceof Error && 'status' in err) {
            throw err // Re-throw SvelteKit errors
        }
        throw error(500, 'Internal server error')
    }
}