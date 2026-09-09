// Guesses yarn fields (brand/name/colorway/fiber/weight/yardage) from a shop
// product page (URL) or a barcode lookup, so the stash form can be pre-filled.
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { COLOR_NAMES } from '$lib/labels';

export interface GuessedYarnFields {
	brand?: string;
	name?: string;
	colorway?: string;
	fiber?: string;
	weightCategory?: string;
	motif?: string;
	colorHex?: string;
	yardsPerSkein?: number;
	gramsPerSkein?: number;
}

// Matches a known color name (FR/EN) inside scraped text and returns its hex.
function guessColorHex(text: string): string | undefined {
	const low = text.toLowerCase();
	for (const [name, hex] of Object.entries(COLOR_NAMES)) {
		if (low.includes(name)) return hex;
	}
	return undefined;
}

// Print pattern — codes match lib/labels.ts MOTIF_VALUES (locale-invariant).
const MOTIF_KEYWORDS: [RegExp, string][] = [
	[/jacquard/i, 'jacquard'],
	[/(écossais|ecossais|tartan|plaid|carreaux)/i, 'plaid'],
	[/(chevrons?)/i, 'chevron'],
	[/(rayures?|rayé|raye|stripe[sd]?)/i, 'stripes'],
	[/(fleur[si]?|floral|flowers?)/i, 'floral'],
	[/(pois|polka.?dots?|dots?)/i, 'dots'],
	[/(animalier|léopard|leopard|zèbre|zebre|animal print)/i, 'animal'],
	[/(géométrique|geometrique|geometric)/i, 'geometric'],
	[/(imprimé|imprime|printed?)/i, 'print'],
	[/(uni\b|plain|solid)/i, 'solid']
];

function guessMotif(text: string): string | undefined {
	const hit = MOTIF_KEYWORDS.find(([re]) => re.test(text));
	return hit?.[1];
}

export interface ScrapedProduct {
	title?: string;
	brand?: string;
	description?: string;
	color?: string;
	material?: string;
	imageUrl?: string;
}

const WEIGHTS = ['lace', 'fingering', 'sport', 'dk', 'worsted', 'aran', 'bulky', 'super bulky'];

// Same heuristics as services/vision (OCR label parsing), applied to product text instead.
export function guessYarnFields(text: string): GuessedYarnFields {
	const low = text.toLowerCase();
	const fields: GuessedYarnFields = {};

	let m = low.match(/(\d{2,4})\s?(m|meters|mètres|metres|yd|yds|yards)\b/);
	if (m) fields.yardsPerSkein = parseInt(m[1], 10);

	m = low.match(/(\d{2,3})\s?(g|grammes|grams)\b/);
	if (m) fields.gramsPerSkein = parseInt(m[1], 10);

	for (const w of WEIGHTS) {
		if (low.includes(w)) {
			fields.weightCategory = w.replace(' ', '-');
			break;
		}
	}

	m = low.match(/(\d{1,3})\s?%\s?([a-zàâéèêëîïôûüç ]+)/);
	if (m) fields.fiber = `${m[1]}% ${m[2].trim()}`;

	const motif = guessMotif(text);
	if (motif) fields.motif = motif;

	return fields;
}

function productToYarnFields(p: ScrapedProduct): GuessedYarnFields {
	const explicit: GuessedYarnFields = {};
	if (p.brand) explicit.brand = p.brand.trim();
	if (p.title) {
		const parts = p.title
			.split(/\s[-–|]\s/)
			.map((s) => s.trim())
			.filter(Boolean);
		if (parts.length > 1) {
			explicit.name = parts[0];
			explicit.colorway = parts[parts.length - 1];
		} else {
			explicit.name = p.title.trim();
		}
	}
	if (p.color) explicit.colorway = p.color.trim();

	const blob = [p.title, p.description, p.material, p.color].filter(Boolean).join(' ');
	const colorHex = guessColorHex(p.color ?? blob);
	if (colorHex) explicit.colorHex = colorHex;

	return { ...guessYarnFields(blob), ...explicit };
}

export type StashKind = 'yarn' | 'fabric' | 'notion' | 'tool';

const FABRIC_TYPES = [
	'jersey', 'coton', 'lin', 'laine', 'soie', 'viscose', 'polyester',
	'velours', 'sergé', 'popeline', 'maille', 'éponge', 'denim', 'satin', 'flanelle'
];

const NOTION_CATEGORIES: [string, string][] = [
	['bouton', 'bouton'],
	['button', 'bouton'],
	['fermeture', 'fermeture'],
	['zipper', 'fermeture'],
	['zip', 'fermeture'],
	['fil', 'fil'],
	['thread', 'fil'],
	['élastique', 'élastique'],
	['elastic', 'élastique'],
	['ruban', 'ruban'],
	['ribbon', 'ruban'],
	['entoilage', 'entoilage'],
	['interfacing', 'entoilage'],
	['biais', 'biais']
];

