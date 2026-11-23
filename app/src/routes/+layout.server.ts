import { aiConfigured } from '$lib/server/ai/ollama';
import { adventForLayout } from '$lib/server/advent';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// The advent link only shows for the people a calendar concerns (and for
	// administrators, who may prepare one); see $lib/server/advent.ts.
	const advent = locals.user
		? await adventForLayout(locals.user.id)
		: { recipient: false, owner: false, waiting: false, notify: null, waitingDoor: null };
	return { user: locals.user, locale: locals.locale, ai: aiConfigured(), advent };
};
