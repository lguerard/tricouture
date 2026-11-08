import { json } from '@sveltejs/kit';
import { AiUnavailable } from '$lib/server/ai/ollama';
import { normalizeInfoLanguage } from '$lib/server/ai/patternInfo';
import { fillPatternInfo } from '$lib/server/services/patterns';
import type { RequestHandler } from './$types';

// Fills the pattern's empty info fields (and adds tags) from its text.
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => ({}));
	const patternId = String(body?.patternId ?? '');
	if (!patternId) return json({ error: 'patternId required' }, { status: 400 });

	let filled;
	try {
		filled = await fillPatternInfo(locals.user!.id, patternId, normalizeInfoLanguage(body?.language));
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
	if (!filled) return json({ error: 'Pattern not found' }, { status: 404 });
	if (Object.keys(filled.updates).length === 0) return json({ error: 'empty' }, { status: 422 });
	return json(filled);
};
