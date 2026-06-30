import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns } from '$lib/server/db/schema';
import { generate, AiUnavailable } from '$lib/server/ai/ollama';
import { COPILOT_SYSTEM, copilotPrompt } from '$lib/server/ai/prompts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => ({}));
	const patternId = String(body?.patternId ?? '');
	const question = String(body?.question ?? '').trim();
	if (!patternId || !question) return json({ error: 'patternId and question required' }, { status: 400 });

	const pat = (
		await db
			.select({ title: patterns.title, extractedText: patterns.extractedText, notes: patterns.notes })
			.from(patterns)
			.where(and(eq(patterns.id, patternId), eq(patterns.ownerId, locals.user!.id)))
			.limit(1)
	)[0];
	if (!pat) return json({ error: 'Pattern not found' }, { status: 404 });

	const context = [pat.title, pat.notes, pat.extractedText].filter(Boolean).join('\n\n');
	try {
		const result = await generate(copilotPrompt(context, question), COPILOT_SYSTEM);
		return json({ result });
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Assistant failed' }, { status: 500 });
	}
};
