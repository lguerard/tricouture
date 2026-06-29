import { json } from '@sveltejs/kit';
import { proxyFile, whisperUrl } from '$lib/server/ai/sidecars';
import type { RequestHandler } from './$types';

// Reçoit un court extrait audio et renvoie sa transcription (commandes vocales).
export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'Audio requis' }, { status: 400 });
	const { status, body } = await proxyFile(whisperUrl(), '/transcribe', file);
	return json(body, { status });
};
