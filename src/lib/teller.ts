/**
 * Teller API server-side utilities.
 *
 * mTLS & credentials are resolved from environment variables.
 * - Dev:  TELLER_CERT_PATH / TELLER_KEY_PATH  (paths to PEM files)
 * - Prod: TELLER_CERT_B64 / TELLER_KEY_B64    (base64-encoded PEM)
 *
 * The access token is passed via HTTP Basic Auth (username = token, no password).
 * All functions here run **server-side only**.
 */

import https from 'node:https'
import fs from 'node:fs'
import { env } from '$env/dynamic/private'

// ── mTLS agent ──────────────────────────────────────────────

let _agent: https.Agent | null = null

function getTlsAgent(): https.Agent {
    if (_agent) return _agent

    let cert: string | Buffer
    let key: string | Buffer

    // Prefer base64 env vars (Vercel / production)
    if (env.TELLER_CERT_B64 && env.TELLER_KEY_B64) {
        cert = Buffer.from(env.TELLER_CERT_B64, 'base64')
        key = Buffer.from(env.TELLER_KEY_B64, 'base64')
    } else if (env.TELLER_CERT_PATH && env.TELLER_KEY_PATH) {
        cert = fs.readFileSync(env.TELLER_CERT_PATH)
        key = fs.readFileSync(env.TELLER_KEY_PATH)
    } else {
        throw new Error(
            'Teller mTLS not configured. Set TELLER_CERT_B64/TELLER_KEY_B64 or TELLER_CERT_PATH/TELLER_KEY_PATH'
        )
    }

    _agent = new https.Agent({ cert, key })
    return _agent
}

// ── Helpers ─────────────────────────────────────────────────

const TELLER_API = 'https://api.teller.io'

interface TellerRequestOpts {
    path: string
    accessToken: string
    method?: string
    body?: unknown
}

async function tellerFetch<T = unknown>({
    path,
    accessToken,
    method = 'GET',
    body
}: TellerRequestOpts): Promise<T> {
    const agent = getTlsAgent()
    const basicAuth = Buffer.from(`${accessToken}:`).toString('base64')

    const res = await fetch(`${TELLER_API}${path}`, {
        method,
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined,
        // Node 18+ fetch — agent passed for mTLS
        ...(agent ? { agent } : {})
    } as any)

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Teller API ${method} ${path} → ${res.status}: ${text}`)
    }

    return (await res.json()) as T
}

// ── Public helpers used by API routes ───────────────────────

export function getTellerAppId(): string {
    return env.TELLER_APPLICATION_ID || ''
}

export function getTellerEnvironment(): string {
    return env.TELLER_ENVIRONMENT || 'sandbox'
}

export interface TellerAccount {
    id: string
    enrollment_id: string
    institution: { id: string; name: string }
    name: string
    type: string
    subtype: string
    currency: string
    last_four: string
    status: string
    links: Record<string, string>
}

export interface TellerTransaction {
    id: string
    account_id: string
    date: string
    description: string
    details: {
        processing_status: string
        category?: string
        counterparty?: { name: string; type: string }
    }
    status: string
    amount: string
    running_balance: string | null
    type: string
    links: Record<string, string>
}

export async function listAccounts(accessToken: string): Promise<TellerAccount[]> {
    return tellerFetch<TellerAccount[]>({ path: '/accounts', accessToken })
}

export async function listTransactions(
    accessToken: string,
    accountId: string
): Promise<TellerTransaction[]> {
    return tellerFetch<TellerTransaction[]>({
        path: `/accounts/${accountId}/transactions`,
        accessToken
    })
}

export interface TellerAccountBalance {
    account_id: string
    available: string | null
    ledger: string | null
    links: Record<string, string>
}

export async function getAccountBalance(
    accessToken: string,
    accountId: string
): Promise<TellerAccountBalance> {
    return tellerFetch<TellerAccountBalance>({
        path: `/accounts/${accountId}/balances`,
        accessToken
    })
}
