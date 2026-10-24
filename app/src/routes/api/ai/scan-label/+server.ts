import { json } from '@sveltejs/kit';
import { AiUnavailable } from '$lib/server/ai/ollama';
import { scanYarnLabel } from '$lib/server/ai/vision';
import { warnIfVisionUrlSet } from '$lib/server/ai/sidecars';
import type { RequestHandler } from './$types';

// Max upload read into memory for a label photo.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// Receives a yarn label photo and returns guessed fields, read by the
// (vision-capable) chat model. Response shape unchanged from the former OCR
// sidecar: { fields: { brand, name, colorway, fiber, weightCategory,
// yardsPerSkein (meters, see vision.ts), gramsPerSkein, needleSizeMm,
// hookSizeMm } } -- the stash form fills the ones it has inputs for.
export const POST: RequestHandler = async ({ request }) => {
	warnIfVisionUrlSet();
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'Image required' }, { status: 400 });
	if (file.size > MAX_IMAGE_BYTES) return json({ error: 'Image too large' }, { status: 413 });
	try {
		const fields = await scanYarnLabel(Buffer.from(await file.arrayBuffer()));
		return json({ fields });
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		// Typically a text-only OLLAMA_CHAT_MODEL refusing the image, or a
		// file sharp cannot decode.
		return json({ error: 'Label scan failed (is OLLAMA_CHAT_MODEL vision-capable?)' }, { status: 502 });
	}
};
