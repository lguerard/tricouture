import { fail, redirect } from '@sveltejs/kit';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects, patterns } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';
import type { projectStatus } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = locals.user!.id;
	const patternOptions = await db
		.select({ id: patterns.id, title: patterns.title })
		.from(patterns)
		.where(eq(patterns.ownerId, uid))
		.orderBy(desc(patterns.updatedAt));
	return { patternOptions, presetPattern: url.searchParams.get('pattern') };
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Titre requis' });

		const status = (String(form.get('status') ?? 'idee')) as (typeof projectStatus.enumValues)[number];
		const patternId = String(form.get('patternId') ?? '') || null;
		const deadline = String(form.get('deadline') ?? '') || null;
		const totalRows = parseInt(String(form.get('totalRows') ?? ''), 10);

		// place la carte en fin de colonne
		const maxPos = (
			await db
				.select({ m: sql<number>`coalesce(max(${projects.boardPosition}), -1)::int` })
				.from(projects)
				.where(eq(projects.ownerId, uid))
		)[0]?.m ?? -1;

		const inserted = (
			await db
				.insert(projects)
				.values({
					ownerId: uid,
					title,
					status,
					patternId,
					deadline,
					totalRows: Number.isFinite(totalRows) ? totalRows : null,
					boardPosition: maxPos + 1
				})
				.returning({ id: projects.id })
		)[0];

		throw redirect(303, `/projects/${inserted.id}`);
	}
};
