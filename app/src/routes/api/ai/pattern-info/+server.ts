import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns } from '$lib/server/db/schema';
import { AiUnavailable } from '$lib/server/ai/ollama';
import { suggestPatternInfo, mergePatternInfo, normalizeInfoLanguage } from '$lib/server/ai/patternInfo';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => ({}));
	const patternId = String(body?.patternId ?? '');
	if (!patternId) return json({ error: 'patternId required' }, { status: 400 });
	const language = normalizeInfoLanguage(body?.language);

	const pat = (
		await db
			.select({
				title: patterns.title,
				notes: patterns.notes,
				extractedText: patterns.extractedText,
				tags: patterns.tags,
				garmentType: patterns.garmentType,
				designer: patterns.designer,
				language: patterns.language,
				difficulty: patterns.difficulty,
				sizes: patterns.sizes,
				gaugeStitches: patterns.gaugeStitches,
				gaugeRows: patterns.gaugeRows,
				yardageRequired: patterns.yardageRequired
			})
			.from(patterns)
			.where(and(eq(patterns.id, patternId), eq(patterns.ownerId, locals.user!.id)))
			.limit(1)
	)[0];
	if (!pat) return json({ error: 'Pattern not found' }, { status: 404 });

	let suggested;
	try {
		const context = [pat.title, pat.notes, pat.extractedText].filter(Boolean).join('\n\n');
		suggested = await suggestPatternInfo(context, language);
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Analysis failed' }, { status: 500 });
	}

	const { tags, updates } = mergePatternInfo(
		{
			tags: pat.tags ?? [],
			garmentType: pat.garmentType,
			designer: pat.designer,
			language: pat.language,
			difficulty: pat.difficulty,
			sizes: pat.sizes,
			gaugeStitches: pat.gaugeStitches,
			gaugeRows: pat.gaugeRows,
			yardageRequired: pat.yardageRequired
		},
		suggested
	);
	if (Object.keys(updates).length === 0) return json({ error: 'empty' }, { status: 422 });

	await db
		.update(patterns)
		.set({ ...updates, updatedAt: new Date() })
		.where(eq(patterns.id, patternId));

	return json({ tags, updates });
};
