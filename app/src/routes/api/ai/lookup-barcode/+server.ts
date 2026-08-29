import { json } from '@sveltejs/kit';
import { fetchImageAsDataUrl, productToFieldsByKind, type StashKind } from '$lib/server/ai/product-lookup';
import type { RequestHandler } from './$types';

interface UpcItem {
	title?: string;
	brand?: string;
	description?: string;
	color?: string;
	images?: string[];
}

const KINDS: StashKind[] = ['yarn', 'fabric', 'notion', 'tool'];

// Looks up a scanned barcode against UPCitemdb's public trial endpoint (no API
// key required) and returns guessed fields (shaped for the given stash tab) +
// a downloaded preview photo.
export const POST: RequestHandler = async ({ request }) => {
	let body: { code?: string; kind?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'JSON invalide' }, { status: 400 });
	}
	const code = body.code?.trim();
	if (!code || !/^\d{6,14}$/.test(code)) return json({ error: 'Code-barres invalide' }, { status: 400 });
	const kind = KINDS.includes(body.kind as StashKind) ? (body.kind as StashKind) : 'yarn';

	let item: UpcItem | undefined;
	try {
		const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`, {
			signal: AbortSignal.timeout(8000)
		});
		if (res.ok) {
			const data = (await res.json()) as { items?: UpcItem[] };
			item = data.items?.[0];
		}
	} catch {
		// lookup service unreachable — fall through to "not found"
	}

	if (!item) return json({ error: 'Produit introuvable pour ce code-barres' }, { status: 404 });

	const fields = productToFieldsByKind(kind, {
		title: item.title,
		brand: item.brand,
		description: item.description,
		color: item.color
	});

	const img = item.images?.[0];
	const photo = img ? await fetchImageAsDataUrl(img) : null;

	return json({ fields, photoDataUrl: photo?.dataUrl ?? null });
};
