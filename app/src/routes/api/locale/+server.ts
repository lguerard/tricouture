import { json } from '@sveltejs/kit';
import { isLocale } from '$lib/i18n';
import type { RequestHandler } from './$types';

// Change la langue de l'interface (cookie d'1 an). Accessible sans authentification.
export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => ({}));
	const locale = body?.locale;
	if (!isLocale(locale)) return json({ error: 'locale invalide' }, { status: 400 });
	cookies.set('locale', locale, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		sameSite: 'lax',
		httpOnly: false
	});
	return json({ ok: true });
};
