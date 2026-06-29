import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects, patterns, paceLogs } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';
import type { projectStatus } from '$lib/server/db/schema';

async function owned(uid: string, id: string) {
	return (
		await db
			.select()
			.from(projects)
			.where(and(eq(projects.id, id), eq(projects.ownerId, uid)))
			.limit(1)
	)[0];
}

function progressFrom(currentRow: number, totalRows: number | null, fallback: number): number {
	if (totalRows && totalRows > 0) {
		return Math.max(0, Math.min(100, Math.round((currentRow / totalRows) * 100)));
	}
	return fallback;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const project = await owned(locals.user!.id, params.id);
	if (!project) throw error(404, 'Projet introuvable');

	const pattern = project.patternId
		? (await db.select({ id: patterns.id, title: patterns.title }).from(patterns).where(eq(patterns.id, project.patternId)).limit(1))[0]
		: null;

	const pace = await db
		.select()
		.from(paceLogs)
		.where(eq(paceLogs.projectId, project.id))
		.orderBy(paceLogs.loggedAt);

	// vitesse moyenne (rangs/h) et prédiction de fin
	const totals = pace.reduce((a, p) => ({ rows: a.rows + p.rowsDone, min: a.min + p.minutes }), { rows: 0, min: 0 });
	const rowsPerHour = totals.min > 0 ? totals.rows / (totals.min / 60) : null;
	const remaining = project.totalRows ? Math.max(0, project.totalRows - project.currentRow) : null;
	const hoursLeft = rowsPerHour && remaining !== null ? remaining / rowsPerHour : null;

	return { project, pattern, pace, rowsPerHour, remaining, hoursLeft };
};

export const actions: Actions = {
	row: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const p = await owned(uid, params.id);
		if (!p) return fail(404, { error: 'Introuvable' });
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
		const p = await owned(uid, params.id);
		if (!p) return fail(404, { error: 'Introuvable' });
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
		const p = await owned(uid, params.id);
		if (!p) return fail(404, { error: 'Introuvable' });
		const form = await request.formData();
		const rowsDone = parseInt(String(form.get('rowsDone') ?? ''), 10);
		const minutes = parseInt(String(form.get('minutes') ?? ''), 10);
		if (!Number.isFinite(rowsDone) || !Number.isFinite(minutes) || minutes <= 0) {
			return fail(400, { error: 'Rangs et minutes valides requis' });
		}
		await db.insert(paceLogs).values({ projectId: p.id, rowsDone, minutes });
		await db
			.update(projects)
			.set({ timeSpentMinutes: p.timeSpentMinutes + minutes, updatedAt: new Date() })
			.where(eq(projects.id, p.id));
		return { ok: true };
	},

	delete: async ({ locals, params }) => {
		const uid = locals.user!.id;
		const p = await owned(uid, params.id);
		if (!p) return fail(404, { error: 'Introuvable' });
		await db.delete(projects).where(eq(projects.id, p.id));
		throw redirect(303, '/projects/board');
	}
};
