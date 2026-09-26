import { and, eq, sql } from 'drizzle-orm';
import { db } from './db';
import {
	projects,
	patterns,
	yarns,
	fabrics,
	notions,
	tools,
	storageBins,
	recipients,
	goals,
	projectYarns,
	achievements
} from './db/schema';
import { TIER_POINTS, type Tier } from '$lib/achievements';

/* ------------------------------------------------------------------ */
/* Metrics (all derived from the database)                            */
/* ------------------------------------------------------------------ */

export type Metrics = Record<string, number>;

export async function computeMetrics(uid: string): Promise<Metrics> {
	const year = new Date().getFullYear();
	const yearStart = new Date(`${year}-01-01`);

	const proj =
		(
			await db
				.select({
					finishedTotal: sql<number>`coalesce(sum(case when ${projects.status} = 'fini' then 1 else 0 end), 0)::int`,
					finishedYear: sql<number>`coalesce(sum(case when ${projects.status} = 'fini' and ${projects.finishedAt} >= ${yearStart.toISOString()}::timestamptz then 1 else 0 end), 0)::int`,
					wip: sql<number>`coalesce(sum(case when ${projects.status} = 'monte' then 1 else 0 end), 0)::int`,
					total: sql<number>`count(*)::int`,
					minutes: sql<number>`coalesce(sum(case when ${projects.status} = 'fini' then ${projects.timeSpentMinutes} else 0 end), 0)::int`,
					savings: sql<number>`coalesce(sum(case when ${projects.status} = 'fini' then coalesce(${projects.retailPriceCents}, 0) - ${projects.costCents} else 0 end), 0)::int`,
					rows: sql<number>`coalesce(sum(${projects.currentRow}), 0)::int`,
					deadlinesMet: sql<number>`coalesce(sum(case when ${projects.status} = 'fini' and ${projects.deadline} is not null and ${projects.finishedAt}::date <= ${projects.deadline} then 1 else 0 end), 0)::int`
				})
				.from(projects)
				.where(eq(projects.ownerId, uid))
		)[0] ?? {};

	const meters =
		(
			await db
				.select({
					m: sql<number>`coalesce(sum(${projectYarns.skeinsUsed} * coalesce(${yarns.yardsPerSkein}, 0)), 0)::int`
				})
				.from(projectYarns)
				.innerJoin(projects, eq(projectYarns.projectId, projects.id))
				.leftJoin(yarns, eq(projectYarns.yarnId, yarns.id))
				.where(and(eq(projects.ownerId, uid), eq(projects.status, 'fini')))
		)[0]?.m ?? 0;

	const craftsUsed =
		(
			await db
				.select({ n: sql<number>`count(distinct ${patterns.craft})::int` })
				.from(patterns)
				.where(eq(patterns.ownerId, uid))
		)[0]?.n ?? 0;

	const goalsDone =
		(
			await db
				.select({ n: sql<number>`coalesce(sum(case when ${goals.currentValue} >= ${goals.targetValue} then 1 else 0 end), 0)::int` })
				.from(goals)
				.where(eq(goals.ownerId, uid))
		)[0]?.n ?? 0;

	const n = sql<number>`count(*)::int`;
	const [patternCount, yarnCount, fabricCount, notionCount, toolCount, binCount, recipientCount] =
		await Promise.all([
			db.select({ n }).from(patterns).where(eq(patterns.ownerId, uid)),
			db.select({ n }).from(yarns).where(eq(yarns.ownerId, uid)),
			db.select({ n }).from(fabrics).where(eq(fabrics.ownerId, uid)),
			db.select({ n }).from(notions).where(eq(notions.ownerId, uid)),
			db.select({ n }).from(tools).where(eq(tools.ownerId, uid)),
			db.select({ n }).from(storageBins).where(eq(storageBins.ownerId, uid)),
			db.select({ n }).from(recipients).where(eq(recipients.ownerId, uid))
		]);

	return {
		finished_total: proj.finishedTotal ?? 0,
		finished_year: proj.finishedYear ?? 0,
		wip: proj.wip ?? 0,
		projects_total: proj.total ?? 0,
		hours_total: Math.floor((proj.minutes ?? 0) / 60),
		savings_total: Math.round((proj.savings ?? 0) / 100),
		rows_total: proj.rows ?? 0,
		deadlines_met: proj.deadlinesMet ?? 0,
		meters_total: meters,
		crafts_used: craftsUsed,
		goals_completed: goalsDone,
		patterns: patternCount[0]?.n ?? 0,
		yarns: yarnCount[0]?.n ?? 0,
		fabrics: fabricCount[0]?.n ?? 0,
		notions: notionCount[0]?.n ?? 0,
		tools: toolCount[0]?.n ?? 0,
		bins: binCount[0]?.n ?? 0,
		recipients: recipientCount[0]?.n ?? 0
	};
}

/* ------------------------------------------------------------------ */
/* Achievement catalogue                                              */
/* ------------------------------------------------------------------ */

// label/description/category are resolved from the i18n dict client-side via
// `achv.<code>.label` / `achv.<code>.description` / `achv.cat.<category>` keys —
// this catalogue only holds locale-invariant data.
export interface AchievementDef {
	code: string;
	icon: string;
	tier: Tier;
	metric: string; // key in Metrics
	target: number;
	category: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
	// Projects
	{ code: 'premiere_maille', icon: '🎉', tier: 'bronze', metric: 'finished_total', target: 1, category: 'projects' },
	{ code: 'artisan', icon: '🧵', tier: 'argent', metric: 'finished_total', target: 5, category: 'projects' },
	{ code: 'maitre_artisan', icon: '🏆', tier: 'or', metric: 'finished_total', target: 25, category: 'projects' },
	{ code: 'legende', icon: '👑', tier: 'platine', metric: 'finished_total', target: 100, category: 'projects' },
	{ code: 'annee_productive', icon: '📆', tier: 'or', metric: 'finished_year', target: 12, category: 'projects' },

