// Pre-fill a new pattern from its link.
//
// A pattern usually arrives as a PDF or as a link (Ravelry, a designer's shop,
// a blog). When it is a link, retyping the title and the designer by hand is
// busywork: this reads them from the page itself.
//
// Fetching a URL the person typed means the SERVER makes a request on their
// behalf, and this server sits on the same LAN as Immich, Frigate, Portainer
// and the router's admin page. `http://192.168.1.1/` would otherwise turn this
// endpoint into a probe of the private network from a browser that cannot
// reach it. Hence: http(s) only, every hop resolved and checked against private
// ranges, redirects followed by hand, response truncated.
import { json } from '@sveltejs/kit';
import { lookup } from 'node:dns/promises';
import type { RequestHandler } from './$types';

const MAX_HOPS = 3;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;

function isPrivateAddress(ip: string): boolean {
	const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
	if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
		const [a, b] = v4.split('.').map(Number);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 169 && b === 254) || // link-local
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
			a >= 224 // multicast and reserved
		);
	}
	const v6 = ip.toLowerCase();
	return (
		v6 === '::' ||
		v6 === '::1' ||
		v6.startsWith('fc') ||
		v6.startsWith('fd') || // unique local
		v6.startsWith('fe80') // link-local
	);
}

// Resolves every address behind the host and refuses if any is private: a name
// can legitimately point at several addresses, and one private answer is enough
// to reach the LAN.
async function publicUrlOrNull(raw: string): Promise<URL | null> {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return null;
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
	try {
		const addrs = await lookup(u.hostname, { all: true });
		if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) return null;
	} catch {
		return null;
	}
	return u;
}

function meta(html: string, prop: string): string | null {
	const re = new RegExp(
		`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
		'i'
	);
	const m = html.match(re) ?? html.match(
		new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')
	);
	return m ? m[1].trim() : null;
}

function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&nbsp;/g, ' ');
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	let target = await publicUrlOrNull(String(body?.url ?? '').trim());
	if (!target) return json({ error: 'unsupported-url' }, { status: 400 });

	let html = '';
	for (let hop = 0; hop <= MAX_HOPS; hop++) {
		let res: Response;
		try {
			res = await fetch(target, {
				redirect: 'manual',
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: { accept: 'text/html,application/xhtml+xml' }
			});
		} catch {
			return json({ error: 'unreachable' }, { status: 502 });
		}

		if (res.status >= 300 && res.status < 400) {
			const next = res.headers.get('location');
			// Each hop is re-checked: a public host redirecting to 127.0.0.1 is
			// exactly how this kind of endpoint gets abused.
			const checked = next ? await publicUrlOrNull(new URL(next, target).href) : null;
			if (!checked) return json({ error: 'unsupported-url' }, { status: 400 });
			target = checked;
			continue;
		}
		if (!res.ok) return json({ error: 'unreachable' }, { status: 502 });
		if (!(res.headers.get('content-type') ?? '').includes('html')) {
			return json({ error: 'not-html' }, { status: 415 });
		}

		// Truncated on purpose: <head> is all this needs, and a 200 MB response
		// should not become 200 MB of memory.
		const reader = res.body?.getReader();
		if (!reader) return json({ error: 'unreachable' }, { status: 502 });
		const chunks: Uint8Array[] = [];
		let size = 0;
		while (size < MAX_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			size += value.length;
		}
		await reader.cancel().catch(() => {});
		html = new TextDecoder().decode(
			chunks.reduce((acc, c) => {
				const out = new Uint8Array(acc.length + c.length);
				out.set(acc);
				out.set(c, acc.length);
				return out;
			}, new Uint8Array())
		);
		break;
	}

	if (!html) return json({ error: 'unreachable' }, { status: 502 });

	const rawTitle = meta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
	// og:site_name is the shop or platform (Ravelry, Etsy…); the author meta is
	// the closest thing to a designer that a generic page exposes.
	const rawAuthor = meta(html, 'author') ?? meta(html, 'article:author') ?? '';

	return json({
		title: decodeEntities(rawTitle).trim().slice(0, 255) || null,
		designer: decodeEntities(rawAuthor).trim().slice(0, 160) || null,
		source: target.href
	});
};
