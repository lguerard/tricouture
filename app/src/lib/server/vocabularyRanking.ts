import { tagIdentity } from './ai/tagGrounding';

export type PatternVocabulary = {
	tags: string[];
	garmentTypes: string[];
	designers: string[];
};

export const MAX_VOCAB_ITEMS = 40;

type Row = { tags: string[] | null; garmentType: string | null; designer: string | null };

// Most used first, so the 40 the prompt can hold are the ones that matter;
// variants of one tag ("torsades" / "torsade") count together, under the
// spelling used most often.
function ranked(values: string[], identity: (v: string) => string): string[] {
	const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
	for (const v of values) {
		const id = identity(v);
		if (!id) continue;
		const g = groups.get(id) ?? { count: 0, spellings: new Map<string, number>() };
		g.count += 1;
		g.spellings.set(v, (g.spellings.get(v) ?? 0) + 1);
		groups.set(id, g);
	}
	return [...groups.values()]
		.sort((a, b) => b.count - a.count)
		.slice(0, MAX_VOCAB_ITEMS)
		.map((g) => [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0]);
}

export function buildVocabulary(rows: Row[]): PatternVocabulary {
	const lower = (v: string) => v.trim().toLowerCase();
	return {
		tags: ranked(rows.flatMap((r) => r.tags ?? []), tagIdentity),
		garmentTypes: ranked(rows.flatMap((r) => (r.garmentType ? [r.garmentType] : [])), lower),
		designers: ranked(rows.flatMap((r) => (r.designer ? [r.designer] : [])), lower)
	};
}
