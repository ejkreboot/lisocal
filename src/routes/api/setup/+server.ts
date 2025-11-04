import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabaseAdmin } from '$lib/supabase-admin.js'

export const POST: RequestHandler = async ({ request }) => {
    // Get user data from the request body instead of server-side auth
    const { userId, userEmail, accessToken } = await request.json()
    if (!userId || !accessToken) {
        throw error(400, 'Missing required fields: userId and accessToken')
    }
    
    // Verify the access token with Supabase
    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
        if (authError || !user || user.id !== userId) {
            throw error(401, 'Invalid access token')
        }
    } catch (err) {
        throw error(401, 'Authentication failed')
    }
    
    try {
        // First, ensure user record exists in our users table
        const { data: existingUser, error: userSelectError } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', userId)
            .single()
        
        if (userSelectError && userSelectError.code === 'PGRST116') {
            // User doesn't exist, create them
            console.log('Creating user record for:', userId)
            const { error: userCreateError } = await supabaseAdmin
                .from('users')
                .insert({
                    id: userId,
                    email: userEmail
                })
            
            if (userCreateError) {
                console.error('Error creating user:', userCreateError)
                throw error(500, 'Failed to create user record')
            }
        }
        
        // Now check if user has a calendar
        const { data: existingCalendar, error: calendarSelectError } = await supabaseAdmin
            .from('calendars')
            .select('*')
            .eq('user_id', userId)
            .single()
        
        if (calendarSelectError && calendarSelectError.code === 'PGRST116') {
            // No calendar exists, create one
            console.log('Creating calendar for user:', userId)
            const { data: newCalendar, error: calendarCreateError } = await supabaseAdmin
                .from('calendars')
                .insert({
                    user_id: userId,
                    name: 'My Calendar'
                })
                .select()
                .single()
            
            if (calendarCreateError) {
                console.error('Error creating calendar:', calendarCreateError)
                throw error(500, 'Failed to create calendar')
            }
            
            return json({ 
                success: true, 
                calendar: newCalendar,
                message: 'User and calendar created successfully'
            })
        } else if (existingCalendar) {
            return json({ 
                success: true, 
                calendar: existingCalendar,
                message: 'Calendar already exists'
            })
        } else {
            console.error('Error fetching calendar:', calendarSelectError)
            throw error(500, 'Failed to fetch calendar')
        }
        
    } catch (err) {
        console.error('Setup error:', err)
        throw error(500, 'Internal server error')
    }
}