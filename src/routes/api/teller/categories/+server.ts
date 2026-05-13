import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { supabase } from '$lib/supabase.js'
import { supabaseAdmin } from '$lib/supabase-admin.js'
import { DEFAULT_STREAMS, ensureUserCategories } from '$lib/teller-categories.js'

/** Helper: authenticate and return user or error response */
async function authenticateUser(request: Request): Promise<{ user: { id: string }; error?: undefined } | { error: Response; user?: undefined }> {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return { error: json({ error: 'Authorization required' }, { status: 401 }) }
    }
    const token = authHeader.split(' ')[1]
    const {
        data: { user },
        error: authError
    } = await supabase.auth.getUser(token)
    if (authError || !user) {
        return { error: json({ error: 'Invalid token' }, { status: 401 }) }
    }
    return { user }
}

/**
 * GET /api/teller/categories
 *
 * Returns the authenticated user's custom categories from the DB.
 * Also returns the transaction count per category (for deletion UX).
 */
export const GET: RequestHandler = async ({ request }) => {
    const auth = await authenticateUser(request)
    if (auth.error) return auth.error
    const user = auth.user

    let categories: any[] = []
    try {
        categories = await ensureUserCategories(user.id)
    } catch (error: any) {
        return json({ error: error.message }, { status: 500 })
    }

    // Backfill category_id for legacy/unmapped transactions so category counts are accurate.
    if (categories.length > 0) {
        const catLookup = new Map<string, string>()
        for (const category of categories) {
            catLookup.set(category.name.toLowerCase().trim(), category.id)
        }

        const { data: unmappedTx } = await supabaseAdmin
            .from('transactions')
            .select('id, category_auto, category_user')
            .eq('user_id', user.id)
            .is('category_id', null)

        if (unmappedTx && unmappedTx.length > 0) {
            for (const tx of unmappedTx) {
                const normalizedAuto = tx.category_auto?.toLowerCase().trim()
                const normalizedUser = tx.category_user?.toLowerCase().trim()
                const match = (normalizedAuto && catLookup.get(normalizedAuto))
                    || (normalizedUser && catLookup.get(normalizedUser))

                if (match) {
                    await supabaseAdmin
                        .from('transactions')
                        .update({ category_id: match })
                        .eq('id', tx.id)
                }
            }
        }
    }

    // Get transaction counts per category id so the UI can warn before deleting
    const catIds = categories.map((c: any) => c.id)
    let txCounts: Record<string, number> = {}
    if (catIds.length > 0) {
        const { data: txData } = await supabaseAdmin
            .from('transactions')
            .select('category_id')
            .eq('user_id', user.id)
            .in('category_id', catIds)

        if (txData) {
            for (const row of txData) {
                const cat = row.category_id
                if (cat) txCounts[cat] = (txCounts[cat] || 0) + 1
            }
        }
    }

    return json({ categories: categories || [], txCounts })
}

/**
 * POST /api/teller/categories
 *
 * Create a new category.
 * Body: { name, stream? }
 */
export const POST: RequestHandler = async ({ request }) => {
    const auth = await authenticateUser(request)
    if (auth.error) return auth.error
    const user = auth.user

    const body = await request.json()
    const { name, stream } = body

    if (!name?.trim()) {
        return json({ error: 'Category name is required' }, { status: 400 })
    }

    // Check for duplicate
    const { data: dup } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', name.trim())
        .maybeSingle()

    if (dup) {
        return json({ error: 'A category with that name already exists' }, { status: 409 })
    }

    // Get max sort_order
    const { data: maxRow } = await supabaseAdmin
        .from('categories')
        .select('sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

    const nextOrder = (maxRow?.sort_order ?? -1) + 1

    const { data: created, error: insertErr } = await supabaseAdmin
        .from('categories')
        .insert({
            user_id: user.id,
            name: name.trim(),
            sort_order: nextOrder,
            stream: stream?.trim() || DEFAULT_STREAMS[0]
        })
        .select()
        .single()

    if (insertErr) {
        return json({ error: insertErr.message }, { status: 500 })
    }

    return json({ category: created }, { status: 201 })
}

/**
 * PUT /api/teller/categories
 *
 * Rename a category or update its stream.
 * Body: { id, name?, stream? }
 */
export const PUT: RequestHandler = async ({ request }) => {
    const auth = await authenticateUser(request)
    if (auth.error) return auth.error
    const user = auth.user

    const body = await request.json()
    const { id, name, stream } = body

    if (!id) {
        return json({ error: 'Category id is required' }, { status: 400 })
    }

    // Fetch the existing category to get the old name
    const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('categories')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

    if (fetchErr || !existing) {
        return json({ error: 'Category not found' }, { status: 404 })
    }

    const updates: Record<string, any> = {}
    if (name !== undefined && name !== existing.name) {
        // Check if the new name already exists
        const { data: dup } = await supabaseAdmin
            .from('categories')
            .select('id')
            .eq('user_id', user.id)
            .eq('name', name)
            .neq('id', id)
            .maybeSingle()

        if (dup) {
            return json({ error: 'A category with that name already exists' }, { status: 409 })
        }

        updates.name = name
    }

    if (stream !== undefined) {
        updates.stream = stream
    }

    if (Object.keys(updates).length === 0) {
        return json({ category: existing })
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
        .from('categories')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()

    if (updateErr) {
        return json({ error: updateErr.message }, { status: 500 })
    }

    return json({ category: updated })
}

/**
 * DELETE /api/teller/categories
 *
 * Delete a category. If there are transactions with this category,
 * the client must supply a reassignToCategoryId.
 * Body: { id, reassignToCategoryId? }
 */
export const DELETE: RequestHandler = async ({ request }) => {
    const auth = await authenticateUser(request)
    if (auth.error) return auth.error
    const user = auth.user

    const body = await request.json()
    const { id, reassignToCategoryId } = body

    if (!id) {
        return json({ error: 'Category id is required' }, { status: 400 })
    }

    // Fetch category
    const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('categories')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

    if (fetchErr || !existing) {
        return json({ error: 'Category not found' }, { status: 404 })
    }

    // Check for transactions using this category
    const { count } = await supabaseAdmin
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('category_id', existing.id)

    if (count && count > 0) {
        if (!reassignToCategoryId) {
            return json({
                error: 'Category has transactions. Provide reassignToCategoryId.',
                txCount: count,
                requiresReassignment: true
            }, { status: 409 })
        }

        const { data: reassignTarget, error: reassignTargetErr } = await supabaseAdmin
            .from('categories')
            .select('id')
            .eq('id', reassignToCategoryId)
            .eq('user_id', user.id)
            .maybeSingle()

        if (reassignTargetErr || !reassignTarget) {
            return json({ error: 'Invalid reassignToCategoryId' }, { status: 400 })
        }

        // Reassign transactions
        await supabaseAdmin
            .from('transactions')
            .update({ category_id: reassignToCategoryId })
            .eq('user_id', user.id)
            .eq('category_id', existing.id)
    }

    // Delete the category
    const { error: delErr } = await supabaseAdmin
        .from('categories')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

    if (delErr) {
        return json({ error: delErr.message }, { status: 500 })
    }

    return json({ success: true })
}
