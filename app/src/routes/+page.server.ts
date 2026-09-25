import { sql, eq, and, ne, isNotNull, desc, asc, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, projects, yarns } from '$lib/server/db/schema';
import { visibleTo } from '$lib/server/access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;

	const count = async (table: typeof patterns | typeof projects | typeof yarns) =>
		(await db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.ownerId, uid)))[0]
			?.n ?? 0;

	const projectCols = {
		id: projects.id,
		title: projects.title,
		status: projects.status,
		progressPct: projects.progressPct,
		deadline: projects.deadline,
		currentRow: projects.currentRow,
		totalRows: projects.totalRows,
		coverPath: patterns.coverPath
	};

	const [patternCount, yarnCount, wipRows, resumeRows, recentProjects, deadlines, recentPatterns] = await Promise.all([
		count(patterns),
		count(yarns),
		db
			.select({ n: sql<number>`count(*)::int` })
			.from(projects)
			.where(and(eq(projects.ownerId, uid), eq(projects.status, 'monte'))),
		// "Pick up where you left off": last touched in-progress project the
		// person can edit (so the one-tap +1 row is allowed).
		db
			.select(projectCols)
			.from(projects)
			.leftJoin(patterns, eq(projects.patternId, patterns.id))
			.where(and(visibleTo(uid, 'project', projects.ownerId, projects.id, true), eq(projects.status, 'monte')))
			.orderBy(desc(projects.updatedAt))
			.limit(1),
		db
			.select(projectCols)
			.from(projects)
			.leftJoin(patterns, eq(projects.patternId, patterns.id))
			.where(visibleTo(uid, 'project', projects.ownerId, projects.id))
			.orderBy(desc(projects.updatedAt))
			.limit(7),
		// Unfinished projects due within 30 days, or already overdue.
		db
			.select(projectCols)
			.from(projects)
			.leftJoin(patterns, eq(projects.patternId, patterns.id))
			.where(
				and(
					visibleTo(uid, 'project', projects.ownerId, projects.id),
					ne(projects.status, 'fini'),
					isNotNull(projects.deadline),
					sql`${projects.deadline} <= current_date + 30`
				)
			)
			.orderBy(asc(projects.deadline))
			.limit(5),
		db
			.select({ id: patterns.id, title: patterns.title, coverPath: patterns.coverPath, craft: patterns.craft })
			.from(patterns)
			.where(or(visibleTo(uid, 'pattern', patterns.ownerId, patterns.id), eq(patterns.isShared, true)))
			.orderBy(desc(patterns.createdAt))
			.limit(6)
	]);

	const resume = resumeRows[0] ?? null;
	return {
		patternCount,
		yarnCount,
		wip: wipRows[0]?.n ?? 0,
		resume,
		recentProjects: recentProjects.filter((p) => p.id !== resume?.id).slice(0, 6),
		deadlines,
		recentPatterns
	};
};
