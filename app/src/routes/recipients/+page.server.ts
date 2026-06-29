import { fail } from '@sveltejs/kit';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { recipients } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const list = await db
		.select()
		.from(recipients)
		.where(eq(recipients.ownerId, locals.user!.id))
		.orderBy(desc(recipients.createdAt));
	return { list };
};

export const actions: Actions = {
	add: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Nom requis' });
		const colors = String(form.get('favoriteColors') ?? '')
			.split(',')
			.map((c) => c.trim())
			.filter(Boolean);
		await db.insert(recipients).values({
			ownerId: uid,
			name,
			favoriteColors: colors,
			fiberAllergies: String(form.get('fiberAllergies') ?? '').trim() || null,
			notes: String(form.get('notes') ?? '').trim() || null
		});
		return { ok: true };
	},
	delete: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const id = String((await request.formData()).get('id') ?? '');
		await db.delete(recipients).where(and(eq(recipients.id, id), eq(recipients.ownerId, uid)));
		return { ok: true };
	}
};
