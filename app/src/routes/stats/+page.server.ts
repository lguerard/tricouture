import { computeStats } from '$lib/server/stats';
import { syncAchievements } from '$lib/server/achievements';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;
	const stats = await computeStats(uid);
	const ach = await syncAchievements(uid);
	return {
		stats,
		ach: {
			earnedPoints: ach.earnedPoints,
			totalPoints: ach.totalPoints,
			unlockedCount: ach.unlockedCount,
			totalCount: ach.totalCount
		}
	};
};
