import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects, projectStatus } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// Persiste l'état d'une colonne après un glisser-déposer :
// { status, ids: [...] } -> chaque projet reçoit ce statut + sa position = index.
export const POST: RequestHandler = async ({ locals, request }) => {
	const uid = locals.user!.id;
	const body = await request.json().catch(() => null);
	const status = body?.status;
	const ids: unknown = body?.ids;

	if (!projectStatus.enumValues.includes(status) || !Array.isArray(ids)) {
		throw error(400, 'Requête invalide');
	}

	await Promise.all(
		ids.map((id, index) =>
			db
				.update(projects)
				.set({
					status,
					boardPosition: index,
					...(status === 'fini' ? { finishedAt: new Date(), progressPct: 100 } : {})
				})
				.where(and(eq(projects.id, String(id)), eq(projects.ownerId, uid)))
		)
	);

	return json({ ok: true });
};
