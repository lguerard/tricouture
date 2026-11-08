// Project changes shared by the project page and the assistant, so both do
// exactly the same thing (stash deducted in the same transaction, the same
// rule for a piece being done, files removed with the project).
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	fabrics,
	patternPieces,
	projectFabrics,
	projectPhotos,
	projectPieceProgress,
	projects,
	projectYarns,
	yarns,
	type PieceStatus
} from '$lib/server/db/schema';
import { dropSharesOf } from '$lib/server/access';
import { deleteStored } from '$lib/server/storage';

// Log yarn consumed by a project and deduct it from the acting account's
// stash in the same transaction, so the stash always reflects reality.
// False when the yarn is not in `uid`'s stash.
export async function useYarn(uid: string, projectId: string, yarnId: string, skeins: number): Promise<boolean> {
	const yarn = (await db.select().from(yarns).where(and(eq(yarns.id, yarnId), eq(yarns.ownerId, uid))).limit(1))[0];
	if (!yarn) return false;
	await db.transaction(async (tx) => {
		await tx
			.update(yarns)
			.set({ skeins: sql`greatest(${yarns.skeins} - ${skeins}, 0)` })
			.where(eq(yarns.id, yarnId));
		const existing = (
			await tx
				.select()
				.from(projectYarns)
				.where(and(eq(projectYarns.projectId, projectId), eq(projectYarns.yarnId, yarnId)))
				.limit(1)
		)[0];
		if (existing) {
			await tx
				.update(projectYarns)
				.set({ skeinsUsed: existing.skeinsUsed + skeins })
				.where(eq(projectYarns.id, existing.id));
		} else {
			await tx.insert(projectYarns).values({ projectId, yarnId, skeinsUsed: skeins });
		}
	});
	return true;
}

// Undo a logged yarn usage: remove the link and return the quantity to the
// stash. False when the link is not on this project.
export async function returnYarn(uid: string, projectId: string, linkId: string): Promise<boolean> {
	const link = (
		await db.select().from(projectYarns).where(and(eq(projectYarns.id, linkId), eq(projectYarns.projectId, projectId))).limit(1)
	)[0];
	if (!link) return false;
	await db.transaction(async (tx) => {
		if (link.yarnId) {
			await tx
				.update(yarns)
				.set({ skeins: sql`${yarns.skeins} + ${link.skeinsUsed}` })
				.where(and(eq(yarns.id, link.yarnId), eq(yarns.ownerId, uid)));
		}
		await tx.delete(projectYarns).where(eq(projectYarns.id, link.id));
	});
	return true;
}

// Same mechanism as useYarn, for fabric (couture) measured in centimeters.
export async function useFabric(uid: string, projectId: string, fabricId: string, lengthCm: number): Promise<boolean> {
	const fabric = (await db.select().from(fabrics).where(and(eq(fabrics.id, fabricId), eq(fabrics.ownerId, uid))).limit(1))[0];
	if (!fabric) return false;
	await db.transaction(async (tx) => {
		await tx
			.update(fabrics)
			.set({ lengthCm: sql`greatest(coalesce(${fabrics.lengthCm}, 0) - ${lengthCm}, 0)` })
			.where(eq(fabrics.id, fabricId));
		const existing = (
			await tx
				.select()
				.from(projectFabrics)
				.where(and(eq(projectFabrics.projectId, projectId), eq(projectFabrics.fabricId, fabricId)))
				.limit(1)
		)[0];
		if (existing) {
			await tx
				.update(projectFabrics)
				.set({ lengthUsedCm: existing.lengthUsedCm + lengthCm })
				.where(eq(projectFabrics.id, existing.id));
		} else {
			await tx.insert(projectFabrics).values({ projectId, fabricId, lengthUsedCm: lengthCm });
		}
	});
	return true;
}

