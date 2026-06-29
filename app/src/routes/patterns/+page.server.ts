import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = locals.user!.id;
	const q = (url.searchParams.get('q') ?? '').trim();
	const craftFilter = url.searchParams.get('craft') ?? '';

	const conds = [eq(patterns.ownerId, uid)];
	if (craftFilter === 'couture' || craftFilter === 'tricot' || craftFilter === 'crochet') {
		conds.push(eq(patterns.craft, craftFilter));
	}
	if (q) {
		// Recherche plein-texte (français) sur titre + texte extrait des PDF,
		// avec repli ILIKE pour les correspondances partielles.
		conds.push(
			sql`(
				to_tsvector('french', coalesce(${patterns.title}, '') || ' ' || coalesce(${patterns.extractedText}, ''))
					@@ plainto_tsquery('french', ${q})
				or ${patterns.title} ilike ${'%' + q + '%'}
			)`
		);
	}

	const rows = await db
		.select({
			id: patterns.id,
			title: patterns.title,
			craft: patterns.craft,
			garmentType: patterns.garmentType,
			designer: patterns.designer,
			difficulty: patterns.difficulty,
			tags: patterns.tags
		})
		.from(patterns)
		.where(and(...conds))
		.orderBy(desc(patterns.updatedAt))
		.limit(200);

	return { rows, q, craftFilter };
};
