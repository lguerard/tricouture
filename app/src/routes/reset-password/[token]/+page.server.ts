import { fail } from '@sveltejs/kit';
import {
	consumePasswordResetToken,
	findPasswordResetToken,
	passwordProblem
} from '$lib/server/auth';
import { t } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const target = await findPasswordResetToken(params.token);
	// The e-mail is shown so the person can tell they got the right link;
	// an invalid token reveals nothing at all.
	return { valid: !!target, email: target?.email ?? null };
};

export const actions: Actions = {
	default: async (event) => {
		const { locale } = event.locals;
		const form = await event.request.formData();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirmPassword') ?? '');

		if (!password || !confirm) {
			return fail(400, { error: t(locale, 'auth.error.allFieldsRequired') });
		}
		if (passwordProblem(password)) {
			return fail(400, { error: t(locale, 'auth.error.passwordTooShort') });
		}
		if (password !== confirm) {
			return fail(400, { error: t(locale, 'auth.error.passwordMismatch') });
		}

		const ok = await consumePasswordResetToken(event.params.token, password);
		if (!ok) return fail(400, { error: t(locale, 'reset.invalidToken') });

		// Deliberately not signed in here: the new password is proven by using it.
		return { done: true };
	}
};