export async function returnFabric(uid: string, projectId: string, linkId: string): Promise<boolean> {
	const link = (
		await db
			.select()
			.from(projectFabrics)
			.where(and(eq(projectFabrics.id, linkId), eq(projectFabrics.projectId, projectId)))
			.limit(1)
	)[0];
	if (!link) return false;
	await db.transaction(async (tx) => {
		if (link.fabricId) {
			await tx
				.update(fabrics)
				.set({ lengthCm: sql`coalesce(${fabrics.lengthCm}, 0) + ${link.lengthUsedCm}` })
				.where(and(eq(fabrics.id, link.fabricId), eq(fabrics.ownerId, uid)));
		}
		await tx.delete(projectFabrics).where(eq(projectFabrics.id, link.id));
	});
	return true;
}

// Merges a partial update into a piece's progress row and derives `completed`
// from whichever craft-specific signal applies: a couture piece is done once
// its stage reaches 'fini', a tricot/crochet piece with a row target is done
// once it's reached -- otherwise `completed` is left to the plain checkbox
// (setPieceCompleted below), unaffected by this helper.
export async function upsertPieceProgress(
	projectId: string,
	pieceId: string,
	patch: { status?: PieceStatus | null; currentRow?: number; totalRows?: number | null }
) {
	const existing = (
		await db
			.select()
			.from(projectPieceProgress)
			.where(and(eq(projectPieceProgress.projectId, projectId), eq(projectPieceProgress.pieceId, pieceId)))
			.limit(1)
	)[0];
	const status = patch.status !== undefined ? patch.status : (existing?.status ?? null);
	const currentRow = patch.currentRow !== undefined ? patch.currentRow : (existing?.currentRow ?? 0);
	const totalRows = patch.totalRows !== undefined ? patch.totalRows : (existing?.totalRows ?? null);
	const completed = status ? status === 'fini' : totalRows != null && totalRows > 0 && currentRow >= totalRows;
	const completedAt = completed ? new Date() : null;
	await db
		.insert(projectPieceProgress)
		.values({ projectId, pieceId, status, currentRow, totalRows, completed, completedAt })
		.onConflictDoUpdate({
			target: [projectPieceProgress.projectId, projectPieceProgress.pieceId],
			set: { status, currentRow, totalRows, completed, completedAt }
		});
}

export async function setPieceCompleted(projectId: string, pieceId: string, completed: boolean) {
	await db
		.insert(projectPieceProgress)
		.values({ projectId, pieceId, completed, completedAt: completed ? new Date() : null })
		.onConflictDoUpdate({
			target: [projectPieceProgress.projectId, projectPieceProgress.pieceId],
			set: { completed, completedAt: completed ? new Date() : null }
		});
}

// Tricot/crochet: moves a piece's own row counter by `delta`. The first time
// a piece is touched on a project, it adopts the pattern's suggested row
// count as its target.
export async function stepPieceRow(projectId: string, pieceId: string, delta: number) {
	const existing = (
		await db
			.select()
			.from(projectPieceProgress)
			.where(and(eq(projectPieceProgress.projectId, projectId), eq(projectPieceProgress.pieceId, pieceId)))
			.limit(1)
	)[0];
	const currentRow = Math.max(0, (existing?.currentRow ?? 0) + delta);
	const totalRows = existing
		? undefined
		: ((
				await db
					.select({ defaultTotalRows: patternPieces.defaultTotalRows })
					.from(patternPieces)
					.where(eq(patternPieces.id, pieceId))
					.limit(1)
			)[0]?.defaultTotalRows ?? null);
	await upsertPieceProgress(projectId, pieceId, { currentRow, ...(totalRows !== undefined ? { totalRows } : {}) });
}

// Owner only (checked by the caller): shares, rows (cascade) and photo files.
export async function deleteProject(projectId: string) {
	// The shares table has no foreign key to projects, so its rows go here.
	await dropSharesOf('project', projectId);
	const photos = await db
		.select({ storedPath: projectPhotos.storedPath })
		.from(projectPhotos)
		.where(eq(projectPhotos.projectId, projectId));
	await db.delete(projects).where(eq(projects.id, projectId));
	for (const ph of photos) await deleteStored(ph.storedPath);
}
