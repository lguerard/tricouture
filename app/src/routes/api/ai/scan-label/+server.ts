import { json } from '@sveltejs/kit';
import { proxyFile, visionUrl } from '$lib/server/ai/sidecars';
import type { RequestHandler } from './$types';

// Receives a yarn label photo and returns OCR text + guessed fields.
export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'Image required' }, { status: 400 });
	const { status, body } = await proxyFile(visionUrl(), '/ocr', file);
	return json(body, { status });
};
