import { and, eq, sql, gte } from 'drizzle-orm';
import { db } from './db';
import { projects, yarns, patterns, projectYarns } from './db/schema';

export interface UserStats {
	year: number;
	finishedThisYear: number;
	finishedLifetime: number;
	metersThisYear: number;
	hoursThisYear: number;
	savingsThisYearEur: number;
	patternCount: number;
	yarnCount: number;
	activeWip: number;
}

export async function computeStats(uid: string): Promise<UserStats> {
	const year = new Date().getFullYear();
	const yearStart = `${year}-01-01`;

	const [finYear, finLife, wip] = await Promise.all([
		db
			.select({ n: sql<number>`count(*)::int` })
			.from(projects)
			.where(and(eq(projects.ownerId, uid), eq(projects.status, 'fini'), gte(projects.finishedAt, new Date(yearStart)))),
		db
			.select({ n: sql<number>`count(*)::int` })
			.from(projects)
			.where(and(eq(projects.ownerId, uid), eq(projects.status, 'fini'))),
		db
			.select({ n: sql<number>`count(*)::int` })
			.from(projects)
			.where(and(eq(projects.ownerId, uid), eq(projects.status, 'monte')))
	]);

	// Meters knitted this year = sum(skeins used × meters per skein) for projects finished this year.
	const meters =
		(
			await db
				.select({
					m: sql<number>`coalesce(sum(${projectYarns.skeinsUsed} * coalesce(${yarns.yardsPerSkein}, 0)), 0)::int`
				})
				.from(projectYarns)
				.innerJoin(projects, eq(projectYarns.projectId, projects.id))
				.leftJoin(yarns, eq(projectYarns.yarnId, yarns.id))
				.where(and(eq(projects.ownerId, uid), eq(projects.status, 'fini'), gte(projects.finishedAt, new Date(yearStart))))
		)[0]?.m ?? 0;

	const agg =
		(
			await db
				.select({
					minutes: sql<number>`coalesce(sum(${projects.timeSpentMinutes}), 0)::int`,
					savings: sql<number>`coalesce(sum(coalesce(${projects.retailPriceCents}, 0) - ${projects.costCents}), 0)::int`
				})
				.from(projects)
				.where(and(eq(projects.ownerId, uid), eq(projects.status, 'fini'), gte(projects.finishedAt, new Date(yearStart))))
		)[0] ?? { minutes: 0, savings: 0 };

	const [pc, yc] = await Promise.all([
		db.select({ n: sql<number>`count(*)::int` }).from(patterns).where(eq(patterns.ownerId, uid)),
		db.select({ n: sql<number>`count(*)::int` }).from(yarns).where(eq(yarns.ownerId, uid))
	]);

	return {
		year,
		finishedThisYear: finYear[0]?.n ?? 0,
		finishedLifetime: finLife[0]?.n ?? 0,
		metersThisYear: meters,
		hoursThisYear: Math.round((agg.minutes / 60) * 10) / 10,
		savingsThisYearEur: Math.round(agg.savings / 100),
		patternCount: pc[0]?.n ?? 0,
		yarnCount: yc[0]?.n ?? 0,
		activeWip: wip[0]?.n ?? 0
	};
}

// Achievements/badges are managed by $lib/server/achievements.ts (full system
// with tiers, points and progress tracking).
