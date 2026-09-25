import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, yarns } from '$lib/server/db/schema';
import { embed } from '$lib/server/ai/ollama';

// The text a pattern / yarn is embedded from. Every path that writes an
// embedding (creation, edit, import, backfill) goes through these, so a
// vector computed later is comparable with one computed at creation.
export function patternEmbeddingText(p: {
	title: string;
	craft: string;
	garmentType?: string | null;
	designer?: string | null;
	tags?: string[] | null;
	notes?: string | null;
	extractedText?: string | null;
}): string {
	return [p.title, p.craft, p.garmentType, p.designer, (p.tags ?? []).join(' '), p.notes, p.extractedText?.slice(0, 800)]
		.filter(Boolean)
		.join(' ');
}

export function yarnEmbeddingText(y: {
	brand?: string | null;
	name?: string | null;
	colorway?: string | null;
	fiber?: string | null;
	weightCategory?: string | null;
}): string {
	return [y.brand, y.name, y.colorway, y.fiber, y.weightCategory].filter(Boolean).join(' ');
}

// A yarn with nothing descriptive filled in has nothing to embed: it is
// neither counted as missing nor backfilled.
const yarnDescribed = sql`coalesce(${yarns.brand}, ${yarns.name}, ${yarns.colorway}, ${yarns.fiber}, ${yarns.weightCategory}) is not null`;

export async function missingEmbeddings(uid: string): Promise<{ patterns: number; yarns: number }> {
	const [p, y] = await Promise.all([
		db.select({ n: count() }).from(patterns).where(and(eq(patterns.ownerId, uid), isNull(patterns.embedding))),
		db.select({ n: count() }).from(yarns).where(and(eq(yarns.ownerId, uid), isNull(yarns.embedding), yarnDescribed))
	]);
	return { patterns: p[0]?.n ?? 0, yarns: y[0]?.n ?? 0 };
}

// Embeds up to `budget` of the user's items that have no vector yet (items
// created while Ollama was down, or before semantic search existed). Bounded
// so one click is one reasonably short request; the caller reports what is
// left. Lets AiUnavailable propagate: if Ollama is gone there is no point
// trying the next item.
export async function backfillEmbeddings(uid: string, budget = 40): Promise<number> {
	let done = 0;
	const pats = await db
		.select({
			id: patterns.id,
			title: patterns.title,
			craft: patterns.craft,
			garmentType: patterns.garmentType,
			designer: patterns.designer,
			tags: patterns.tags,
			notes: patterns.notes,
			extractedText: patterns.extractedText
		})
		.from(patterns)
		.where(and(eq(patterns.ownerId, uid), isNull(patterns.embedding)))
		.limit(budget);
	for (const p of pats) {
		await db.update(patterns).set({ embedding: await embed(patternEmbeddingText(p)) }).where(eq(patterns.id, p.id));
		done++;
	}
	if (done >= budget) return done;

	const yarnRows = await db
		.select({
			id: yarns.id,
			brand: yarns.brand,
			name: yarns.name,
			colorway: yarns.colorway,
			fiber: yarns.fiber,
			weightCategory: yarns.weightCategory
		})
		.from(yarns)
		.where(and(eq(yarns.ownerId, uid), isNull(yarns.embedding), yarnDescribed))
		.limit(budget - done);
	for (const y of yarnRows) {
		await db.update(yarns).set({ embedding: await embed(yarnEmbeddingText(y)) }).where(eq(yarns.id, y.id));
		done++;
	}
	return done;
}
