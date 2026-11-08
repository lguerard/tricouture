// Pre-fill a new pattern from its link.
//
// A pattern usually arrives as a PDF or as a link (Ravelry, a designer's shop,
// a blog). When it is a link, retyping the title and the designer by hand is
// busywork: this reads them from the page itself.
//
// Fetching a URL the person typed means the SERVER makes a request on their
// behalf, and this server sits on the same LAN as Immich, Frigate, Portainer
// and the router's admin page. `http://192.168.1.1/` would otherwise turn this
// endpoint into a probe of the private network from a browser that cannot
// reach it. Hence: http(s) only, every hop resolved and checked against private
// ranges, redirects followed by hand, response truncated.
import { json } from '@sveltejs/kit';
import { readPatternPage } from '$lib/server/services/patterns';
import type { RequestHandler } from './$types';

const STATUS = { 'unsupported-url': 400, unreachable: 502, 'not-html': 415 } as const;

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const page = await readPatternPage(String(body?.url ?? ''));
	if (!page.ok) return json({ error: page.error }, { status: STATUS[page.error] });
	return json({ title: page.title, designer: page.designer, source: page.source });
};
