import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { supabase } from '$lib/supabase.js'
import { supabaseAdmin } from '$lib/supabase-admin.js'

/**
 * GET /api/teller/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=stream|category
 *
 * Returns monthly spending totals grouped by category or stream.
 * Only includes debits (amount > 0).
 *
 * Response:
 * {
 *   months: string[],          // ["2026-01", "2026-02", ...]
 *   groups: string[],          // category/stream names
 *   data: Record<string, Record<string, number>>,  // group → month → total
 *   totals: Record<string, number>,  // group → overall total
 *   monthlyTotals: Record<string, number>,  // month → total
 * }
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

    const from = url.searchParams.get('from') || ''
    const to = url.searchParams.get('to') || ''
    const groupBy = url.searchParams.get('groupBy') === 'category' ? 'category' : 'stream'

    // Fetch transactions with category info
    let query = supabaseAdmin
        .from('transactions')
        .select('posted_at, authorized_at, amount, category_id')
        .eq('user_id', user.id)
        .eq('pending', false)
        .gt('amount', 0)  // debits only

    if (from) query = query.gte('posted_at', from)
    if (to) query = query.lte('posted_at', to)

    const { data: txns, error: txErr } = await query
    if (txErr) return json({ error: txErr.message }, { status: 500 })

    // Fetch all categories for this user
    const { data: categories } = await supabaseAdmin
        .from('categories')
        .select('id, name, stream')
        .eq('user_id', user.id)

    const catMap = new Map<string, { name: string; stream: string | null }>()
    for (const c of categories || []) {
        catMap.set(c.id, { name: c.name, stream: c.stream })
    }

    // Aggregate: group → month → total
    const data: Record<string, Record<string, number>> = {}
    const monthSet = new Set<string>()

    for (const tx of txns || []) {
        const dateStr = (tx.posted_at || tx.authorized_at || '').slice(0, 10)
        if (!dateStr) continue
        const month = dateStr.slice(0, 7) // "YYYY-MM"
        monthSet.add(month)

        let groupLabel = 'Uncategorized'
        if (tx.category_id && catMap.has(tx.category_id)) {
            const cat = catMap.get(tx.category_id)!
            groupLabel = groupBy === 'stream'
                ? (cat.stream || 'Uncategorized')
                : cat.name
        }

        if (!data[groupLabel]) data[groupLabel] = {}
        data[groupLabel][month] = (data[groupLabel][month] || 0) + Number(tx.amount)
    }

    const months = Array.from(monthSet).sort()

    // Per-group totals
    const totals: Record<string, number> = {}
    for (const [group, months_] of Object.entries(data)) {
        totals[group] = Object.values(months_).reduce((s, v) => s + v, 0)
    }

    // Sort groups by total descending, Uncategorized last
    const groups = Object.keys(data).sort((a, b) => {
        if (a === 'Uncategorized') return 1
        if (b === 'Uncategorized') return -1
        return totals[b] - totals[a]
    })

    // Monthly totals
    const monthlyTotals: Record<string, number> = {}
    for (const month of months) {
        monthlyTotals[month] = groups.reduce((s, g) => s + (data[g][month] || 0), 0)
    }

    return json({ months, groups, data, totals, monthlyTotals })
}
