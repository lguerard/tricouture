import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createSession, hashPassword, setSessionCookie } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const displayName = String(form.get('displayName') ?? '').trim();
		const password = String(form.get('password') ?? '');

		if (!email || !displayName || !password) {
			return fail(400, { email, displayName, error: 'Tous les champs sont requis.' });
		}
		if (password.length < 8) {
			return fail(400, { email, displayName, error: 'Mot de passe : 8 caractères minimum.' });
		}

		const existing = (
			await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
		)[0];
		if (existing) {
			return fail(400, { email, displayName, error: 'Cet email est déjà utilisé.' });
		}

		// Le tout premier compte créé est administrateur.
		const count = (await db.select({ n: sql<number>`count(*)::int` }).from(users))[0]?.n ?? 0;

		const passwordHash = await hashPassword(password);
		const inserted = (
			await db
				.insert(users)
				.values({ email, displayName, passwordHash, isAdmin: count === 0 })
				.returning({ id: users.id })
		)[0];

		const token = await createSession(inserted.id);
		setSessionCookie(event, token);
		throw redirect(303, '/');
	}
};
