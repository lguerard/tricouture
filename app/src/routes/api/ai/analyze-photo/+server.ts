import { json } from '@sveltejs/kit';
import { proxyFile, visionUrl } from '$lib/server/ai/sidecars';
import type { RequestHandler } from './$types';

// Guesses colorHex (dominant color) and motif (zero-shot CLIP, if installed)
// from a stash photo — used to fill yarn/fabric fields when no product page
// text is available (or as a cross-check against it).
export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'Image required' }, { status: 400 });
	const { status, body } = await proxyFile(visionUrl(), '/analyze-photo', file);
	return json(body, { status });
};
