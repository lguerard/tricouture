import { json } from '@sveltejs/kit';
import { proxyFile, whisperUrl } from '$lib/server/ai/sidecars';
import type { RequestHandler } from './$types';

// Receives a short audio clip and returns its transcription (voice commands).
export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'Audio required' }, { status: 400 });
	const { status, body } = await proxyFile(whisperUrl(), '/transcribe', file);
	return json(body, { status });
};
