import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTellerAppId, getTellerEnvironment } from '$lib/teller.js'
import { supabase } from '$lib/supabase.js'

/**
 * POST /api/teller/connect/start
 *
 * Returns the Teller application ID and environment so the client can
 * initialise Teller Connect.  Requires an authenticated user.
 */
export const POST: RequestHandler = async ({ request }) => {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return json({ error: 'Authorization required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const {
        data: { user },
        error: authError
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
        return json({ error: 'Invalid token' }, { status: 401 })
    }

    const applicationId = getTellerAppId()
    if (!applicationId) {
        console.error('[teller/connect/start] TELLER_APPLICATION_ID is not set in environment')
        return json({ error: 'Teller is not configured on the server' }, { status: 500 })
    }
    console.log('[teller/connect/start] applicationId found, environment:', getTellerEnvironment())

    return json({
        applicationId,
        environment: getTellerEnvironment()
    })
}
