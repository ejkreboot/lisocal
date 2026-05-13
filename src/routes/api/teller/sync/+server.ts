import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { supabase } from '$lib/supabase.js'
import { supabaseAdmin } from '$lib/supabase-admin.js'
import { listAccounts, listTransactions } from '$lib/teller.js'
import { ensureUserCategories } from '$lib/teller-categories.js'

/**
 * POST /api/teller/sync
 *
 * Fetches accounts and transactions from the Teller API and upserts them
 * into the database for the authenticated user.
 *
 * Sync strategy:
 * - Fetch all accounts and upsert.
 * - For each account use a 14‑day lookback before last_synced_at
 *   and upsert by teller_transaction_id to handle pending→posted changes.
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

    // ── Get access token (service role) ──
    const { data: enrollment, error: enrollError } = await supabaseAdmin
        .from('teller_enrollments')
        .select('access_token_ciphertext')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .single()

    if (enrollError || !enrollment) {
        return json({ error: 'No linked bank account found' }, { status: 404 })
    }

    const accessToken = enrollment.access_token_ciphertext

    // ── Sync accounts ──
    let tellerAccounts
    try {
        tellerAccounts = await listAccounts(accessToken)
    } catch (e: any) {
        console.error('Teller listAccounts failed:', e)
        return json({ error: e.message || 'Failed to fetch accounts from Teller' }, { status: 502 })
    }

    for (const acct of tellerAccounts) {
        await supabaseAdmin.from('teller_accounts').upsert(
            {
                user_id: user.id,
                teller_account_id: acct.id,
                name: acct.name,
                institution: acct.institution.name,
                type: acct.type,
                subtype: acct.subtype,
                currency: acct.currency,
                last_four: acct.last_four,
                status: acct.status
            },
            { onConflict: 'user_id,teller_account_id' }
        )
    }

    // ── Sync transactions per account ──
    for (const acct of tellerAccounts) {
        try {
            const txns = await listTransactions(accessToken, acct.id)

            for (const tx of txns) {
                const isPending = tx.status === 'pending'
                await supabaseAdmin.from('transactions').upsert(
                    {
                        user_id: user.id,
                        teller_account_id: acct.id,
                        teller_transaction_id: tx.id,
                        posted_at: isPending ? null : tx.date,
                        authorized_at: tx.date,
                        pending: isPending,
                        amount: parseFloat(tx.amount),
                        currency: acct.currency || 'USD',
                        description: tx.description,
                        merchant: tx.details?.counterparty?.name ?? null,
                        raw: tx as any,
                        category_auto: tx.details?.category ?? null
                    },
                    { onConflict: 'user_id,teller_transaction_id' }
                )
            }

            // Update sync state
            await supabaseAdmin.from('teller_sync_state').upsert(
                {
                    user_id: user.id,
                    teller_account_id: acct.id,
                    last_synced_at: new Date().toISOString(),
                    last_error: null
                },
                { onConflict: 'user_id,teller_account_id' }
            )
        } catch (e: any) {
            console.error(`Teller sync failed for account ${acct.id}:`, e)
            await supabaseAdmin.from('teller_sync_state').upsert(
                {
                    user_id: user.id,
                    teller_account_id: acct.id,
                    last_error: e.message || 'Unknown error'
                },
                { onConflict: 'user_id,teller_account_id' }
            )
        }
    }

    // ── Ensure categories exist and map category_auto to category_id ──
    try {
        const userCats = await ensureUserCategories(user.id)

        if (userCats && userCats.length > 0) {
            // Build a case-insensitive lookup: lowercase name → category id
            const catLookup = new Map<string, string>()
            for (const c of userCats) {
                catLookup.set(c.name.toLowerCase(), c.id)
            }

            // Find transactions that have category_auto but no category_id
            const { data: unmapped } = await supabaseAdmin
                .from('transactions')
                .select('id, category_auto')
                .eq('user_id', user.id)
                .is('category_id', null)
                .not('category_auto', 'is', null)

            if (unmapped) {
                for (const tx of unmapped) {
                    const match = catLookup.get(tx.category_auto!.toLowerCase())
                    if (match) {
                        await supabaseAdmin
                            .from('transactions')
                            .update({ category_id: match })
                            .eq('id', tx.id)
                    }
                }
            }
        }
    } catch (e) {
        console.error('Failed to match categories:', e)
    }

    return json({ success: true, accountsSynced: tellerAccounts.length })
}
