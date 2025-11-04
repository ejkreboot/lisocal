import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from '@sveltejs/kit'
import { supabase } from '$lib/supabase.js'

export const GET: RequestHandler = async () => {
    // Sign out the user
    await supabase.auth.signOut()
    
    // Redirect to home page
    throw redirect(302, '/')
}