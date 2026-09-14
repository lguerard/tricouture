import { redirect, type Handle } from '@sveltejs/kit';
import { readToken, validateSession } from '$lib/server/auth';
import { isLocale, DEFAULT_LOCALE } from '$lib/i18n';

// Routes accessible without authentication.
const PUBLIC_PREFIXES = [
	'/login',
	'/register',
	'/forgot-password',
	'/reset-password',
	'/api/locale',
	// Machine-to-machine: the monthly model-watch cron job has no session
	// cookie to send. Not actually open — the route itself requires a
	// MODEL_WATCH_TOKEN bearer token, checked in its own handler.
	'/api/cron/model-watch'
];

// Public routes that make no sense once signed in, so signed-in visitors are
// bounced to the dashboard. /reset-password is deliberately absent: an
// administrator may well be signed in while testing a link they just handed out.
const SIGNED_OUT_ONLY = ['/login', '/register', '/forgot-password'];

function matches(prefixes: string[], pathname: string): boolean {
	return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isPublic(pathname: string): boolean {
	return matches(PUBLIC_PREFIXES, pathname);
}

export const handle: Handle = async ({ event, resolve }) => {
	const token = readToken(event);
	event.locals.user = token ? await validateSession(token) : null;
	event.locals.sessionId = token;

	const cookieLocale = event.cookies.get('locale');
	event.locals.locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

	const { pathname } = event.url;

	// API: return a 401 JSON response instead of redirecting.
	if (pathname.startsWith('/api/')) {
		if (!event.locals.user && !isPublic(pathname)) {
			return new Response(JSON.stringify({ error: 'unauthenticated' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		return resolve(event);
	}

	if (!event.locals.user && !isPublic(pathname)) {
		throw redirect(303, `/login?next=${encodeURIComponent(pathname)}`);
	}
	if (event.locals.user && matches(SIGNED_OUT_ONLY, pathname)) {
		throw redirect(303, '/');
	}

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
};
