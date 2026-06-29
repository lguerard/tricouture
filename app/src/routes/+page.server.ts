import { sql, eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, projects, yarns } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;

	const count = async (table: typeof patterns | typeof projects | typeof yarns) =>
		(await db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.ownerId, uid)))[0]
			?.n ?? 0;

	const [patternCount, yarnCount] = await Promise.all([count(patterns), count(yarns)]);

	const wip = (
		await db
			.select({ n: sql<number>`count(*)::int` })
			.from(projects)
			.where(and(eq(projects.ownerId, uid), eq(projects.status, 'monte')))
	)[0]?.n ?? 0;

	const recentProjects = await db
		.select({
			id: projects.id,
			title: projects.title,
			status: projects.status,
			progressPct: projects.progressPct,
			deadline: projects.deadline
		})
		.from(projects)
		.where(eq(projects.ownerId, uid))
		.orderBy(sql`${projects.updatedAt} desc`)
		.limit(6);

	return { patternCount, yarnCount, wip, recentProjects };
};
