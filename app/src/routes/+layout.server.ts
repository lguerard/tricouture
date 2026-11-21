import { aiConfigured } from '$lib/server/ai/ollama';
import { adventRoles } from '$lib/server/advent';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// The advent link only shows for the people a calendar concerns (and for
	// administrators, who may prepare one).
	const advent = locals.user ? await adventRoles(locals.user.id) : { recipient: false, owner: false };
	return { user: locals.user, locale: locals.locale, ai: aiConfigured(), advent };
};
