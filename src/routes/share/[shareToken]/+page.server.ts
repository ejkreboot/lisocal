import type { ServerLoad } from '@sveltejs/kit'
import { error } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

export const load: ServerLoad = async ({ params, locals }) => {
    const { shareToken } = params
    
    // If we have a shared calendar from the hooks, use it
    if (locals.sharedCalendar && locals.sharedCalendar.shareToken === shareToken) {
        return {
            user: locals.user,
            sharedCalendar: locals.sharedCalendar
        }
    }
    
    // If not found in locals, try to validate the share token directly
    try {
        const { data: sharedLink, error: linkError } = await supabaseAdmin
            .from('shared_links')
            .select(`
                id,
                permissions,
                calendar_id,
                expires_at,
                calendars!inner (
                    id,
                    name,
                    description,
                    user_id,
                    users!inner (
                        email
                    )
                )
            `)
            .eq('share_token', shareToken)
            .single()

        if (!linkError && sharedLink && sharedLink.calendars) {
            // Check if link has expired
            if (!sharedLink.expires_at || new Date(sharedLink.expires_at) > new Date()) {
                const calendar = Array.isArray(sharedLink.calendars) 
                    ? sharedLink.calendars[0] 
                    : sharedLink.calendars
                
                const owner = Array.isArray(calendar.users) ? calendar.users[0] : calendar.users
                
                const sharedCalendar = {
                    id: sharedLink.calendar_id,
                    name: calendar.name,
                    description: calendar.description,
                    permissions: sharedLink.permissions,
                    shareToken,
                    ownerEmail: owner?.email || null
                }
                
                return {
                    user: locals.user,
                    sharedCalendar
                }
            }
        }
    } catch (err) {
        console.error('Error validating shared link:', err)
    }
    
    // If no shared calendar found, show 404
    throw error(404, 'Calendar not found or link has expired')
}