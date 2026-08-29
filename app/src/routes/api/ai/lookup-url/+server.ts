import { json } from '@sveltejs/kit';
import {
	extractProduct,
	fetchImageAsDataUrl,
	fetchSafe,
	productToFieldsByKind,
	type StashKind
} from '$lib/server/ai/product-lookup';
import type { RequestHandler } from './$types';

const KINDS: StashKind[] = ['yarn', 'fabric', 'notion', 'tool'];

// Fetches a shop product page URL, extracts JSON-LD/OpenGraph metadata,
// and returns guessed fields (shaped for the given stash tab) + a preview photo.
export const POST: RequestHandler = async ({ request }) => {
	let body: { url?: string; kind?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'JSON invalide' }, { status: 400 });
	}
	const raw = body.url?.trim();
	if (!raw) return json({ error: 'URL requise' }, { status: 400 });
	const kind = KINDS.includes(body.kind as StashKind) ? (body.kind as StashKind) : 'yarn';

	let html: string;
	let finalUrl: string;
	try {
		const { res, buf } = await fetchSafe(raw, { maxBytes: 3_000_000, accept: 'text/html' });
		finalUrl = res.url || raw;
		html = buf.toString('utf-8');
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Récupération impossible' }, { status: 502 });
	}

	const product = extractProduct(html, finalUrl);
	const fields = productToFieldsByKind(kind, product);
	const photo = product.imageUrl ? await fetchImageAsDataUrl(product.imageUrl) : null;

	return json({ fields, photoDataUrl: photo?.dataUrl ?? null, sourceUrl: finalUrl });
};