const TOOL_TYPE_KEYWORDS: [RegExp, string][] = [
	[/crochet/i, 'crochet'],
	[/(circulaire|circular)/i, 'aiguille_circulaire'],
	[/(double.?pointe?|dpn)/i, 'aiguille_double_pointe'],
	[/(aiguille droite|straight needle|single.?point)/i, 'aiguille_droite']
];

function guessPercent(text: string): string | undefined {
	const m = text.toLowerCase().match(/(\d{1,3})\s?%\s?([a-zàâéèêëîïôûüç ]+)/);
	return m ? `${m[1]}% ${m[2].trim()}` : undefined;
}

function guessMm(text: string): number | undefined {
	const m = text.toLowerCase().match(/(\d(?:[.,]\d)?)\s?mm\b/);
	return m ? parseFloat(m[1].replace(',', '.')) : undefined;
}

function guessCm(text: string): number | undefined {
	const m = text.toLowerCase().match(/(\d{2,3})\s?cm\b/);
	return m ? parseInt(m[1], 10) : undefined;
}

function productToFabricFields(p: ScrapedProduct): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	if (p.title) fields.name = p.title.trim();
	const blob = [p.title, p.description, p.material, p.color].filter(Boolean).join(' ');
	const low = blob.toLowerCase();
	const type = FABRIC_TYPES.find((w) => low.includes(w));
	if (type) fields.fabricType = type;
	fields.composition = guessPercent(blob) ?? p.material;
	const width = guessCm(blob);
	if (width) fields.widthCm = width;
	const motif = guessMotif(blob);
	if (motif) fields.motif = motif;
	const colorHex = guessColorHex(p.color ?? blob);
	if (colorHex) fields.colorHex = colorHex;
	return fields;
}

function productToNotionFields(p: ScrapedProduct): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	if (p.title) fields.name = p.title.trim();
	const blob = [p.title, p.description].filter(Boolean).join(' ').toLowerCase();
	const cat = NOTION_CATEGORIES.find(([kw]) => blob.includes(kw));
	if (cat) fields.category = cat[1];
	return fields;
}

function productToToolFields(p: ScrapedProduct): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	const blob = [p.title, p.description].filter(Boolean).join(' ');
	const type = TOOL_TYPE_KEYWORDS.find(([re]) => re.test(blob));
	if (type) fields.type = type[1];
	const mm = guessMm(blob);
	if (mm) fields.sizeMm = mm;
	const cm = guessCm(blob);
	if (cm) fields.lengthCm = cm;
	return fields;
}

// Dispatches the scraped/looked-up product to the field set for the given stash tab.
export function productToFieldsByKind(kind: StashKind, p: ScrapedProduct): Record<string, unknown> {
	if (kind === 'fabric') return productToFabricFields(p);
	if (kind === 'notion') return productToNotionFields(p);
	if (kind === 'tool') return productToToolFields(p);
	return { ...productToYarnFields(p) };
}

function decodeHtmlEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}

// Matches <meta ...> tags regardless of attribute order.
function metaByProp(html: string, propNames: string[]): string | undefined {
	const re = /<meta\s+[^>]*>/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		const tag = m[0];
		const propMatch = tag.match(/(?:property|name)=["']([^"']+)["']/i);
		if (!propMatch || !propNames.includes(propMatch[1].toLowerCase())) continue;
		const contentMatch = tag.match(/content=["']([^"']*)["']/i);
		if (contentMatch) return decodeHtmlEntities(contentMatch[1]);
	}
	return undefined;
}

// Best-effort scrape: JSON-LD Product schema first, OpenGraph/meta tags as fallback.
export function extractProduct(html: string, baseUrl: string): ScrapedProduct {
	const result: ScrapedProduct = {};

	const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let m: RegExpExecArray | null;
	while ((m = ldRe.exec(html))) {
		let data: unknown;
		try {
			data = JSON.parse(m[1].trim());
		} catch {
			continue;
		}
		const graph = data as { '@graph'?: unknown[] };
		const items = Array.isArray(data) ? data : Array.isArray(graph['@graph']) ? graph['@graph']! : [data];
		for (const raw of items) {
			const item = raw as Record<string, unknown>;
			const type = item['@type'];
			const types = Array.isArray(type) ? type : [type];
			if (!types.includes('Product')) continue;
			if (typeof item.name === 'string') result.title ??= item.name;
			if (typeof item.description === 'string') result.description ??= item.description;
			if (typeof item.color === 'string') result.color ??= item.color;
			if (typeof item.material === 'string') result.material ??= item.material;
			const brand = item.brand as { name?: string } | string | undefined;
			if (typeof brand === 'string') result.brand ??= brand;
			else if (brand?.name) result.brand ??= brand.name;
			const image = item.image as string[] | string | { url?: string } | undefined;
			const img = Array.isArray(image) ? image[0] : image;
			if (typeof img === 'string') result.imageUrl ??= img;
			else if (img?.url) result.imageUrl ??= img.url;
		}
	}

	result.title ??= metaByProp(html, ['og:title']);
	if (!result.title) {
		const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
		if (titleTag) result.title = decodeHtmlEntities(titleTag[1]).trim();
	}
	result.description ??= metaByProp(html, ['og:description', 'description']);
	result.imageUrl ??= metaByProp(html, ['og:image']);

	if (result.imageUrl) {
		try {
			result.imageUrl = new URL(result.imageUrl, baseUrl).toString();
		} catch {
			result.imageUrl = undefined;
		}
	}

	return result;
}

