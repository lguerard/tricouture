import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, projectPhotos, projects } from '$lib/server/db/schema';
import { visibleTo } from '$lib/server/access';
import type { PageServerLoad } from './$types';

// The gallery is every finished project the user can see (theirs, plus ones
// shared with them), illustrated by its most recent photo -- or, failing
// that, its pattern's cover -- so finishing a project is all it takes to
// show up here.
export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;
	const latestPhoto = sql<string | null>`(
		select ${projectPhotos.storedPath} from ${projectPhotos}
		where ${projectPhotos.projectId} = ${projects.id}
		order by ${projectPhotos.createdAt} desc limit 1
	)`;
	const items = await db
		.select({
			id: projects.id,
			title: projects.title,
			finishedAt: projects.finishedAt,
			notes: projects.notes,
			craft: patterns.craft,
			patternTitle: patterns.title,
			photoPath: latestPhoto,
			coverPath: patterns.coverPath,
			patternOwnerId: patterns.ownerId,
			patternShared: patterns.isShared,
			photoCount: sql<number>`(select count(*)::int from ${projectPhotos} where ${projectPhotos.projectId} = ${projects.id})`
		})
		.from(projects)
		.leftJoin(patterns, eq(projects.patternId, patterns.id))
		.where(and(visibleTo(uid, 'project', projects.ownerId, projects.id), eq(projects.status, 'fini')))
		.orderBy(desc(sql`coalesce(${projects.finishedAt}, ${projects.updatedAt})`));
	// A pattern cover is only a usable fallback when /media will serve it to
	// this viewer: their own pattern, or a shared one.
	return {
		items: items.map(({ patternOwnerId, patternShared, coverPath, ...it }) => ({
			...it,
			image: it.photoPath ?? (coverPath && (patternOwnerId === uid || patternShared) ? coverPath : null)
		}))
	};
};
