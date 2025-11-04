import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }
    
    const { calendarId, permissions = 'view', expiresIn } = await request.json()
    
    if (!calendarId) {
        throw error(400, 'Calendar ID is required')
    }
    
    // Verify user owns the calendar
    const { data: calendar, error: calendarError } = await supabaseAdmin
        .from('calendars')
        .select('id')
        .eq('id', calendarId)
        .eq('user_id', locals.user.id)
        .single()
    
    if (calendarError || !calendar) {
        throw error(403, 'Calendar not found or access denied')
    }
    
    // Calculate expiration date if provided
    let expiresAt = null
    if (expiresIn) {
        expiresAt = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000).toISOString()
    }
    
    // Create shared link
    const { data: sharedLink, error: linkError } = await supabaseAdmin
        .from('shared_links')
        .insert({
            calendar_id: calendarId,
            permissions: permissions === 'edit' ? 'edit' : 'view',
            expires_at: expiresAt
        })
        .select()
        .single()
    
    if (linkError) {
        console.error('Error creating shared link:', linkError)
        throw error(500, 'Failed to create shared link')
    }
    
    return json({
        shareToken: sharedLink.share_token,
        shareUrl: `/share/${sharedLink.share_token}`,
        permissions: sharedLink.permissions,
        expiresAt: sharedLink.expires_at
    })
}

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized')
    }
    
    // Get user's calendar
    const { data: calendar, error: calendarError } = await supabaseAdmin
        .from('calendars')
        .select('id')
        .eq('user_id', locals.user.id)
        .single()
    
    if (calendarError || !calendar) {
        throw error(404, 'Calendar not found')
    }
    
    // Get existing shared links for this calendar
    const { data: sharedLinks, error: linksError } = await supabaseAdmin
        .from('shared_links')
        .select('*')
        .eq('calendar_id', calendar.id)
        .order('created_at', { ascending: false })
    
    if (linksError) {
        console.error('Error fetching shared links:', linksError)
        throw error(500, 'Failed to fetch shared links')
    }
    
    return json({
        sharedLinks: sharedLinks.map(link => ({
            id: link.id,
            shareToken: link.share_token,
            shareUrl: `/share/${link.share_token}`,
            permissions: link.permissions,
            createdAt: link.created_at,
            expiresAt: link.expires_at
        }))
    })
}