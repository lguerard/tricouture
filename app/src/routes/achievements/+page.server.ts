import { syncAchievements } from '$lib/server/achievements';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const result = await syncAchievements(locals.user!.id);
	return result;
};
