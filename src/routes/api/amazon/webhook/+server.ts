import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { supabaseAdmin } from '$lib/supabase-admin.js'
import { IMPROVMX_IP } from '$env/static/private'
import { parseAmazonOrderEmail } from '$lib/amazon-order-parse'

function extractEmail(from: unknown): string {
    // ImprovMX may send `from` as a string, an object with an `address` field, or an array
    let raw: string
    if (Array.isArray(from)) {
        raw = String((from[0] as any)?.address ?? from[0] ?? '')
    } else if (from && typeof from === 'object') {
        raw = String((from as any).address ?? (from as any).email ?? '')
    } else {
        raw = String(from ?? '')
    }
    const match = raw.match(/<([^>]+)>/)
    return match ? match[1].trim() : raw.trim()
}

export const POST: RequestHandler = async ({ request }) => {
    // ── IP validation ──
    const allowedIPs = IMPROVMX_IP.split(',').map((ip) => ip.trim())
    const forwarded = request.headers.get('x-forwarded-for')
    const remoteIP = forwarded ? forwarded.split(',')[0].trim() : ''

    if (!allowedIPs.includes(remoteIP)) {
        return json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── Parse body ──
    let body: { from?: unknown; date?: string; html?: string }
    try {
        body = await request.json()
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { from, date, html } = body
    if (!from || !html || typeof html !== 'string') {
        return json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── User lookup via auth.users ──
    const senderEmail = extractEmail(from)
    console.log('[amazon/webhook] from raw:', JSON.stringify(from))
    console.log('[amazon/webhook] senderEmail:', senderEmail)

    const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', senderEmail)
        .single()

    console.log('[amazon/webhook] user lookup:', { found: !!userData, error: userError?.message })

    if (!userData) {
        // Silent accept — don't leak whether the email is registered
        return json({ ok: true })
    }

    // ── Parse email HTML ──
    console.log('[amazon/webhook] html (first 500 chars):', html.slice(0, 500))
    const { order, items, grandTotal } = parseAmazonOrderEmail(html)
    console.log('[amazon/webhook] parsed:', { order, grandTotal, itemCount: items.length, items })

    if (!order) {
        // Not a parseable order email; accept silently
        return json({ ok: true })
    }

    const total = grandTotal ? parseFloat(grandTotal.replace(/[$,]/g, '')) : null
    const currency = grandTotal ? 'USD' : null

    // ── Upsert into amazon_orders ──
    const { error: upsertError } = await supabaseAdmin.from('amazon_orders').upsert(
        {
            user_id: userData.id,
            order_number: order,
            order_date: date ? new Date(date).toISOString() : null,
            email_from: senderEmail,
            email_raw: html,
            items,
            total,
            currency,
            updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id,order_number' }
    )

    if (upsertError) {
        console.error('amazon_orders upsert error:', upsertError)
        return json({ error: 'Database error' }, { status: 500 })
    }

    return json({ ok: true })
}
