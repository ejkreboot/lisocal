import { supabaseAdmin } from '$lib/supabase-admin.js'

export const DEFAULT_STREAMS = [
    'Shared mission',
    'Personal mission',
    'Renewal',
    'Drift'
] as const

const DEFAULT_CATEGORY_SEEDS = [
    { name: 'Housing', stream: 'Shared mission' },
    { name: 'Utilities', stream: 'Shared mission' },
    { name: 'Groceries', stream: 'Shared mission' },
    { name: 'Transportation', stream: 'Personal mission' },
    { name: 'Health', stream: 'Personal mission' },
    { name: 'Education', stream: 'Personal mission' },
    { name: 'Fun', stream: 'Renewal' },
    { name: 'Travel', stream: 'Renewal' },
    { name: 'Shopping', stream: 'Drift' },
    { name: 'Subscriptions', stream: 'Drift' }
] as const

export async function ensureUserCategories(userId: string) {
    const { data: existing, error: existingError } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .limit(1)

    if (existingError) {
        throw existingError
    }

    if (!existing || existing.length === 0) {
        const seedRows = DEFAULT_CATEGORY_SEEDS.map((category, idx) => ({
            user_id: userId,
            name: category.name,
            stream: category.stream,
            sort_order: idx
        }))

        const { error: seedError } = await supabaseAdmin
            .from('categories')
            .insert(seedRows)

        if (seedError) {
            throw seedError
        }
    }

    const { data: categories, error: categoriesError } = await supabaseAdmin
        .from('categories')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })

    if (categoriesError) {
        throw categoriesError
    }

    return categories || []
}