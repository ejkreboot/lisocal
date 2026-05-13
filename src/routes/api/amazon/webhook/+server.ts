import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { supabaseAdmin } from '$lib/supabase-admin.js'
import { IMPROVMX_IP } from '$env/static/private'

interface AmazonItem {
    name: string
    quantity: number
    amount: number
    currency: string
}

function extractEmail(from: string): string {
    const match = from.match(/<([^>]+)>/)
    return match ? match[1].trim() : from.trim()
}

function parseOrderEmail(text: string): {
    orderNumber: string | null
    items: AmazonItem[]
    total: number | null
    currency: string
} {
    // Strip quoted-printable soft line breaks in case ImprovMX doesn't decode them
    const decoded = text.replace(/=\r?\n/g, '')

    const orderMatch = decoded.match(/Order #\r?\n([^\r\n]+)/)
    const orderNumber = orderMatch ? orderMatch[1].trim() : null

    const items: AmazonItem[] = []
    const itemRegex = /^\* (.+)\r?\n[ \t]+Quantity: (\d+)\r?\n[ \t]+([\d.]+) ([A-Z]+)/gm
    let itemMatch
    while ((itemMatch = itemRegex.exec(decoded)) !== null) {
        items.push({
            name: itemMatch[1].trim(),
            quantity: parseInt(itemMatch[2], 10),
            amount: parseFloat(itemMatch[3]),
            currency: itemMatch[4]
        })
    }

    const totalMatch = decoded.match(/^Total\r?\n([\d.]+) ([A-Z]+)/m)
    const total = totalMatch ? parseFloat(totalMatch[1]) : null
    const currency = totalMatch ? totalMatch[2] : (items[0]?.currency ?? 'USD')

    return { orderNumber, items, total, currency }
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
    let body: { from?: string; date?: string; text?: string }
    try {
        body = await request.json()
    } catch {
        return json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { from, date, text } = body
    if (!from || !text) {
        return json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── User lookup via auth.users ──
    const senderEmail = extractEmail(from)
    const { data: userData } = await supabaseAdmin
        .schema('auth')
        .from('users')
        .select('id')
        .eq('email', senderEmail)
        .single()

    if (!userData) {
        // Silent accept — don't leak whether the email is registered
        return json({ ok: true })
    }

    // ── Parse email text ──
    const { orderNumber, items, total, currency } = parseOrderEmail(text)
    if (!orderNumber) {
        // Not a parseable order email; accept silently
        return json({ ok: true })
    }

    // ── Upsert into amazon_orders ──
    const { error: upsertError } = await supabaseAdmin.from('amazon_orders').upsert(
        {
            user_id: userData.id,
            order_number: orderNumber,
            order_date: date ? new Date(date).toISOString() : null,
            email_from: senderEmail,
            email_raw: text,
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
