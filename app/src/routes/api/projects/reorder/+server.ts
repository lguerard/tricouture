import { json, error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects, projectStatus } from '$lib/server/db/schema';
import { visibleTo } from '$lib/server/access';
import type { RequestHandler } from './$types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Persists a column state after a drag-and-drop:
// { status, ids: [...] } -> each project receives this status + its position = index.
// Applies to the caller's projects and to projects shared with them in 'edit',
// the same ones the board lets them drag.
export const POST: RequestHandler = async ({ locals, request }) => {
	const uid = locals.user!.id;
	const body = await request.json().catch(() => null);
	const status = body?.status;
	const ids: unknown = body?.ids;

	if (!projectStatus.enumValues.includes(status) || !Array.isArray(ids)) {
		throw error(400, 'Invalid request');
	}

	await Promise.all(
		ids.map((id, index) => {
			if (typeof id !== 'string' || !UUID.test(id)) return null;
			return db
				.update(projects)
				.set({
					status,
					boardPosition: index,
					// Every card of the column is re-sent on each drop: keep the date a
					// project was first finished instead of re-stamping the whole column.
					finishedAt: status === 'fini' ? sql`coalesce(${projects.finishedAt}, now())` : null,
					...(status === 'fini' ? { progressPct: 100 } : {})
				})
				.where(and(eq(projects.id, id), visibleTo(uid, 'project', projects.ownerId, projects.id, true)));
		})
	);

	return json({ ok: true });
};
