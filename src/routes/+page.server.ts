import type { ServerLoad } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

export const load: ServerLoad = async ({ locals }) => {
    const { user, sharedCalendar } = locals
    
    let userCalendar = null
    
    // If user is authenticated, get their calendar
    if (user) {
        const { data: calendars, error } = await supabaseAdmin
            .from('calendars')
            .select('*')
            .eq('user_id', user.id)
            .limit(1)
            .single()
        
        if (!error && calendars) {
            userCalendar = calendars
        }
    }
    
    return {
        user: user ? {
            ...user,
            calendar: userCalendar
        } : null,
        sharedCalendar,
        // Include loading state info to help client decide initial state
        hasServerAuth: !!user || !!sharedCalendar
    }
}