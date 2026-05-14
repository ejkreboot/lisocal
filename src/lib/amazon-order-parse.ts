/**
 * amazon-order-parser.ts
 *
 * Parses the HTML part of an Amazon order/shipment email (as delivered by
 * ImprovMX or similar) and extracts structured order data.
 *
 * Usage:
 *   import { parseAmazonOrderEmail } from '$lib/amazon-order-parser';
 *   const order = parseAmazonOrderEmail(htmlString);
 */

import { parse, type HTMLElement } from 'node-html-parser';

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
// Handles multi-byte UTF-8 sequences (e.g. em-dash =E2=80=93) correctly by
// accumulating raw bytes before converting to a string.

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

// ── Leaf text extractor ───────────────────────────────────────────────────────

// Amazon's price spans carry structured data in aria-label:
//   aria-label="{amount=12.99, currencyCode={...}}"
// Some clients (e.g. StartMail web) strip aria-label attributes, so we also
// support a DOM fallback that reconstructs from the <sup>$</sup>12<sup>99</sup>
// visual structure.
function tryAriaPrice(node: HTMLElement): string | null {
	const label = node.getAttribute('aria-label') ?? '';
	const m = label.match(/amount=([\d.]+)/);
	return m ? `$${parseFloat(m[1]).toFixed(2)}` : null;
}

function trySupPrice(node: HTMLElement): string | null {
	// Collapse all text under this node and match $<dollars><cents> with no decimal
	const allText = node.text.replace(/\s+/g, '');
	const m = allText.match(/^\$(\d+)(\d{2})$/);
	return m ? `$${m[1]}.${m[2]}` : null;
}

// Walks to the deepest text-bearing nodes, skipping purely structural wrappers.
function leafText(node: HTMLElement): string {
	const ariaPrice = tryAriaPrice(node);
	if (ariaPrice) return ariaPrice;

	const children = node.childNodes;
	if (!children || children.length === 0) return node.text ?? '';

	const elementChildren = children.filter((c) => c.nodeType === 1) as HTMLElement[];
	if (elementChildren.length === 0) return children.map((c) => c.text ?? '').join('');

	// If children are <sup> tags this is a price node — try sup reconstruction
	const allSup = elementChildren.every(
		(e) => (e as HTMLElement).rawTagName?.toLowerCase() === 'sup'
	);
	if (allSup) {
		const supPrice = trySupPrice(node);
		if (supPrice) return supPrice;
	}

	return elementChildren.map(leafText).join(' ');
}

function cleanText(raw: string): string {
	return raw
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&quot;/g, '"')
		.replace(/[\u200b\u200c\u200d\u202a\u202b\u202c\u202d\u202e]/g, '') // bidi / zero-width
		.replace(/\s+/g, ' ')
		.trim();
}

// ── Grand total extractor ─────────────────────────────────────────────────────
// Finds the <tr> whose first <td> text is exactly "Grand Total:" and returns
// the text of the second <td> (the amount).

function extractGrandTotal(root: ReturnType<typeof parse>): string | null {
	const PRICE_RE = /\$[\d,]+\.\d{2}/;

	for (const tr of root.querySelectorAll('tr')) {
		const tds = tr.querySelectorAll('td');

		// Pattern A — two sibling TDs: "Grand Total:" | "$27.35"
		// (macOS Mail / standard Amazon template)
		if (tds.length === 2) {
			const label = tds[0].text.replace(/\s+/g, ' ').trim();
			const value = tds[1].text.replace(/\s+/g, ' ').trim();
			if (/^Grand Total:?$/.test(label) && PRICE_RE.test(value)) {
				return value.match(PRICE_RE)![0];
			}
		}

		// Pattern B — single TD containing both label and amount: "Total $15.27"
		// (StartMail web client collapses the row into nested tables)
		// Pick the innermost (fewest child TDs) matching TD to avoid outer containers.
		let bestMatch: { td: ReturnType<typeof parse> | null; childCount: number } = { td: null, childCount: Infinity };
		for (const td of tds) {
			const text = td.text.replace(/\s+/g, ' ').trim();
			if (/^(Grand )?Total/.test(text) && PRICE_RE.test(text)) {
				const childCount = td.querySelectorAll('td').length;
				if (childCount < bestMatch.childCount) bestMatch = { td, childCount };
			}
		}
		if (bestMatch.td) {
			const text = (bestMatch.td as HTMLElement).text.replace(/\s+/g, ' ').trim();
			return text.match(PRICE_RE)![0];
		}
	}
	return null;
}

// ── Pattern matchers ──────────────────────────────────────────────────────────

const ORDER_RE = /^Order\s+#\s*([\d-]+)$/;
const QUANTITY_RE = /^Quantity:\s*(\d+)$/;
const PRICE_RE = /^\$[\d,]+\.\d{2}$/;

function matchPatterns(lines: string[], grandTotal: string | null): OrderResult {
	let order: string | null = null;
	const items: OrderItem[] = [];

	for (let i = 0; i < lines.length; i++) {
		const orderMatch = lines[i].match(ORDER_RE);
		if (orderMatch) {
			order = orderMatch[1];
			continue;
		}

		// Triplet: item name at i-1, "Quantity: N" at i, price at i+1
		const qtyMatch = lines[i].match(QUANTITY_RE);
		if (qtyMatch && i >= 1 && PRICE_RE.test(lines[i + 1])) {
			items.push({
				item: lines[i - 1],
				quantity: parseInt(qtyMatch[1], 10),
				price: lines[i + 1]
			});
			i += 1; // skip the price line we just consumed
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
 * @returns Structured order data, or `{ order: null, items: [] }` if no
 *          recognisable content is found.
 */
export function parseAmazonOrderEmail(html: string): OrderResult {
	// Decode QP if needed (no-op if already plain HTML)
	const decoded = html.includes('=3D') ? decodeQP(html) : html;
	const root = parse(decoded);
	const lines = root
		.querySelectorAll('[class*="rio-text"]')
		.map((el) => cleanText(leafText(el)))
		.filter((t) => t.length > 0);
	const grandTotal = extractGrandTotal(root);
	return matchPatterns(lines, grandTotal);
}
