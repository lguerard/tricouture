import { json } from '@sveltejs/kit';
import { aiConfigured } from '$lib/server/ai/ollama';
import { classifyMotif } from '$lib/server/ai/vision';
import { dominantColor } from '$lib/server/palette';
import type { RequestHandler } from './$types';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// Guesses colorHex (dominant color, computed in-process -- deterministic, no
// AI needed) and motif (vision-capable chat model, constrained to
// MOTIF_VALUES; best-effort, null when the AI is off or fails) from a stash
// photo -- used to fill yarn/fabric fields when no product page text is
// available (or as a cross-check against it). `?motif=0` skips the model
// call when the caller only needs the colour.
export const POST: RequestHandler = async ({ request, url }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'Image required' }, { status: 400 });
	if (file.size > MAX_IMAGE_BYTES) return json({ error: 'Image too large' }, { status: 413 });
	const data = Buffer.from(await file.arrayBuffer());

	const colorHex = await dominantColor(data);
	if (!colorHex) return json({ error: 'Unreadable image' }, { status: 415 });

	let motif: string | null = null;
	if (aiConfigured() && url.searchParams.get('motif') !== '0') {
		motif = await classifyMotif(data).catch(() => null);
	}
	return json({ colorHex, motif });
};
