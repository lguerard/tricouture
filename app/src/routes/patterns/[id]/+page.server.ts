import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternFiles } from '$lib/server/db/schema';
import { deleteStored } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

async function ownedPattern(uid: string, id: string) {
	return (
		await db
			.select()
			.from(patterns)
			.where(and(eq(patterns.id, id), eq(patterns.ownerId, uid)))
			.limit(1)
	)[0];
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const pattern = await ownedPattern(locals.user!.id, params.id);
	if (!pattern) throw error(404, 'Patron introuvable');

	const files = await db
		.select()
		.from(patternFiles)
		.where(eq(patternFiles.patternId, pattern.id));

	return { pattern, files };
};

export const actions: Actions = {
	delete: async ({ locals, params }) => {
		const uid = locals.user!.id;
		const pattern = await ownedPattern(uid, params.id);
		if (!pattern) return fail(404, { error: 'Introuvable' });

		const files = await db
			.select({ storedPath: patternFiles.storedPath })
			.from(patternFiles)
			.where(eq(patternFiles.patternId, pattern.id));
		for (const f of files) await deleteStored(f.storedPath);

		await db.delete(patterns).where(eq(patterns.id, pattern.id));
		throw redirect(303, '/patterns');
	}
};
