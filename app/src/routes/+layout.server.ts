import { aiConfigured } from '$lib/server/ai/ollama';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user, locale: locals.locale, ai: aiConfigured() };
};
