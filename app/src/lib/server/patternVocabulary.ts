import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns } from '$lib/server/db/schema';
import { buildVocabulary, type PatternVocabulary } from './vocabularyRanking';

export type { PatternVocabulary } from './vocabularyRanking';

// Tags/garment types/designers already used across this person's own
// patterns, fed into the AI suggestion prompt so it can prefer reusing an
// existing value over inventing a new one that means the same thing
// ("hiver" vs "d'hiver" vs "chaud"). Scoped to patterns they own, not ones
// shared with them -- this is about matching how THEY already name things,
// not borrowing someone else's vocabulary. Most used values first
// (vocabularyRanking.ts).
export async function getPatternVocabulary(uid: string): Promise<PatternVocabulary> {
	const rows = await db
		.select({ tags: patterns.tags, garmentType: patterns.garmentType, designer: patterns.designer })
		.from(patterns)
		.where(eq(patterns.ownerId, uid));
	return buildVocabulary(rows);
}
