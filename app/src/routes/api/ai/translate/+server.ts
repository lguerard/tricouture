import { json } from '@sveltejs/kit';
import { generate, AiUnavailable } from '$lib/server/ai/ollama';
import { TRANSLATE_SYSTEM } from '$lib/server/ai/prompts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { text } = await request.json().catch(() => ({}));
	if (!text || typeof text !== 'string') return json({ error: 'Texte requis' }, { status: 400 });
	try {
		const result = await generate(text, TRANSLATE_SYSTEM);
		return json({ result });
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Échec traduction' }, { status: 500 });
	}
};
