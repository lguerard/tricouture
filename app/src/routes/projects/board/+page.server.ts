import { eq, asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects } from '$lib/server/db/schema';
import { STATUS_ORDER } from '$lib/labels';
import type { PageServerLoad } from './$types';
import type { ProjectStatus } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;
	const rows = await db
		.select({
			id: projects.id,
			title: projects.title,
			status: projects.status,
			progressPct: projects.progressPct,
			currentRow: projects.currentRow,
			totalRows: projects.totalRows,
			deadline: projects.deadline,
			boardPosition: projects.boardPosition
		})
		.from(projects)
		.where(eq(projects.ownerId, uid))
		.orderBy(asc(projects.boardPosition));

	const columns: Record<ProjectStatus, typeof rows> = {
		idee: [],
		monte: [],
		bloque: [],
		fini: []
	};
	for (const r of rows) columns[r.status].push(r);

	return { columns, order: STATUS_ORDER };
};
