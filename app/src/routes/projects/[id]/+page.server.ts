import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	projects,
	patterns,
	patternPieces,
	projectPieceProgress,
	pieceStatus as pieceStatusEnum,
	paceLogs,
	yarns,
	fabrics,
	projectYarns,
	projectFabrics,
	projectPhotos
} from '$lib/server/db/schema';
import { deleteStored, isSupportedImage, saveImageUpload } from '$lib/server/storage';
import { isUuid } from '$lib/uuid';
import { t } from '$lib/i18n';
import type { PieceStatus } from '$lib/server/db/schema';
import {
	accessFor,
	canEdit,
	listShares,
	revokeShare,
	shareableUsers,
	upsertShare,
	type Access
} from '$lib/server/access';
import {
	deleteProject,
	returnFabric,
	returnYarn,
	setPieceCompleted,
	stepPieceRow,
	upsertPieceProgress,
	useFabric,
	useYarn
} from '$lib/server/services/projects';
import type { Actions, PageServerLoad } from './$types';
import type { projectStatus } from '$lib/server/db/schema';

// Owner only: deleting a project and managing who it is shared with are not
// things a collaborator gets to do.
async function owned(uid: string, id: string) {
	return (
		await db
			.select()
			.from(projects)
			.where(and(eq(projects.id, id), eq(projects.ownerId, uid)))
			.limit(1)
	)[0];
}

// The project plus what this account may do with it, or null when it may not
// even see it. Callers answer 404 on null rather than 403: a 403 would confirm
// the id exists and let someone enumerate other accounts' projects.
async function withAccess(uid: string, id: string) {
	const project = (await db.select().from(projects).where(eq(projects.id, id)).limit(1))[0];
	if (!project) return null;
	const access = await accessFor(uid, 'project', project.id, project.ownerId);
	return access ? { project, access } : null;
}

// Everything that changes the project itself: owner, or someone it was shared
// with in 'edit'. Logging yarn or fabric from here still draws on the acting
// account's own stash -- the queries below filter materials by yarns.ownerId.
async function editable(uid: string, id: string) {
	const found = await withAccess(uid, id);
	return found && canEdit(found.access) ? found.project : undefined;
}

function progressFrom(currentRow: number, totalRows: number | null, fallback: number): number {
	if (totalRows && totalRows > 0) {
		return Math.max(0, Math.min(100, Math.round((currentRow / totalRows) * 100)));
	}
	return fallback;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const uid = locals.user!.id;
	const found = await withAccess(uid, params.id);
	if (!found) throw error(404, 'Project not found');
	const { project, access } = found;

	const pattern = project.patternId
		? (
				await db
					.select({ id: patterns.id, title: patterns.title, craft: patterns.craft })
					.from(patterns)
					.where(eq(patterns.id, project.patternId))
					.limit(1)
			)[0]
		: null;

	const pieces = project.patternId
		? await db
				.select({
					id: patternPieces.id,
					name: patternPieces.name,
					completed: sql<boolean>`coalesce(${projectPieceProgress.completed}, false)`,
					status: projectPieceProgress.status,
					currentRow: sql<number>`coalesce(${projectPieceProgress.currentRow}, 0)`,
					// This project's own target if it has one, else the pattern's
					// AI-suggested row count for the piece -- so a piece the AI could
					// read a row count for starts in counter mode with no setup.
					totalRows: sql<number | null>`coalesce(${projectPieceProgress.totalRows}, ${patternPieces.defaultTotalRows})`,
					quantity: patternPieces.quantity
				})
				.from(patternPieces)
				.leftJoin(
					projectPieceProgress,
					and(eq(projectPieceProgress.pieceId, patternPieces.id), eq(projectPieceProgress.projectId, project.id))
				)
				.where(eq(patternPieces.patternId, project.patternId))
				.orderBy(asc(patternPieces.position))
		: [];

	const pace = await db
		.select()
		.from(paceLogs)
		.where(eq(paceLogs.projectId, project.id))
		.orderBy(paceLogs.loggedAt);

	// average speed (rows/h) and completion prediction
	const totals = pace.reduce((a, p) => ({ rows: a.rows + p.rowsDone, min: a.min + p.minutes }), { rows: 0, min: 0 });
	const rowsPerHour = totals.min > 0 ? totals.rows / (totals.min / 60) : null;
	const remaining = project.totalRows ? Math.max(0, project.totalRows - project.currentRow) : null;
	const hoursLeft = rowsPerHour && remaining !== null ? remaining / rowsPerHour : null;

	const photos = await db
		.select({ id: projectPhotos.id, storedPath: projectPhotos.storedPath, caption: projectPhotos.caption })
		.from(projectPhotos)
		.where(eq(projectPhotos.projectId, project.id))
		.orderBy(desc(projectPhotos.createdAt));

	// Stash-backed materials: what's available to log, and what this project
	// has already consumed (each consumption already deducted from the stash).
	const [yarnStash, fabricStash, usedYarns, usedFabrics] = await Promise.all([
		db
			.select({
				id: yarns.id,
				brand: yarns.brand,
				name: yarns.name,
				colorway: yarns.colorway,
				skeins: yarns.skeins
			})
			.from(yarns)
			.where(eq(yarns.ownerId, uid))
			.orderBy(desc(yarns.createdAt)),
		db
			.select({
				id: fabrics.id,
				name: fabrics.name,
				fabricType: fabrics.fabricType,
				lengthCm: fabrics.lengthCm
			})
			.from(fabrics)
			.where(eq(fabrics.ownerId, uid))
			.orderBy(desc(fabrics.createdAt)),
		db
			.select({
				id: projectYarns.id,
				yarnId: projectYarns.yarnId,
				skeinsUsed: projectYarns.skeinsUsed,
				brand: yarns.brand,
				name: yarns.name,
				colorway: yarns.colorway
			})
			.from(projectYarns)
			.leftJoin(yarns, eq(projectYarns.yarnId, yarns.id))
			.where(eq(projectYarns.projectId, project.id)),
		db
			.select({
				id: projectFabrics.id,
				fabricId: projectFabrics.fabricId,
				lengthUsedCm: projectFabrics.lengthUsedCm,
				name: fabrics.name,
				fabricType: fabrics.fabricType
			})
			.from(projectFabrics)
			.leftJoin(fabrics, eq(projectFabrics.fabricId, fabrics.id))
			.where(eq(projectFabrics.projectId, project.id))
	]);

	// The share panel is the owner's business only: a collaborator has no reason
	// to see the other people an object was shared with, nor the list of every
	// account on the server.
	const isOwner = access === 'owner';
	const [sharedWith, people] = isOwner
		? await Promise.all([listShares('project', project.id), shareableUsers(uid)])
		: [[], []];

	return {
		project,
		access,
		sharedWith,
		people,
		pattern,
		pieces,
		pace,
		rowsPerHour,
		remaining,
		hoursLeft,
		yarnStash,
		fabricStash,
		usedYarns,
		usedFabrics,
		photos
	};
};

