import { json } from '@sveltejs/kit';
import { generate, AiUnavailable } from '$lib/server/ai/ollama';
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
			GENERATE_SYSTEM
		);
		return json({ result });
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Generation failed' }, { status: 500 });
	}
};