// --- SSRF-guarded fetch (user-supplied shop URLs must never reach internal network) ---

// Identifies the app to the sites it fetches. Sending no User-Agent at all is
// what most anti-bot filters reject first, and it leaves shop owners no way to
// tell who is calling: an honest UA is both more polite and more likely to pass.
export const SCRAPER_USER_AGENT = 'tricouture/1.0 (+https://github.com/lguerard/tricouture)';

// Carries the HTTP status so callers can tell "the site refused us" (403/503,
// typically an anti-bot filter) from "the page had nothing to extract".
export class HttpStatusError extends Error {
	constructor(readonly status: number) {
		super(`HTTP ${status}`);
		this.name = 'HttpStatusError';
	}
}

// Cloudflare and friends serve an interstitial that runs JavaScript before
// letting a real browser through. It can arrive with a 403 *or* a 200, so the
// status alone is not enough to detect it.
const CHALLENGE_MARKERS = [
	'just a moment...',
	'attention required!',
	'cf-browser-verification',
	'__cf_chl',
	'/cdn-cgi/challenge-platform',
	'checking your browser before accessing'
];

export function looksLikeBotChallenge(html: string): boolean {
	const head = html.slice(0, 4000).toLowerCase();
	return CHALLENGE_MARKERS.some((m) => head.includes(m));
}

function isPrivateIp(ip: string): boolean {
	const kind = isIP(ip);
	if (kind === 4) {
		const parts = ip.split('.').map(Number);
		const [a, b] = parts;
		if (a === 10 || a === 127 || a === 0) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		return false;
	}
	if (kind === 6) {
		const low = ip.toLowerCase();
		if (low === '::1' || low === '::') return true;
		if (low.startsWith('fe80:')) return true;
		if (low.startsWith('fc') || low.startsWith('fd')) return true;
		if (low.startsWith('::ffff:')) {
			const v4 = low.split(':').pop()!;
			if (isIP(v4) === 4) return isPrivateIp(v4);
		}
		return false;
	}
	return true; // unresolvable/unknown -> block
}

async function assertPublicHttpUrl(raw: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error('URL invalide');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('URL invalide');
	if (url.username || url.password) throw new Error('URL invalide');
	if (url.hostname === 'localhost') throw new Error('URL non autorisée');

	let addresses: string[];
	try {
		addresses = (await dnsLookup(url.hostname, { all: true })).map((r) => r.address);
	} catch {
		throw new Error('Résolution DNS échouée');
	}
	if (addresses.length === 0 || addresses.some(isPrivateIp)) throw new Error('URL non autorisée');
	return url;
}

// Fetches a URL with SSRF guarding (re-checked on every redirect hop) and a size cap.
export async function fetchSafe(
	rawUrl: string,
	opts: { maxBytes?: number; accept?: string } = {}
): Promise<{ res: Response; buf: Buffer }> {
	let current = rawUrl;
	const maxBytes = opts.maxBytes ?? 2_000_000;

	for (let hop = 0; hop < 5; hop++) {
		const url = await assertPublicHttpUrl(current);
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 8000);
		let res: Response;
		try {
			res = await fetch(url, {
				redirect: 'manual',
				signal: controller.signal,
				headers: {
					'user-agent': SCRAPER_USER_AGENT,
					...(opts.accept ? { accept: opts.accept } : {})
				}
			});
		} finally {
			clearTimeout(timer);
		}

		if (res.status >= 300 && res.status < 400) {
			const loc = res.headers.get('location');
			if (!loc) throw new Error('Redirection invalide');
			current = new URL(loc, url).toString();
			continue;
		}
		if (!res.ok) throw new HttpStatusError(res.status);

		const reader = res.body?.getReader();
		if (!reader) {
			const buf = Buffer.from(await res.arrayBuffer());
			if (buf.length > maxBytes) throw new Error('Réponse trop volumineuse');
			return { res, buf };
		}
		const chunks: Uint8Array[] = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.length;
			if (total > maxBytes) {
				await reader.cancel();
				throw new Error('Réponse trop volumineuse');
			}
			chunks.push(value);
		}
		return { res, buf: Buffer.concat(chunks) };
	}
	throw new Error('Trop de redirections');
}

// Downloads a remote image (SSRF-guarded) and returns it as a data URL for client preview.
export async function fetchImageAsDataUrl(
	url: string,
	maxBytes = 3_000_000
): Promise<{ dataUrl: string; mimeType: string } | null> {
	try {
		const { res, buf } = await fetchSafe(url, { maxBytes, accept: 'image/*' });
		const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
		if (!mimeType.startsWith('image/')) return null;
		return { dataUrl: `data:${mimeType};base64,${buf.toString('base64')}`, mimeType };
	} catch {
		return null;
	}
}
