import { json } from '@sveltejs/kit';
import { generate, AiUnavailable } from '$lib/server/ai/ollama';
import { MAX_TRANSLATE_CHARS, TRANSLATE_SYSTEM } from '$lib/server/ai/prompts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { text } = await request.json().catch(() => ({}));
	if (!text || typeof text !== 'string') return json({ error: 'Text required' }, { status: 400 });
	// Bounded: source and translation must both fit the model's context
	// window (see MAX_TRANSLATE_CHARS); a longer text would be cut silently.
	if (text.length > MAX_TRANSLATE_CHARS) {
		return json(
			{ error: `Text too long (max ${MAX_TRANSLATE_CHARS} characters) — translate it in several parts.` },
			{ status: 413 }
		);
	}
	try {
		const result = await generate(text, TRANSLATE_SYSTEM);
		return json({ result });
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Translation failed' }, { status: 500 });
	}
};
