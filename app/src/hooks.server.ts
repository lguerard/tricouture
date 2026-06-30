import { redirect, type Handle } from '@sveltejs/kit';
import { readToken, validateSession } from '$lib/server/auth';
import { isLocale, DEFAULT_LOCALE } from '$lib/i18n';

// Routes accessible without authentication.
const PUBLIC_PREFIXES = ['/login', '/register', '/api/locale'];

function isPublic(pathname: string): boolean {
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
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
	if (event.locals.user && isPublic(pathname)) {
		throw redirect(303, '/');
	}

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
};
