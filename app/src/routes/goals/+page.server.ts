import { fail } from '@sveltejs/kit';
import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { goals } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const list = await db
		.select()
		.from(goals)
		.where(eq(goals.ownerId, locals.user!.id))
		.orderBy(desc(goals.createdAt));
	return { list };
};

export const actions: Actions = {
	add: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Titre requis' });
		const target = parseInt(String(form.get('targetValue') ?? '1'), 10) || 1;
		await db.insert(goals).values({
			ownerId: uid,
			title,
			kind: String(form.get('kind') ?? 'projets_an'),
			targetValue: target,
			periodStart: String(form.get('periodStart') ?? '') || null,
			periodEnd: String(form.get('periodEnd') ?? '') || null
		});
		return { ok: true };
	},
	step: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const delta = parseInt(String(form.get('delta') ?? '1'), 10) || 1;
		await db
			.update(goals)
			.set({ currentValue: sql`greatest(0, ${goals.currentValue} + ${delta})` })
			.where(and(eq(goals.id, id), eq(goals.ownerId, uid)));
		return { ok: true };
	},
	delete: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const id = String((await request.formData()).get('id') ?? '');
		await db.delete(goals).where(and(eq(goals.id, id), eq(goals.ownerId, uid)));
		return { ok: true };
	}
};
