import { and, eq, isNotNull, asc, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const rows = await db
		.select({
			id: projects.id,
			title: projects.title,
			deadline: projects.deadline,
			status: projects.status,
			progressPct: projects.progressPct
		})
		.from(projects)
		.where(and(eq(projects.ownerId, locals.user!.id), isNotNull(projects.deadline), ne(projects.status, 'fini')))
		.orderBy(asc(projects.deadline));

	return { rows };
};
