import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { supabase } from '$lib/supabase.js'
import { supabaseAdmin } from '$lib/supabase-admin.js'

/**
 * POST /api/teller/connect/complete
 *
 * Called by the client after a successful Teller Connect enrollment.
 * Stores the access token (server‑side only) in teller_enrollments.
 *
 * Body: { accessToken, enrollmentId?, institutionName? }
 */
export const POST: RequestHandler = async ({ request }) => {
    // ── Auth ──
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

    // ── Body ──
    const { accessToken, enrollmentId, institutionName } = await request.json()

    if (!accessToken) {
        return json({ error: 'accessToken is required' }, { status: 400 })
    }

    // ── Upsert enrollment (service role — table is locked to anon/authenticated) ──
    // NOTE: For production you should encrypt accessToken before storing.
    // For now we store it as‑is; the table has RLS that blocks all non‑service access.
    const { error: dbError } = await supabaseAdmin
        .from('teller_enrollments')
        .upsert(
            {
                user_id: user.id,
                access_token_ciphertext: accessToken,
                enrollment_id: enrollmentId ?? null,
                institution_name: institutionName ?? null,
                revoked_at: null
            },
            { onConflict: 'user_id' }
        )

    if (dbError) {
        console.error('Failed to store enrollment:', dbError)
        return json({ error: 'Failed to store enrollment' }, { status: 500 })
    }

    return json({ success: true })
}
