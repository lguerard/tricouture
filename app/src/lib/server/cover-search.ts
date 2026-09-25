// Finds a cover image for a pattern from its designer + title: web search,
// rank results (designer's own site first), then read each page's
// JSON-LD/OpenGraph image.
import { env } from '$env/dynamic/private';
import type { Craft } from '$lib/server/db/schema';
import { extractProduct, fetchImageAsDataUrl, fetchSafe } from '$lib/server/ai/product-lookup';

export interface CoverCandidate {
	imageUrl: string;
	pageUrl: string;
	title: string;
}

interface SearchResult {
	url: string;
	title: string;
}

const CRAFT_QUERY: Record<Craft, string> = {
	tricot: 'knitting pattern',
	crochet: 'crochet pattern',
	couture: 'sewing pattern'
};

// Pattern marketplaces whose pages carry a relevant og:image — good fallbacks
// when the designer has no site of their own.
const MARKETPLACES = ['ravelry.com', 'etsy.com', 'lovecrafts.com', 'makerist', 'payhip.com', 'ribblr.com'];
// Social/aggregator pages rarely expose the right image.
const EXCLUDED = ['pinterest.', 'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'x.com', 'twitter.com'];

function slug(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

function words(s: string): string[] {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length >= 3);
}

function decodeEntities(s: string): string {
	return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
}

// SearXNG is configured by the admin (usually on the internal docker network),
// so it is trusted like OLLAMA_URL and bypasses the public-only fetch guard.
async function searchSearxng(base: string, query: string): Promise<SearchResult[]> {
	const res = await fetch(`${base.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&format=json`, {
		signal: AbortSignal.timeout(8000)
	});
	if (!res.ok) return [];
	const data = (await res.json()) as { results?: { url?: string; title?: string }[] };
	return (data.results ?? [])
		.filter((r): r is { url: string; title?: string } => typeof r.url === 'string')
		.map((r) => ({ url: r.url, title: r.title ?? '' }));
}

// No-key fallback: DuckDuckGo's HTML endpoint.
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
	const { buf } = await fetchSafe(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
		accept: 'text/html'
	});
	const html = buf.toString('utf-8');
	const results: SearchResult[] = [];
	const re = /<a\s[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		const href = m[0].match(/href="([^"]+)"/)?.[1];
		if (!href) continue;
		let url = decodeEntities(href);
		if (url.includes('uddg=')) {
			const target = new URL(url.startsWith('//') ? `https:${url}` : url).searchParams.get('uddg');
			if (!target) continue;
			url = target;
		}
		if (!/^https?:\/\//.test(url) || url.includes('duckduckgo.com/y.js')) continue;
		results.push({ url, title: decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim() });
	}
	return results;
}

async function webSearch(query: string): Promise<SearchResult[]> {
	try {
		const searx = env.SEARXNG_URL;
		return searx ? await searchSearxng(searx, query) : await searchDuckDuckGo(query);
	} catch {
		return [];
	}
}

function score(r: SearchResult, designer: string, titleWords: string[]): number {
	let host: string;
	try {
		host = new URL(r.url).hostname.replace(/^www\./, '');
	} catch {
		return -10;
	}
	if (EXCLUDED.some((d) => host.includes(d))) return -10;

	let s = 0;
	const designerSlug = slug(designer);
	const hostSlug = slug(host.split('.').slice(0, -1).join('.'));
	const ownSite =
		designerSlug.length >= 4 &&
		(hostSlug.includes(designerSlug) || (hostSlug.length >= 5 && designerSlug.includes(hostSlug)));
	if (ownSite) s += 5;
	else if (words(designer).some((w) => w.length >= 4 && hostSlug.includes(w))) s += 3;
	else if (MARKETPLACES.some((d) => host.includes(d))) s += 2;

	// Prefer the pattern's own page over a homepage.
	const haystack = `${r.title} ${decodeURIComponent(r.url)}`.toLowerCase();
	const hits = titleWords.filter((w) => haystack.includes(w)).length;
	s += titleWords.length ? (hits / titleWords.length) * 3 : 0;
	return s;
}

async function imageFromPage(pageUrl: string): Promise<string | null> {
	try {
		const { res, buf } = await fetchSafe(pageUrl, { maxBytes: 3_000_000, accept: 'text/html' });
		const product = extractProduct(buf.toString('utf-8'), res.url || pageUrl);
		if (!product.imageUrl || /logo|favicon|placeholder/i.test(product.imageUrl)) return null;
		return product.imageUrl;
	} catch {
		return null;
	}
}

// Ranked cover candidates (best first). Empty if nothing usable was found.
export async function findCoverCandidates(
	opts: { designer: string; title: string; craft: Craft },
	limit = 6
): Promise<CoverCandidate[]> {
	// Quoted title is precise when the pattern is known; the loose query rescues
	// typos and translated titles. Merge both.
	const [exact, loose] = await Promise.all([
		webSearch(`${opts.designer} "${opts.title}" ${CRAFT_QUERY[opts.craft]}`),
		webSearch(`${opts.designer} ${opts.title} ${CRAFT_QUERY[opts.craft]}`)
	]);
	const byUrl = new Map<string, SearchResult>();
	for (const r of [...exact, ...loose]) if (!byUrl.has(r.url)) byUrl.set(r.url, r);
	const titleWords = words(opts.title);
	const ranked = [...byUrl.values()]
		.map((r) => ({ r, s: score(r, opts.designer, titleWords) }))
		.filter((x) => x.s > 0)
		.sort((a, b) => b.s - a.s)
		.slice(0, limit)
		.map((x) => x.r);

	const images = await Promise.all(ranked.map((r) => imageFromPage(r.url)));
	const seen = new Set<string>();
	const out: CoverCandidate[] = [];
	ranked.forEach((r, i) => {
		const img = images[i];
		if (img && !seen.has(img)) {
			seen.add(img);
			out.push({ imageUrl: img, pageUrl: r.url, title: r.title });
		}
	});
	return out;
}

// Formats storage.saveDataUrl and the /media route can serve.
const STORABLE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function isStorableImage(dataUrl: string): boolean {
	return STORABLE.some((t) => dataUrl.startsWith(`data:${t};`));
}

// Best candidate downloaded as a data URL, or null (nothing found / too slow).
export async function autoFindCover(
	opts: { designer: string; title: string; craft: Craft },
	timeoutMs = 15_000
): Promise<string | null> {
	const work = (async () => {
		for (const c of await findCoverCandidates(opts, 4)) {
			const img = await fetchImageAsDataUrl(c.imageUrl);
			if (img && isStorableImage(img.dataUrl)) return img.dataUrl;
		}
		return null;
	})();
	const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
	return Promise.race([work, timeout]);
}

// Accepts either a direct image URL or a web page URL (whose main image is used).
export async function resolveImageFromUrl(url: string): Promise<string | null> {
	try {
		const { res, buf } = await fetchSafe(url, { maxBytes: 3_000_000, accept: 'text/html,image/*' });
		const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
		if (type.startsWith('image/')) return `data:${type};base64,${buf.toString('base64')}`;
		const imageUrl = extractProduct(buf.toString('utf-8'), res.url || url).imageUrl;
		return imageUrl ? (await fetchImageAsDataUrl(imageUrl))?.dataUrl ?? null : null;
	} catch {
		return null;
	}
}
