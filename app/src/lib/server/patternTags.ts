import { or, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns } from '$lib/server/db/schema';

// Every distinct tag across patterns visible to this user (their own, plus
// ones shared with them) -- the same visibility rule the patterns list uses.
// Sorted alphabetically so tagColor.ts's index-based color assignment is
// stable regardless of query order, and identical wherever this is called.
export async function getAllVisibleTags(uid: string): Promise<string[]> {
	const rows = await db
		.select({ tags: patterns.tags })
		.from(patterns)
		.where(or(eq(patterns.ownerId, uid), eq(patterns.isShared, true))!);
	const set = new Set<string>();
	for (const r of rows) for (const t of r.tags ?? []) set.add(t);
	return [...set].sort((a, b) => a.localeCompare(b));
}
