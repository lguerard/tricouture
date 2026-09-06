import { error, fail } from '@sveltejs/kit';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createPasswordResetToken } from '$lib/server/auth';
import { t } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';

// Every action here is administrator-only; the layout hides the entry but the
// check has to live on the server too.
function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isAdmin) throw error(403, t(locals.locale, 'admin.forbidden'));
}

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const rows = await db
		.select({
			id: users.id,
			email: users.email,
			displayName: users.displayName,
			isAdmin: users.isAdmin,
			createdAt: users.createdAt
		})
		.from(users)
		.orderBy(asc(users.createdAt));
	return { users: rows };
};

export const actions: Actions = {
	resetLink: async (event) => {
		requireAdmin(event.locals);
		const { locale } = event.locals;
		const id = String((await event.request.formData()).get('id') ?? '');

		const target = (
			await db
				.select({ id: users.id, email: users.email })
				.from(users)
				.where(eq(users.id, id))
				.limit(1)
		)[0];
		if (!target) return fail(404, { error: t(locale, 'admin.userNotFound') });

		const token = await createPasswordResetToken(target.id);
		// Absolute URL so it can be pasted straight into a message. ORIGIN is the
		// public address the browser sees, which is what the person will open.
		const base = process.env.ORIGIN?.replace(/\/$/, '') ?? event.url.origin;
		return {
			resetFor: target.email,
			resetUrl: `${base}/reset-password/${token}`
		};
	},

	toggleAdmin: async (event) => {
		requireAdmin(event.locals);
		const { locale } = event.locals;
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const makeAdmin = form.get('makeAdmin') === 'true';

		if (!makeAdmin) {
			// Refuse to remove the last administrator: nobody could hand out reset
			// links any more, and the only way back in would be the CLI script.
			const admins =
				(await db
					.select({ n: sql<number>`count(*)::int` })
					.from(users)
					.where(eq(users.isAdmin, true)))[0]?.n ?? 0;
			if (admins <= 1) return fail(400, { error: t(locale, 'admin.lastAdmin') });
		}

		await db.update(users).set({ isAdmin: makeAdmin }).where(eq(users.id, id));
		return { ok: true };
	}
};
