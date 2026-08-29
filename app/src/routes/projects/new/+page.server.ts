import { fail, redirect } from '@sveltejs/kit';
import { and, eq, or, desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects, patterns } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';
import type { projectStatus } from '$lib/server/db/schema';

// A project can start from any pattern the user can see: their own, or one
// another account shared. Kept in sync with patterns/+page.server.ts.
async function visiblePatternIds(uid: string) {
	return db
		.select({ id: patterns.id, title: patterns.title, craft: patterns.craft, mine: patterns.ownerId })
		.from(patterns)
		.where(or(eq(patterns.ownerId, uid), eq(patterns.isShared, true)))
		.orderBy(desc(patterns.updatedAt));
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = locals.user!.id;
	const rows = await visiblePatternIds(uid);
	const patternOptions = rows.map((p) => ({
		id: p.id,
		title: p.title,
		craft: p.craft,
		mine: p.mine === uid
	}));
	return { patternOptions, presetPattern: url.searchParams.get('pattern') };
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Titre requis' });

		const status = (String(form.get('status') ?? 'idee')) as (typeof projectStatus.enumValues)[number];
		const requestedPatternId = String(form.get('patternId') ?? '') || null;
		const deadline = String(form.get('deadline') ?? '') || null;
		const totalRows = parseInt(String(form.get('totalRows') ?? ''), 10);

		// Only link a pattern the user actually has access to (own or shared).
		let patternId: string | null = null;
		if (requestedPatternId) {
			const accessible = (
				await db
					.select({ id: patterns.id })
					.from(patterns)
					.where(
						and(
							eq(patterns.id, requestedPatternId),
							or(eq(patterns.ownerId, uid), eq(patterns.isShared, true))
						)
					)
					.limit(1)
			)[0];
			if (!accessible) return fail(400, { error: 'Patron introuvable' });
			patternId = accessible.id;
		}

		// place the card at the end of the column
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
