import { supabaseAdmin } from '$lib/supabase-admin.js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'
import type { Handle } from '@sveltejs/kit'
import type { CookieSerializeOptions } from 'cookie'

export const handle: Handle = async ({ event, resolve }) => {
    // Create a Supabase server client that keeps cookies in sync with the browser
    const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
        cookies: {
            getAll: () => event.cookies.getAll(),
            setAll: (cookies) => {
                cookies.forEach(({ name, value, options }) => {
                    const cookieOptions: CookieSerializeOptions & { path: string } = {
                        path: '/',
                        ...(options ?? {})
                    }
                    event.cookies.set(name, value, cookieOptions)
                })
            }
        }
    })

    // Make the client available downstream
    event.locals.supabase = supabase

    // Fetch and validate the current user from Supabase (more secure than getSession)
    let user = null
    let session = null
    
    try {
        const { data: { user: authenticatedUser }, error: userError } = await supabase.auth.getUser()

        if (userError) {
            // Handle expected auth errors silently (no session/token)
            if (userError.message?.includes('Auth session missing') || userError.code === 'session_not_found') {
                // This is expected when user is not logged in, no need to log
            } else {
                console.error('Error fetching Supabase user:', userError)
            }
        } else if (authenticatedUser) {
            user = authenticatedUser
            // Get the session after we've validated the user
            const { data: { session: validSession } } = await supabase.auth.getSession()
            session = validSession
        }
    } catch (error: any) {
        // Catch AuthSessionMissingError and other auth-related errors
        if (error.__isAuthError || error.message?.includes('Auth session missing')) {
            // This is expected when user is not logged in, no need to log
        } else {
            console.error('Unexpected error in auth check:', error)
        }
    }

    // Check for shared link token in URL when no authenticated user present
    const url = new URL(event.request.url)
    const shareToken = url.searchParams.get('share') || url.pathname.split('/').find(segment => 
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
    )

    let sharedCalendar = null

    // If we have a share token, check for shared calendar access (regardless of authentication status)
    if (shareToken) {
        try {
            const { data: sharedLink, error } = await supabaseAdmin
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

            if (!error && sharedLink && sharedLink.calendars) {
                // Check if link has expired
                if (!sharedLink.expires_at || new Date(sharedLink.expires_at) > new Date()) {
                    const calendar = Array.isArray(sharedLink.calendars) 
                        ? sharedLink.calendars[0] 
                        : sharedLink.calendars
                    const owner = Array.isArray(calendar.users) ? calendar.users[0] : calendar.users
                    
                    sharedCalendar = {
                        id: sharedLink.calendar_id,
                        name: calendar.name,
                        description: calendar.description,
                        permissions: sharedLink.permissions,
                        shareToken,
                        ownerEmail: owner?.email || null
                    }
                }
            }
        } catch (error) {
            console.error('Shared link error:', error)
        }
    }

    event.locals.user = user
    event.locals.session = session ?? null
    event.locals.sharedCalendar = sharedCalendar

    return resolve(event, {
        filterSerializedResponseHeaders: (name) => name === 'content-range'
    })
}