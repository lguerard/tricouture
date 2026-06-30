import { json } from '@sveltejs/kit';
import { isLocale } from '$lib/i18n';
import type { RequestHandler } from './$types';

// Changes the UI language (1-year cookie). Accessible without authentication.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => ({}));
	const locale = body?.locale;
	if (!isLocale(locale)) return json({ error: 'invalid locale' }, { status: 400 });
	cookies.set('locale', locale, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		sameSite: 'lax',
		httpOnly: false
	});
	return json({ ok: true });
};
