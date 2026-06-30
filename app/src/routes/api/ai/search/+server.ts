import { json, error } from '@sveltejs/kit';
import { sql, and, or, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, yarns } from '$lib/server/db/schema';
import { embed, aiConfigured, AiUnavailable } from '$lib/server/ai/ollama';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const uid = locals.user?.id;
	if (!uid) error(401, 'Unauthenticated');
	if (!aiConfigured()) error(503, 'AI service unavailable');

	const body = await request.json().catch(() => ({}));
	const query: string = typeof body.query === 'string' ? body.query.trim() : '';
	const kind: string = typeof body.kind === 'string' ? body.kind : 'all';
	if (!query) error(400, 'query required');

	let vec: number[];
	try {
		vec = await embed(query);
	} catch (e) {
		if (e instanceof AiUnavailable) error(503, 'AI service unavailable');
		throw e;
	}

	// Drizzle sql tag for pgvector cosine distance (<=>).
	const vecLiteral = `[${vec.join(',')}]`;

	const results: { kind: string; id: string; title: string; similarity: number }[] = [];

	if (kind === 'patterns' || kind === 'all') {
		const rows = await db
			.select({
				id: patterns.id,
				title: patterns.title,
				craft: patterns.craft,
				distance: sql<number>`embedding <=> ${vecLiteral}::vector`
			})
			.from(patterns)
			.where(
				and(
					or(eq(patterns.ownerId, uid), eq(patterns.isShared, true))!,
					sql`embedding IS NOT NULL`
				)
			)
			.orderBy(sql`embedding <=> ${vecLiteral}::vector`)
			.limit(10);

		for (const r of rows) {
			results.push({ kind: 'pattern', id: r.id, title: `${r.title} (${r.craft})`, similarity: 1 - r.distance });
		}
	}

	if (kind === 'yarns' || kind === 'all') {
		const rows = await db
			.select({
				id: yarns.id,
				brand: yarns.brand,
				name: yarns.name,
				colorway: yarns.colorway,
				distance: sql<number>`embedding <=> ${vecLiteral}::vector`
			})
			.from(yarns)
			.where(and(eq(yarns.ownerId, uid), sql`embedding IS NOT NULL`))
			.orderBy(sql`embedding <=> ${vecLiteral}::vector`)
			.limit(10);

		for (const r of rows) {
			const title = [r.brand, r.name, r.colorway].filter(Boolean).join(' — ');
			results.push({ kind: 'yarn', id: r.id, title, similarity: 1 - r.distance });
		}
	}

	results.sort((a, b) => b.similarity - a.similarity);

	return json({ results: results.slice(0, 15) });
};
