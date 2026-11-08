import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns } from '$lib/server/db/schema';
import { AiUnavailable } from '$lib/server/ai/ollama';
import { detectPieces } from '$lib/server/services/patterns';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => ({}));
	const patternId = String(body?.patternId ?? '');
	if (!patternId) return json({ error: 'patternId required' }, { status: 400 });

	const pat = (
		await db
			.select({ id: patterns.id, title: patterns.title, notes: patterns.notes, extractedText: patterns.extractedText, craft: patterns.craft })
			.from(patterns)
			.where(and(eq(patterns.id, patternId), eq(patterns.ownerId, locals.user!.id)))
			.limit(1)
	)[0];
	if (!pat) return json({ error: 'Pattern not found' }, { status: 404 });

	try {
		const pieces = await detectPieces(pat);
		if (typeof pieces === 'string') return json({ error: pieces }, { status: 422 });
		return json({ pieces });
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
};