	// Patterns
	{ code: 'biblio_1', icon: '📄', tier: 'bronze', metric: 'patterns', target: 1, category: 'patterns' },
	{ code: 'biblio_25', icon: '📚', tier: 'argent', metric: 'patterns', target: 25, category: 'patterns' },
	{ code: 'biblio_100', icon: '🗄️', tier: 'or', metric: 'patterns', target: 100, category: 'patterns' },
	{ code: 'touche_a_tout', icon: '🌈', tier: 'or', metric: 'crafts_used', target: 3, category: 'patterns' },

	// Stash
	{ code: 'premiere_pelote', icon: '🧶', tier: 'bronze', metric: 'yarns', target: 1, category: 'stash' },
	{ code: 'collection', icon: '🧶', tier: 'argent', metric: 'yarns', target: 25, category: 'stash' },
	{ code: 'mercerie_ambulante', icon: '🏬', tier: 'or', metric: 'yarns', target: 50, category: 'stash' },
	{ code: 'boite_a_boutons', icon: '🔘', tier: 'bronze', metric: 'notions', target: 10, category: 'stash' },
	{ code: 'quincaillerie', icon: '🪡', tier: 'bronze', metric: 'tools', target: 10, category: 'stash' },

	// Time & meters
	{ code: 'premiers_metres', icon: '📏', tier: 'bronze', metric: 'meters_total', target: 100, category: 'endurance' },
	{ code: 'kilometre', icon: '🛣️', tier: 'argent', metric: 'meters_total', target: 1000, category: 'endurance' },
	{ code: 'marathonien', icon: '⏱️', tier: 'argent', metric: 'hours_total', target: 50, category: 'endurance' },
	{ code: 'centurion', icon: '🦾', tier: 'or', metric: 'hours_total', target: 100, category: 'endurance' },
	{ code: 'compteur_fou', icon: '🔢', tier: 'argent', metric: 'rows_total', target: 1000, category: 'endurance' },

	// Savings
	{ code: 'econome', icon: '💰', tier: 'bronze', metric: 'savings_total', target: 50, category: 'savings' },
	{ code: 'radin_malin', icon: '🤑', tier: 'argent', metric: 'savings_total', target: 200, category: 'savings' },

	// Punctuality / gifts
	{ code: 'ponctuel', icon: '⏰', tier: 'bronze', metric: 'deadlines_met', target: 1, category: 'gifts' },
	{ code: 'jamais_en_retard', icon: '🎯', tier: 'or', metric: 'deadlines_met', target: 10, category: 'gifts' },
	{ code: 'generosite', icon: '🎁', tier: 'bronze', metric: 'recipients', target: 3, category: 'gifts' },

	// Organization & goals
	{ code: 'rangement', icon: '📦', tier: 'bronze', metric: 'bins', target: 3, category: 'organization' },
	{ code: 'objectif_atteint', icon: '✅', tier: 'bronze', metric: 'goals_completed', target: 1, category: 'organization' },
	{ code: 'ambitieux', icon: '🚀', tier: 'argent', metric: 'goals_completed', target: 5, category: 'organization' }
];

export const TOTAL_POINTS = ACHIEVEMENTS.reduce((s, a) => s + TIER_POINTS[a.tier], 0);

export interface AchievementState extends AchievementDef {
	points: number;
	current: number;
	unlocked: boolean;
	unlockedAt: Date | null;
}

export interface AchievementsResult {
	list: AchievementState[];
	newlyUnlocked: AchievementState[];
	earnedPoints: number;
	totalPoints: number;
	unlockedCount: number;
	totalCount: number;
}

// Computes state, unlocks and persists newly reached achievements.
export async function syncAchievements(uid: string): Promise<AchievementsResult> {
	const metrics = await computeMetrics(uid);

	const owned = new Map(
		(await db.select({ code: achievements.code, at: achievements.unlockedAt }).from(achievements).where(eq(achievements.ownerId, uid))).map(
			(r) => [r.code, r.at]
		)
	);

	const toUnlock = ACHIEVEMENTS.filter((a) => (metrics[a.metric] ?? 0) >= a.target && !owned.has(a.code));
	if (toUnlock.length) {
		await db
			.insert(achievements)
			.values(toUnlock.map((a) => ({ ownerId: uid, code: a.code })))
			.onConflictDoNothing();
		const now = new Date();
		toUnlock.forEach((a) => owned.set(a.code, now));
	}

	const list: AchievementState[] = ACHIEVEMENTS.map((a) => ({
		...a,
		points: TIER_POINTS[a.tier],
		current: Math.min(metrics[a.metric] ?? 0, a.target),
		unlocked: owned.has(a.code),
		unlockedAt: owned.get(a.code) ?? null
	}));

	const newlyUnlocked = list.filter((a) => toUnlock.some((t) => t.code === a.code));
	const earnedPoints = list.filter((a) => a.unlocked).reduce((s, a) => s + a.points, 0);

	return {
		list,
		newlyUnlocked,
		earnedPoints,
		totalPoints: TOTAL_POINTS,
		unlockedCount: list.filter((a) => a.unlocked).length,
		totalCount: list.length
	};
}
