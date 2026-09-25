import { and, or, eq, desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternFiles, users, type Craft } from '$lib/server/db/schema';
import { getAllVisibleTags } from '$lib/server/patternTags';
import { getTagColorOverrides } from '$lib/server/tagColorOverrides';
import { assignTagColors } from '$lib/tagColor';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = locals.user!.id;
	const q = (url.searchParams.get('q') ?? '').trim();
	const rawCraft = url.searchParams.get('craft') ?? '';
	const craftFilter: Craft | '' = rawCraft === 'couture' || rawCraft === 'tricot' || rawCraft === 'crochet' ? rawCraft : '';
	const scope = url.searchParams.get('scope') ?? ''; // '', 'mine', 'shared'
	const tagFilter = (url.searchParams.get('tag') ?? '').trim();

	// Visible: own patterns + those shared by others.
	const conds = [or(eq(patterns.ownerId, uid), eq(patterns.isShared, true))!];
	if (scope === 'mine') conds.push(eq(patterns.ownerId, uid));
	if (scope === 'shared') conds.push(and(eq(patterns.isShared, true), sql`${patterns.ownerId} <> ${uid}`)!);
	if (craftFilter) conds.push(eq(patterns.craft, craftFilter));
	if (tagFilter) {
		// jsonb containment: patterns.tags is a jsonb string[] column.
		conds.push(sql`${patterns.tags} @> ${JSON.stringify([tagFilter])}::jsonb`);
	}
	if (q) {
		// Full-text search (French dictionary) on title + extracted PDF text,
		// with an ILIKE fallback for partial title matches, plus a match against
		// any tag (substring, case-insensitive) so typing a tag in the search box
		// finds it too -- not just clicking it on a pattern.
		conds.push(
			sql`(
				to_tsvector('french', coalesce(${patterns.title}, '') || ' ' || coalesce(${patterns.extractedText}, ''))
					@@ plainto_tsquery('french', ${q})
				or ${patterns.title} ilike ${'%' + q + '%'}
				or exists (
					select 1 from jsonb_array_elements_text(${patterns.tags}) as tag
					where tag ilike ${'%' + q + '%'}
				)
			)`
		);
	}

	// Distinct tags across everything visible to the user, for the filter dropdown --
	// independent of the current search/craft/scope/tag filters so the list of
	// choices doesn't shrink as filters are applied. Also the basis for
	// collision-free tag colors (assignTagColors): every tag pill on this page
	// comes from one of these patterns, so this set always covers them.
	const allTags = await getAllVisibleTags(uid);
	const tagColors = assignTagColors(allTags, await getTagColorOverrides(uid));

	const rows = await db
		.select({
			id: patterns.id,
			title: patterns.title,
			craft: patterns.craft,
			garmentType: patterns.garmentType,
			designer: patterns.designer,
			difficulty: patterns.difficulty,
			tags: patterns.tags,
			coverPath: patterns.coverPath,
			ownerId: patterns.ownerId,
			isShared: patterns.isShared,
			source: patterns.source,
			// A pattern is either a file or a link (sometimes both). EXISTS rather
			// than a join: one row per pattern, whatever the number of files.
			hasFile: sql<boolean>`exists (
				select 1 from ${patternFiles} where ${patternFiles.patternId} = ${patterns.id}
			)`,
			ownerName: users.displayName
		})
		.from(patterns)
		.innerJoin(users, eq(patterns.ownerId, users.id))
		.where(and(...conds))
		.orderBy(desc(patterns.updatedAt))
		.limit(200);

	// Tag ownership for display (without exposing the raw ownerId to the client).
	const mapped = rows.map(({ ownerId, source, ...r }) => ({
		...r,
		mine: ownerId === uid,
		// Only whether it is a link, not the link itself: the list does not
		// display it, and the fiche is one click away.
		hasLink: /^https?:\/\//i.test((source ?? '').trim())
	}));

	return { rows: mapped, q, craftFilter, scope, tagFilter, allTags, tagColors };
};
