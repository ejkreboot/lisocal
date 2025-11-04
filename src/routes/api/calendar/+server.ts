import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

export const POST: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }
    
    try {
        // Check if user already has a calendar
        const { data: existingCalendar } = await supabaseAdmin
            .from('calendars')
            .select('id, name')
            .eq('user_id', locals.user.id)
            .limit(1)
            .single()
        
        if (existingCalendar) {
            return json({ calendar: existingCalendar })
        }
        
        // Create a default calendar for the user
        const { data: newCalendar, error: createError } = await supabaseAdmin
            .from('calendars')
            .insert({
                user_id: locals.user.id,
                name: 'My Calendar'
            })
            .select()
            .single()
        
        if (createError) {
            console.error('Error creating calendar:', createError)
            throw error(500, 'Failed to create calendar')
        }
        
        return json({ calendar: newCalendar })
        
    } catch (err) {
        console.error('Calendar creation error:', err)
        throw error(500, 'Internal server error')
    }
}

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }
    
    try {
        const { data: calendar, error: fetchError } = await supabaseAdmin
            .from('calendars')
            .select('*')
            .eq('user_id', locals.user.id)
            .limit(1)
            .single()
        
        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('Error fetching calendar:', fetchError)
            throw error(500, 'Failed to fetch calendar')
        }
        
        return json({ calendar })
        
    } catch (err) {
        console.error('Calendar fetch error:', err)
        throw error(500, 'Internal server error')
    }
}