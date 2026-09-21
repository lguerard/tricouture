import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternFiles, patternPieces, users } from '$lib/server/db/schema';
import { deleteStored } from '$lib/server/storage';
import { getAllVisibleTags } from '$lib/server/patternTags';
import { assignTagColors } from '$lib/tagColor';
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

	const pieces = await db
		.select()
		.from(patternPieces)
		.where(eq(patternPieces.patternId, row.pattern.id))
		.orderBy(asc(patternPieces.position));

	// Same set every tag pill on the patterns list is colored from (see
	// $lib/tagColor.ts), so a tag reads as the same color wherever it appears.
	const allTags = await getAllVisibleTags(uid);
	const tagColors = assignTagColors(allTags);

	const isOwner = row.pattern.ownerId === uid;
	return { pattern: row.pattern, files, pieces, isOwner, ownerName: row.ownerName, tagColors };
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
	},

	addPiece: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const pattern = await ownedPattern(uid, params.id);
		if (!pattern) return fail(403, { error: 'Owner only' });
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { pieceError: 'Nom requis' });
		const count = (await db.select().from(patternPieces).where(eq(patternPieces.patternId, pattern.id))).length;
		await db.insert(patternPieces).values({ patternId: pattern.id, name, position: count });
		return { ok: true };
	},

	removePiece: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const pattern = await ownedPattern(uid, params.id);
		if (!pattern) return fail(403, { error: 'Owner only' });
		const pieceId = String((await request.formData()).get('pieceId') ?? '');
		await db.delete(patternPieces).where(and(eq(patternPieces.id, pieceId), eq(patternPieces.patternId, pattern.id)));
		return { ok: true };
	},

	// Correct (or fill in) the AI-suggested row count / cut quantity for a
	// piece. Only the field actually submitted is touched, so the couture
	// form (quantity) never clobbers a tricot/crochet row count and vice versa.
	updatePieceDefaults: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const pattern = await ownedPattern(uid, params.id);
		if (!pattern) return fail(403, { error: 'Owner only' });
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		if (!pieceId) return fail(400, { error: 'pieceId required' });
		const patch: { defaultTotalRows?: number | null; quantity?: number | null } = {};
		if (form.has('defaultTotalRows')) {
			const raw = String(form.get('defaultTotalRows') ?? '').trim();
			patch.defaultTotalRows = raw ? Math.max(0, parseInt(raw, 10) || 0) || null : null;
		}
		if (form.has('quantity')) {
			const raw = String(form.get('quantity') ?? '').trim();
			patch.quantity = raw ? Math.max(0, parseInt(raw, 10) || 0) || null : null;
		}
		if (Object.keys(patch).length === 0) return fail(400, { error: 'Nothing to update' });
		await db
			.update(patternPieces)
			.set(patch)
			.where(and(eq(patternPieces.id, pieceId), eq(patternPieces.patternId, pattern.id)));
		return { ok: true };
	}
};
