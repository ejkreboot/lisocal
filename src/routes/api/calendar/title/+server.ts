import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

export const PUT: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }
    
    try {
        const { calendarId, name } = await request.json()
        
        if (!calendarId || !name || !name.trim()) {
            throw error(400, 'Calendar ID and name are required')
        }
        
        // Verify user owns the calendar and update the name
        const { data: updatedCalendar, error: updateError } = await supabaseAdmin
            .from('calendars')
            .update({ name: name.trim() })
            .eq('id', calendarId)
            .eq('user_id', locals.user.id)
            .select()
            .single()
        
        if (updateError) {
            console.error('Error updating calendar name:', updateError)
            throw error(500, 'Failed to update calendar name')
        }
        
        if (!updatedCalendar) {
            throw error(404, 'Calendar not found or access denied')
        }
        
        return json({ 
            success: true,
            calendar: updatedCalendar
        })
        
    } catch (err) {
        console.error('Calendar name update error:', err)
        if (err instanceof Error && 'status' in err) {
            throw err // Re-throw SvelteKit errors
        }
        throw error(500, 'Internal server error')
    }
}