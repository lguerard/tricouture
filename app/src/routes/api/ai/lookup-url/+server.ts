import { json } from '@sveltejs/kit';
import {
	extractProduct,
	fetchImageAsDataUrl,
	fetchSafe,
	HttpStatusError,
	looksLikeBotChallenge,
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
		// 403/503 sur une page publique = filtre anti-robot, pas une panne. Le
		// dire franchement évite de faire réessayer sur un site qui ne cédera
		// jamais (Cloudflare « Just a moment… » exécute du JS avant de servir
		// la page : aucun en-tête ne le franchit).
		if (e instanceof HttpStatusError && (e.status === 403 || e.status === 503)) {
			return json({ error: 'blocked', status: e.status }, { status: 403 });
		}
		return json({ error: e instanceof Error ? e.message : 'Récupération impossible' }, { status: 502 });
	}

	// Le challenge peut arriver en 200 : la page reçue est l'interstitiel, pas
	// la fiche produit. Sans ce test on annoncerait « champs pré-remplis » avec
	// un titre « Just a moment... ».
	if (looksLikeBotChallenge(html)) return json({ error: 'blocked', status: 200 }, { status: 403 });

	const product = extractProduct(html, finalUrl);
	const fields = productToFieldsByKind(kind, product);
	const photo = product.imageUrl ? await fetchImageAsDataUrl(product.imageUrl) : null;

	// Une page sans JSON-LD ni OpenGraph passe la récupération mais ne donne
	// rien : le signaler plutôt que d'afficher « champs pré-remplis ✓ » devant
	// un formulaire resté vide.
	if (Object.keys(fields).length === 0 && !photo) return json({ error: 'nometa' }, { status: 422 });

	return json({ fields, photoDataUrl: photo?.dataUrl ?? null, sourceUrl: finalUrl });
};
