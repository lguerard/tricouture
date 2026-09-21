import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { tagColorOverrides } from '$lib/server/db/schema';
import type { TagColor } from '$lib/tagColor';

// This user's manual color choices, keyed by tag -- see the table's own
// comment in schema.ts for why this is per-viewer rather than per-tag.
export async function getTagColorOverrides(uid: string): Promise<Map<string, TagColor>> {
	const rows = await db
		.select({ tag: tagColorOverrides.tag, bg: tagColorOverrides.bg, fg: tagColorOverrides.fg })
		.from(tagColorOverrides)
		.where(eq(tagColorOverrides.userId, uid));
	return new Map(rows.map((r) => [r.tag, { bg: r.bg, fg: r.fg }]));
}

export async function setTagColorOverride(uid: string, tag: string, color: TagColor): Promise<void> {
	await db
		.insert(tagColorOverrides)
		.values({ userId: uid, tag, bg: color.bg, fg: color.fg })
		.onConflictDoUpdate({
			target: [tagColorOverrides.userId, tagColorOverrides.tag],
			set: { bg: color.bg, fg: color.fg }
		});
}

export async function clearTagColorOverride(uid: string, tag: string): Promise<void> {
	await db.delete(tagColorOverrides).where(and(eq(tagColorOverrides.userId, uid), eq(tagColorOverrides.tag, tag)));
}
