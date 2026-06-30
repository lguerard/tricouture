import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternFiles, users } from '$lib/server/db/schema';
import { deleteStored } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

// Pattern accessible if the user owns it OR it is shared.
async function accessiblePattern(uid: string, id: string) {
	return (
		await db
			.select({ pattern: patterns, ownerName: users.displayName })
			.from(patterns)
			.innerJoin(users, eq(patterns.ownerId, users.id))
			.where(and(eq(patterns.id, id), or(eq(patterns.ownerId, uid), eq(patterns.isShared, true))))
			.limit(1)
	)[0];
}

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
	const uid = locals.user!.id;
	const row = await accessiblePattern(uid, params.id);
	if (!row) throw error(404, 'Pattern not found');

	const files = await db
		.select()
		.from(patternFiles)
		.where(eq(patternFiles.patternId, row.pattern.id));

	const isOwner = row.pattern.ownerId === uid;
	return { pattern: row.pattern, files, isOwner, ownerName: row.ownerName };
};

export const actions: Actions = {
	// Toggle sharing on/off (owner only).
	toggleShare: async ({ locals, params }) => {
		const uid = locals.user!.id;
		const p = await ownedPattern(uid, params.id);
		if (!p) return fail(403, { error: 'Owner only' });
		await db
			.update(patterns)
			.set({ isShared: !p.isShared, updatedAt: new Date() })
			.where(eq(patterns.id, p.id));
		return { ok: true, isShared: !p.isShared };
	},

	delete: async ({ locals, params }) => {
		const uid = locals.user!.id;
		const pattern = await ownedPattern(uid, params.id);
		if (!pattern) return fail(403, { error: 'Owner only' });

		const files = await db
			.select({ storedPath: patternFiles.storedPath })
			.from(patternFiles)
			.where(eq(patternFiles.patternId, pattern.id));
		for (const f of files) await deleteStored(f.storedPath);

		await db.delete(patterns).where(eq(patterns.id, pattern.id));
		throw redirect(303, '/patterns');
	}
};
