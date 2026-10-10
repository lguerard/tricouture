import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { embroideryDesigns } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

// The patch library: every patch made in the editor, newest first.
export const load: PageServerLoad = async ({ locals }) => {
	const designs = await db
		.select()
		.from(embroideryDesigns)
		.where(eq(embroideryDesigns.ownerId, locals.user!.id))
		.orderBy(desc(embroideryDesigns.updatedAt));
	return { designs };
};
