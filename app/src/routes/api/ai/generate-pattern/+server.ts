import { json } from '@sveltejs/kit';
import { generate, AiUnavailable, LONG_GENERATE_TIMEOUT_MS } from '$lib/server/ai/ollama';
import { GENERATE_SYSTEM, generatePrompt } from '$lib/server/ai/prompts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const description = String(body?.description ?? '').trim();
	const craft = String(body?.craft ?? 'tricot');
	if (!description) return json({ error: 'Description required' }, { status: 400 });
	try {
		const result = await generate(
			generatePrompt({ description, craft, gauge: body?.gauge, size: body?.size }),
			GENERATE_SYSTEM,
			undefined,
			// A whole pattern is the longest output the app asks for, hence the
			// larger timeout. Reasoning stays off (generate()'s default): it
			// would roughly double the wait for a draft the person reviews and
			// edits anyway, and the stitch arithmetic is meant to be checked.
			{ timeoutMs: LONG_GENERATE_TIMEOUT_MS }
		);
		return json({ result });
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Generation failed' }, { status: 500 });
	}
};
