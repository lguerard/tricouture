import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createSession, setSessionCookie, verifyPassword } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');
		const next = String(form.get('next') ?? '/') || '/';

		if (!email || !password) {
			return fail(400, { email, error: 'Email et mot de passe requis.' });
		}

		const row = (
			await db.select().from(users).where(eq(users.email, email)).limit(1)
		)[0];
		if (!row || !(await verifyPassword(row.passwordHash, password))) {
			return fail(400, { email, error: 'Identifiants incorrects.' });
		}

		const token = await createSession(row.id);
		setSessionCookie(event, token);
		throw redirect(303, next.startsWith('/') ? next : '/');
	}
};
