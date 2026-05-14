/**
 * amazon-order-parser.ts
 *
 * Parses the HTML part of an Amazon order/shipment email (as delivered by
 * ImprovMX or similar) and extracts structured order data.
 *
 * Works with emails forwarded from any client (macOS Mail, StartMail web,
 * Gmail) by operating purely on text nodes rather than CSS class selectors.
 *
 * Usage:
 *   import { parseAmazonOrderEmail } from '$lib/amazon-order-parser';
 *   const order = parseAmazonOrderEmail(htmlString);
 */

import { parse } from 'node-html-parser';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrderItem {
	item: string;
	quantity: number;
	price: string;
}

export interface OrderResult {
	order: string | null;
	items: OrderItem[];
	grandTotal: string | null;
}

// ── Quoted-Printable decoder ──────────────────────────────────────────────────
// ImprovMX may deliver the HTML already decoded, but this is a no-op if so.
// Handles multi-byte UTF-8 sequences correctly by accumulating raw bytes.

function decodeQP(input: string): string {
	const joined = input.replace(/=\r?\n/g, '');
	const bytes: number[] = [];
	let i = 0;
	while (i < joined.length) {
		if (
			joined[i] === '=' &&
			i + 2 < joined.length &&
			/[0-9A-Fa-f]{2}/.test(joined.slice(i + 1, i + 3))
		) {
			bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
			i += 3;
		} else {
			bytes.push(joined.charCodeAt(i));
			i++;
		}
	}
	return Buffer.from(bytes).toString('utf8');
}

// ── Text node extractor ───────────────────────────────────────────────────────

function cleanText(raw: string): string {
	return raw
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&quot;/g, '"')
		.replace(/[\u00ad\u200b\u200c\u200d\u202a\u202b\u202c\u202d\u202e\u034f]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

// Walk the DOM and collect all non-empty text nodes, deduplicated.
function extractTextNodes(html: string): string[] {
	const root = parse(html);
	const SKIP = /^[\s\u00a0]*$/;
	const raw: string[] = [];

	for (const el of root.querySelectorAll('*')) {
		for (const child of el.childNodes) {
			if (child.nodeType === 3) {
				const t = cleanText(child.text);
				if (t && !SKIP.test(t)) raw.push(t);
			}
		}
	}

	// Deduplicate consecutive identical values (forwarding wrappers repeat content)
	return raw.filter((t, i) => t !== raw[i - 1]);
}

// ── Token normaliser ──────────────────────────────────────────────────────────
// Merges tokens that are split across text nodes by the email renderer:
//
//   "Order #"  +  "113-456-789"   →  "Order # 113-456-789"
//   "$"  +  "12"  +  "99"         →  "$12.99"   (any order of $ / int / cents)

function normaliseTokens(tokens: string[]): string[] {
	const out: string[] = [];
	let i = 0;

	while (i < tokens.length) {
		const t = tokens[i];

		// "Order #" header split from the number
		if (/^Order\s*#\s*$/.test(t) && i + 1 < tokens.length) {
			out.push(`Order # ${tokens[i + 1].trim()}`);
			i += 2;
			continue;
		}

		// Split price — DOM walk always produces: integer, "$", cents
		// e.g. "12", "$", "99"  →  "$12.99"
		if (
			i + 2 < tokens.length &&
			/^\d+$/.test(t) &&
			tokens[i + 1] === '$' &&
			/^\d{2}$/.test(tokens[i + 2])
		) {
			out.push(`$${t}.${tokens[i + 2]}`);
			i += 3;
			continue;
		}

		out.push(t);
		i++;
	}

	return out;
}

// ── Pattern matchers ──────────────────────────────────────────────────────────

const ORDER_RE    = /^Order\s+#\s*([\d-]+)$/;
const QUANTITY_RE = /^Quantity:\s*(\d+)$/;
const PRICE_RE    = /^\$[\d,]+\.\d{2}$/;
const TOTAL_RE    = /^(Grand\s+)?Total:?$/i;

function matchPatterns(tokens: string[]): OrderResult {
	let order: string | null = null;
	let grandTotal: string | null = null;
	const items: OrderItem[] = [];

	for (let i = 0; i < tokens.length; i++) {
		// Order number
		const orderMatch = tokens[i].match(ORDER_RE);
		if (orderMatch) {
			order = orderMatch[1];
			continue;
		}

		// Grand total — label followed by price on next token
		if (TOTAL_RE.test(tokens[i])) {
			if (i + 1 < tokens.length && PRICE_RE.test(tokens[i + 1])) {
				grandTotal = tokens[i + 1];
				i += 1;
			}
			continue;
		}

		// Item triplet: item name at i-1, "Quantity: N" at i, price at i+1
		const qtyMatch = tokens[i].match(QUANTITY_RE);
		if (qtyMatch && i >= 1 && i + 1 < tokens.length && PRICE_RE.test(tokens[i + 1])) {
			items.push({
				item:     tokens[i - 1],
				quantity: parseInt(qtyMatch[1], 10),
				price:    tokens[i + 1]
			});
			i += 1;
		}
	}

	return { order, items, grandTotal };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse an Amazon order/shipment email HTML payload.
 *
 * @param html - The raw HTML string from ImprovMX's `html` field.
 *               May be quoted-printable encoded or already decoded.
 *               Works with output from macOS Mail, StartMail, or Gmail forwards.
 * @returns Structured order data, or `{ order: null, items: [], grandTotal: null }`
 *          if no recognisable content is found.
 */
export function parseAmazonOrderEmail(html: string): OrderResult {
	const decoded = html.includes('=3D') ? decodeQP(html) : html;
	const tokens  = normaliseTokens(extractTextNodes(decoded));
	return matchPatterns(tokens);
}