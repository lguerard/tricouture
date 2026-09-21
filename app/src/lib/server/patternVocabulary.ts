import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns } from '$lib/server/db/schema';

export type PatternVocabulary = {
	tags: string[];
	garmentTypes: string[];
	designers: string[];
};

const MAX_VOCAB_ITEMS = 40;

// Tags/garment types/designers already used across this person's own
// patterns, fed into the AI suggestion prompt so it can prefer reusing an
// existing value over inventing a new one that means the same thing
// ("hiver" vs "d'hiver" vs "chaud"). Scoped to patterns they own, not ones
// shared with them -- this is about matching how THEY already name things,
// not borrowing someone else's vocabulary.
export async function getPatternVocabulary(uid: string): Promise<PatternVocabulary> {
	const rows = await db
		.select({ tags: patterns.tags, garmentType: patterns.garmentType, designer: patterns.designer })
		.from(patterns)
		.where(eq(patterns.ownerId, uid));

	const tags = new Set<string>();
	const garmentTypes = new Set<string>();
	const designers = new Set<string>();
	for (const row of rows) {
		for (const tag of row.tags ?? []) tags.add(tag);
		if (row.garmentType) garmentTypes.add(row.garmentType);
		if (row.designer) designers.add(row.designer);
	}

	return {
		tags: [...tags].slice(0, MAX_VOCAB_ITEMS),
		garmentTypes: [...garmentTypes].slice(0, MAX_VOCAB_ITEMS),
		designers: [...designers].slice(0, MAX_VOCAB_ITEMS)
	};
}
