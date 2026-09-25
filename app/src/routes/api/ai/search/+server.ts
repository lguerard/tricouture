import { json } from '@sveltejs/kit';
import { and, eq, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, yarns } from '$lib/server/db/schema';
import { embed, aiConfigured, AiUnavailable } from '$lib/server/ai/ollama';
import type { SearchHit } from '../../search/+server';
import type { RequestHandler } from './$types';

// Below this cosine similarity a match is more noise than "close in meaning".
const MIN_SIMILARITY = 0.5;
const LIMIT = 6;

// Semantic search ("un pull chaud pour l'hiver" finds a pattern titled
// "Aran"): the query is embedded and compared with the stored vectors of the
// user's patterns (own + shared) and yarns. Returns hits in the same shape as
// the global search so the palette can list them as-is.
export const POST: RequestHandler = async ({ request, locals }) => {
	const uid = locals.user!.id;
	if (!aiConfigured()) return json({ hits: [] }, { status: 503 });

	const body = await request.json().catch(() => ({}));
	const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : '';
	if (query.length < 3) return json({ hits: [] });

	let vec: number[];
	try {
		vec = await embed(query);
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ hits: [] }, { status: 503 });
		throw e;
	}
	const literal = `[${vec.join(',')}]`;
	const patternDistance = sql<number>`${patterns.embedding} <=> ${literal}::vector`;
	const yarnDistance = sql<number>`${yarns.embedding} <=> ${literal}::vector`;

	const [pats, yarnRows] = await Promise.all([
		db
			.select({
				id: patterns.id,
				title: patterns.title,
				designer: patterns.designer,
				garmentType: patterns.garmentType,
				coverPath: patterns.coverPath,
				distance: patternDistance
			})
			.from(patterns)
			.where(and(or(eq(patterns.ownerId, uid), eq(patterns.isShared, true)), isNotNull(patterns.embedding)))
			.orderBy(patternDistance)
			.limit(LIMIT),
		db
			.select({
				id: yarns.id,
				brand: yarns.brand,
				name: yarns.name,
				colorway: yarns.colorway,
				photoPath: yarns.photoPath,
				distance: yarnDistance
			})
			.from(yarns)
			.where(and(eq(yarns.ownerId, uid), isNotNull(yarns.embedding)))
			.orderBy(yarnDistance)
			.limit(LIMIT)
	]);

	const scored: (SearchHit & { similarity: number })[] = [
		...pats.map((p) => ({
			kind: 'pattern' as const,
			id: p.id,
			title: p.title,
			subtitle: [p.garmentType, p.designer].filter(Boolean).join(' · ') || undefined,
			href: `/patterns/${p.id}`,
			image: p.coverPath,
			similarity: 1 - p.distance
		})),
		...yarnRows.map((y) => ({
			kind: 'yarn' as const,
			id: y.id,
			title: [y.brand, y.name].filter(Boolean).join(' ') || y.colorway || '—',
			subtitle: y.colorway ?? undefined,
			href: `/stash?tab=yarn&q=${encodeURIComponent(y.name ?? y.brand ?? y.colorway ?? '')}`,
			image: y.photoPath,
			similarity: 1 - y.distance
		}))
	];

	const hits = scored
		.filter((h) => h.similarity >= MIN_SIMILARITY)
		.sort((a, b) => b.similarity - a.similarity)
		.slice(0, LIMIT)
		.map(({ similarity: _similarity, ...hit }) => hit);
	return json({ hits });
};
