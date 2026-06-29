import { json } from '@sveltejs/kit';
import { proxyFile, visionUrl } from '$lib/server/ai/sidecars';
import type { RequestHandler } from './$types';

// Reçoit une photo d'étiquette de pelote et renvoie texte OCR + champs devinés.
export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'Image requise' }, { status: 400 });
	const { status, body } = await proxyFile(visionUrl(), '/ocr', file);
	return json(body, { status });
};
