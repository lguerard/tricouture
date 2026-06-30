import { and, or, eq, desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, users } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = locals.user!.id;
	const q = (url.searchParams.get('q') ?? '').trim();
	const craftFilter = url.searchParams.get('craft') ?? '';
	const scope = url.searchParams.get('scope') ?? ''; // '', 'mine', 'shared'

	// Visible: own patterns + those shared by others.
	const conds = [or(eq(patterns.ownerId, uid), eq(patterns.isShared, true))!];
	if (scope === 'mine') conds.push(eq(patterns.ownerId, uid));
	if (scope === 'shared') conds.push(and(eq(patterns.isShared, true), sql`${patterns.ownerId} <> ${uid}`)!);
	if (craftFilter === 'couture' || craftFilter === 'tricot' || craftFilter === 'crochet') {
		conds.push(eq(patterns.craft, craftFilter));
	}
	if (q) {
		// Full-text search (French dictionary) on title + extracted PDF text,
		// with ILIKE fallback for partial matches.
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
			tags: patterns.tags,
			ownerId: patterns.ownerId,
			isShared: patterns.isShared,
			ownerName: users.displayName
		})
		.from(patterns)
		.innerJoin(users, eq(patterns.ownerId, users.id))
		.where(and(...conds))
		.orderBy(desc(patterns.updatedAt))
		.limit(200);

	// Tag ownership for display (without exposing the raw ownerId to the client).
	const mapped = rows.map(({ ownerId, ...r }) => ({
		...r,
		mine: ownerId === uid
	}));

	return { rows: mapped, q, craftFilter, scope };
};
