import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { appSettings, patterns, yarns } from '$lib/server/db/schema';
import { embed, embeddingScheme } from '$lib/server/ai/ollama';

const SCHEME_KEY = 'embedding_scheme';

// Stored vectors are only comparable with query vectors made the same way
// (same embedding model, same task prefixes -- see ollama.ts
// embeddingScheme). The scheme that produced them is recorded in
// app_settings; when the running configuration differs (another
// OLLAMA_EMBED_MODEL, the prefixes introduced, or no record at all on an
// install that predates it), every stored embedding is cleared so the usual
// backfill ("Mon compte" → index, or the next save) recomputes it -- a stale
// vector would otherwise match nothing, silently. Runs once per process
// (memoized), before anything reads or counts embeddings.
let schemeChecked: Promise<void> | null = null;

export function ensureEmbeddingScheme(): Promise<void> {
	schemeChecked ??= checkScheme().catch((e) => {
		schemeChecked = null; // retry on the next call
		throw e;
	});
	return schemeChecked;
}

async function checkScheme(): Promise<void> {
	const scheme = embeddingScheme();
	const row = (await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, SCHEME_KEY)).limit(1))[0];
	if (row?.value === scheme) return;
	await db.transaction(async (tx) => {
		const [p, y] = await Promise.all([
			tx.update(patterns).set({ embedding: null }).where(isNotNull(patterns.embedding)).returning({ id: patterns.id }),
			tx.update(yarns).set({ embedding: null }).where(isNotNull(yarns.embedding)).returning({ id: yarns.id })
		]);
		await tx
			.insert(appSettings)
			.values({ key: SCHEME_KEY, value: scheme })
			.onConflictDoUpdate({ target: appSettings.key, set: { value: scheme, updatedAt: new Date() } });
		if (p.length || y.length) {
			console.log(
				`Embedding scheme changed (${row?.value ?? 'unrecorded'} → ${scheme}): cleared ${p.length} pattern and ${y.length} yarn vectors for re-indexing.`
			);
		}
	});
}

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
	await ensureEmbeddingScheme();
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
	await ensureEmbeddingScheme();
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
		await db.update(patterns).set({ embedding: await embed(patternEmbeddingText(p), 'document') }).where(eq(patterns.id, p.id));
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
		await db.update(yarns).set({ embedding: await embed(yarnEmbeddingText(y), 'document') }).where(eq(yarns.id, y.id));
		done++;
	}
	return done;
}

// Embeds a pattern/yarn text for storage: makes sure the stored-vector scheme
// is current first, so a vector written right now is never wiped by the
// scheme check running a moment later.
export async function embedDocument(text: string): Promise<number[]> {
	await ensureEmbeddingScheme();
	return embed(text, 'document');
}
