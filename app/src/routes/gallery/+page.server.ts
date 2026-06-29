import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { finishedObjects } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const items = await db
		.select()
		.from(finishedObjects)
		.where(eq(finishedObjects.ownerId, locals.user!.id))
		.orderBy(desc(finishedObjects.createdAt));
	return { items };
};
