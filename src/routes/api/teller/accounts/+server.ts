import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { supabase } from '$lib/supabase.js'
import { supabaseAdmin } from '$lib/supabase-admin.js'
import { getAccountBalance } from '$lib/teller.js'

/**
 * GET /api/teller/accounts
 *
 * Returns the authenticated user's linked bank accounts from the DB,
 * augmented with live balances from the Teller API.
 */
export const GET: RequestHandler = async ({ request }) => {
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

    const { data: accounts, error } = await supabaseAdmin
        .from('teller_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

    if (error) {
        return json({ error: error.message }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
        return json({ accounts: [] })
    }

    // Fetch live balances from Teller
    const { data: enrollment } = await supabaseAdmin
        .from('teller_enrollments')
        .select('access_token_ciphertext')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .single()

    let balanceMap: Record<string, { available: string | null; ledger: string | null }> = {}

    if (enrollment?.access_token_ciphertext) {
        const accessToken = enrollment.access_token_ciphertext
        const results = await Promise.allSettled(
            accounts.map(acct => getAccountBalance(accessToken, acct.teller_account_id))
        )
        results.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                balanceMap[accounts[i].teller_account_id] = {
                    available: result.value.available,
                    ledger: result.value.ledger
                }
            }
        })
    }

    const accountsWithBalances = accounts.map(acct => ({
        ...acct,
        balance_available: balanceMap[acct.teller_account_id]?.available ?? null,
        balance_ledger: balanceMap[acct.teller_account_id]?.ledger ?? null
    }))

    return json({ accounts: accountsWithBalances })
}
