import { json } from '@sveltejs/kit';
import { fillMissingCover } from '$lib/server/patternCover';
import type { RequestHandler } from './$types';

// One pattern per request, like import-one: the list's "find missing covers"
// button calls this for each of the user's patterns without a cover, so a
// slow web search never holds one long request open.
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!/^[0-9a-f-]{36}$/i.test(params.id)) return json({ coverPath: null }, { status: 404 });
	return json({ coverPath: await fillMissingCover(locals.user!.id, params.id) });
};
