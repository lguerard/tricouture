import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { passwordProblem, setPassword, verifyPassword } from '$lib/server/auth';
import { t } from '$lib/i18n';
import { aiConfigured, AiUnavailable } from '$lib/server/ai/ollama';
import { backfillEmbeddings, missingEmbeddings } from '$lib/server/embeddings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const ai = aiConfigured();
	return {
		account: locals.user!,
		// Items not yet indexed for "close in meaning" search.
		unindexed: ai ? await missingEmbeddings(locals.user!.id) : null
	};
};

export const actions: Actions = {
	changePassword: async (event) => {
		const { locale } = event.locals;
		const uid = event.locals.user!.id;
		const form = await event.request.formData();
		const current = String(form.get('currentPassword') ?? '');
		const next = String(form.get('newPassword') ?? '');
		const confirm = String(form.get('confirmPassword') ?? '');

		if (!current || !next || !confirm) {
			return fail(400, { error: t(locale, 'auth.error.allFieldsRequired') });
		}
		if (passwordProblem(next)) {
			return fail(400, { error: t(locale, 'auth.error.passwordTooShort') });
		}
		if (next !== confirm) {
			return fail(400, { error: t(locale, 'auth.error.passwordMismatch') });
		}

		const row = (
			await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, uid)).limit(1)
		)[0];
		if (!row || !(await verifyPassword(row.passwordHash, current))) {
			return fail(400, { error: t(locale, 'auth.error.currentPasswordWrong') });
		}
		if (next === current) {
			return fail(400, { error: t(locale, 'auth.error.passwordUnchanged') });
		}

		// Keeps this browser signed in, signs every other device out.
		await setPassword(uid, next, event.locals.sessionId);
		return { success: t(locale, 'account.passwordChanged') };
	},

	// Indexes a bounded batch per click (see backfillEmbeddings); the page
	// shows what is left, so a big library is a few clicks, never one
	// request long enough to time out.
	indexLibrary: async ({ locals }) => {
		const uid = locals.user!.id;
		if (!aiConfigured()) return fail(503, { indexError: t(locals.locale, 'account.search.unavailable') });
		try {
			const indexed = await backfillEmbeddings(uid);
			return { indexed };
		} catch (e) {
			if (e instanceof AiUnavailable) return fail(503, { indexError: t(locals.locale, 'account.search.unavailable') });
			throw e;
		}
	},

	// Whether adding a pattern (manually or via batch import) applies AI
	// suggestions automatically -- see the column's own comment in schema.ts.
	// Doesn't touch the explicit "Compléter avec l'IA" button on a pattern's
	// own page; that stays available either way.
	toggleAiAutoFill: async (event) => {
		const uid = event.locals.user!.id;
		const enabled = !event.locals.user!.aiAutoFillEnabled;
		await db.update(users).set({ aiAutoFillEnabled: enabled }).where(eq(users.id, uid));
		// Mutated directly so the load() that runs right after this action (in
		// the same request) reflects the new value instead of the one read at
		// the start of the request, before this update.
		event.locals.user!.aiAutoFillEnabled = enabled;
		return { ok: true };
	}
};
