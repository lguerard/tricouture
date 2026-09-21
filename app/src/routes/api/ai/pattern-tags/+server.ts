import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns } from '$lib/server/db/schema';
import { AiUnavailable } from '$lib/server/ai/ollama';
import { suggestTags, mergeTags } from '$lib/server/ai/tags';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => ({}));
	const patternId = String(body?.patternId ?? '');
	if (!patternId) return json({ error: 'patternId required' }, { status: 400 });

	const pat = (
		await db
			.select({ title: patterns.title, notes: patterns.notes, extractedText: patterns.extractedText, tags: patterns.tags })
			.from(patterns)
			.where(and(eq(patterns.id, patternId), eq(patterns.ownerId, locals.user!.id)))
			.limit(1)
	)[0];
	if (!pat) return json({ error: 'Pattern not found' }, { status: 404 });

	let suggested: string[];
	try {
		const context = [pat.title, pat.notes, pat.extractedText].filter(Boolean).join('\n\n');
		suggested = await suggestTags(context);
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Analysis failed' }, { status: 500 });
	}

	const tags = mergeTags(pat.tags ?? [], suggested);
	if (tags.length === (pat.tags ?? []).length) return json({ error: 'empty' }, { status: 422 });

	await db.update(patterns).set({ tags, updatedAt: new Date() }).where(eq(patterns.id, patternId));

	return json({ tags });
};