const MAX_PHOTOS_PER_UPLOAD = 10;

export const actions: Actions = {
	row: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const delta = parseInt(String((await request.formData()).get('delta') ?? '0'), 10) || 0;
		const currentRow = Math.max(0, p.currentRow + delta);
		await db
			.update(projects)
			.set({ currentRow, progressPct: progressFrom(currentRow, p.totalRows, p.progressPct), updatedAt: new Date() })
			.where(eq(projects.id, p.id));
		return { ok: true };
	},

	update: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const status = String(form.get('status') ?? p.status) as (typeof projectStatus.enumValues)[number];
		const progressPct = Math.max(0, Math.min(100, parseInt(String(form.get('progressPct') ?? p.progressPct), 10) || 0));
		const num = (k: string) => {
			const n = parseInt(String(form.get(k) ?? ''), 10);
			return Number.isFinite(n) ? n : null;
		};
		await db
			.update(projects)
			.set({
				status,
				progressPct,
				totalRows: num('totalRows'),
				timeSpentMinutes: num('timeSpentMinutes') ?? p.timeSpentMinutes,
				costCents: Math.round((parseFloat(String(form.get('cost') ?? '')) || 0) * 100),
				retailPriceCents: form.get('retail') ? Math.round((parseFloat(String(form.get('retail'))) || 0) * 100) : null,
				location: String(form.get('location') ?? '').trim() || null,
				notes: String(form.get('notes') ?? '').trim() || null,
				deadline: String(form.get('deadline') ?? '') || null,
				finishedAt: status === 'fini' ? (p.finishedAt ?? new Date()) : null,
				updatedAt: new Date()
			})
			.where(eq(projects.id, p.id));
		return { ok: true };
	},

	logPace: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const rowsDone = parseInt(String(form.get('rowsDone') ?? ''), 10);
		const minutes = parseInt(String(form.get('minutes') ?? ''), 10);
		if (!Number.isFinite(rowsDone) || !Number.isFinite(minutes) || minutes <= 0) {
			return fail(400, { error: 'Valid rows and minutes required' });
		}
		await db.insert(paceLogs).values({ projectId: p.id, rowsDone, minutes });
		await db
			.update(projects)
			.set({ timeSpentMinutes: p.timeSpentMinutes + minutes, updatedAt: new Date() })
			.where(eq(projects.id, p.id));
		return { ok: true };
	},

	// Log yarn consumed by the project's progress and deduct it from the
	// stash in the same transaction, so the stash always reflects reality.
	useYarn: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const yarnId = String(form.get('yarnId') ?? '');
		const amount = parseFloat(String(form.get('skeinsUsed') ?? ''));
		if (!yarnId || !Number.isFinite(amount) || amount <= 0) {
			return fail(400, { error: 'Quantité invalide' });
		}
		if (!(await useYarn(uid, p.id, yarnId, amount))) return fail(404, { error: 'Laine introuvable' });
		return { ok: true };
	},

	// Undo a logged yarn usage: remove the link and return the quantity to stash.
	undoYarnUse: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const linkId = String((await request.formData()).get('id') ?? '');
		if (!(await returnYarn(uid, p.id, linkId))) return fail(404, { error: 'Not found' });
		return { ok: true };
	},

	// Same mechanism as useYarn, for fabric (couture) measured in centimeters.
	useFabric: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const fabricId = String(form.get('fabricId') ?? '');
		const amount = parseInt(String(form.get('lengthUsedCm') ?? ''), 10);
		if (!fabricId || !Number.isFinite(amount) || amount <= 0) {
			return fail(400, { error: 'Quantité invalide' });
		}
		if (!(await useFabric(uid, p.id, fabricId, amount))) return fail(404, { error: 'Tissu introuvable' });
		return { ok: true };
	},

	undoFabricUse: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const linkId = String((await request.formData()).get('id') ?? '');
		if (!(await returnFabric(uid, p.id, linkId))) return fail(404, { error: 'Not found' });
		return { ok: true };
	},

	delete: async ({ locals, params }) => {
		const uid = locals.user!.id;
		const p = await owned(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		await deleteProject(p.id);
		throw redirect(303, '/projects/board');
	},

	// Progress / finished-object photos. Stored under the project OWNER's media
	// folder even when a collaborator uploads them, so they live and die with
	// the project's owner like everything else in it.
	addPhoto: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const files = form
			.getAll('photos')
			.filter((f): f is File => f instanceof File && f.size > 0)
			.slice(0, MAX_PHOTOS_PER_UPLOAD);
		if (files.length === 0) return fail(400, { photoError: t(locals.locale, 'projects.photos.errorMissing') });
		if (!files.every(isSupportedImage)) {
			return fail(400, { photoError: t(locals.locale, 'projects.photos.errorFormat') });
		}
		const caption = String(form.get('caption') ?? '').trim().slice(0, 255) || null;
		for (const file of files) {
			const saved = await saveImageUpload(p.ownerId, file, 'projects');
			await db.insert(projectPhotos).values({ projectId: p.id, storedPath: saved.storedPath, caption });
		}
		await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, p.id));
		return { ok: true };
	},

	deletePhoto: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const photoId = String((await request.formData()).get('photoId') ?? '');
		if (!isUuid(photoId)) return fail(400, { error: 'photoId required' });
		const photo = (
			await db
				.delete(projectPhotos)
				.where(and(eq(projectPhotos.id, photoId), eq(projectPhotos.projectId, p.id)))
				.returning({ storedPath: projectPhotos.storedPath })
		)[0];
		if (photo) await deleteStored(photo.storedPath);
		return { ok: true };
	},

	togglePiece: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		const completed = String(form.get('completed') ?? '') === 'true';
		if (!pieceId) return fail(400, { error: 'pieceId required' });
		await setPieceCompleted(p.id, pieceId, completed);
		return { ok: true };
	},

	// Couture: move a piece to its next cut/sew stage.
	setPieceStatus: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		const status = String(form.get('status') ?? '');
		if (!pieceId || !pieceStatusEnum.enumValues.includes(status as PieceStatus)) {
			return fail(400, { error: 'Invalid' });
		}
		await upsertPieceProgress(p.id, pieceId, { status: status as PieceStatus });
		return { ok: true };
	},

	// Tricot/crochet: +1/-1 on a piece's own row counter.
	setPieceRow: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		const delta = parseInt(String(form.get('delta') ?? '0'), 10) || 0;
		if (!pieceId) return fail(400, { error: 'pieceId required' });
		await stepPieceRow(p.id, pieceId, delta);
		return { ok: true };
	},

	// Tricot/crochet: set (or clear) a piece's row target, switching it into
	// row-counter mode -- a piece with no target keeps the plain checkbox.
	setPieceTotalRows: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await editable(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		if (!pieceId) return fail(400, { error: 'pieceId required' });
		const raw = String(form.get('totalRows') ?? '').trim();
		const totalRows = raw ? Math.max(0, parseInt(raw, 10) || 0) || null : null;
		await upsertPieceProgress(p.id, pieceId, { totalRows });
		return { ok: true };
	},

	// --- Sharing (owner only) -------------------------------------------------

	share: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await owned(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const role = String(form.get('role') ?? 'view');
		if (!userId) return fail(400, { error: 'Pick someone to share with' });
		if (role !== 'view' && role !== 'edit') return fail(400, { error: 'Unknown role' });

		await upsertShare(uid, 'project', p.id, userId, role);
		return { shared: true };
	},

	unshare: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await owned(uid, params.id);
		if (!p) return fail(404, { error: 'Not found' });

		const userId = String((await request.formData()).get('userId') ?? '');
		if (!userId) return fail(400, { error: 'Missing recipient' });

		await revokeShare('project', p.id, userId);
		return { unshared: true };
	}
};
