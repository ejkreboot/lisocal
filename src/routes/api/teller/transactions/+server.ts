import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { supabase } from '$lib/supabase.js'
import { supabaseAdmin } from '$lib/supabase-admin.js'

/**
 * GET /api/teller/transactions?accountId=<optional>
 *
 * Returns the authenticated user's transactions from the DB.
 */
export const GET: RequestHandler = async ({ request, url }) => {
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

    let query = supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('posted_at', { ascending: false, nullsFirst: false })
        .order('authorized_at', { ascending: false, nullsFirst: false })
        .limit(500)

    const accountId = url.searchParams.get('accountId')
    if (accountId) {
        query = query.eq('teller_account_id', accountId)
    }

    const { data: transactions, error } = await query

    if (error) {
        return json({ error: error.message }, { status: 500 })
    }

    const categoryIds = Array.from(new Set((transactions || []).map((t: any) => t.category_id).filter(Boolean)))
    let categoryMap = new Map<string, { id: string; name: string; stream: string | null }>()

    if (categoryIds.length > 0) {
        const { data: categories } = await supabaseAdmin
            .from('categories')
            .select('id, name, stream')
            .eq('user_id', user.id)
            .in('id', categoryIds)

        if (categories) {
            categoryMap = new Map(categories.map((c: any) => [c.id, c]))
        }
    }

    const payload = (transactions || []).map((tx: any) => {
        const selectedCategory = tx.category_id ? categoryMap.get(tx.category_id) : null
        return {
            ...tx,
            category_name: selectedCategory?.name || null,
            category_stream: selectedCategory?.stream || null
        }
    })

    return json({ transactions: payload })
}

/**
 * PATCH /api/teller/transactions
 *
 * Update a transaction's user‑assigned category.
 * Body: { transactionId, categoryId }
 */
export const PATCH: RequestHandler = async ({ request }) => {
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

    const { transactionId, categoryId } = await request.json()

    if (!transactionId) {
        return json({ error: 'transactionId is required' }, { status: 400 })
    }

    if (categoryId !== null && categoryId !== undefined) {
        const { data: category, error: categoryError } = await supabaseAdmin
            .from('categories')
            .select('id')
            .eq('id', categoryId)
            .eq('user_id', user.id)
            .maybeSingle()

        if (categoryError || !category) {
            return json({ error: 'Invalid categoryId' }, { status: 400 })
        }
    }

    const { error } = await supabaseAdmin
        .from('transactions')
        .update({ category_id: categoryId ?? null })
        .eq('id', transactionId)
        .eq('user_id', user.id)

    if (error) {
        return json({ error: error.message }, { status: 500 })
    }

    return json({ success: true })
}
