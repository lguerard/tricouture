import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternFiles } from '$lib/server/db/schema';
import { saveUpload } from '$lib/server/storage';
import { extractPdfText } from '$lib/server/pdf';
import { embed, aiConfigured } from '$lib/server/ai/ollama';
import { suggestPatternInfo, mergePatternInfo, DEFAULT_INFO_LANGUAGE, type InfoLanguage } from '$lib/server/ai/patternInfo';
import { getPatternVocabulary } from '$lib/server/patternVocabulary';
import type { Craft } from '$lib/server/db/schema';

// "Pull_Aiguilles-No12_v2.pdf" -> "Pull Aiguilles No12 v2". Separators become
// spaces, the extension goes, and a trailing "(1)" from a duplicate download
// disappears. Titles stay editable afterwards -- this only has to be better
// than the raw filename.
export function titleFromFilename(name: string): string {
	const base = name.replace(/\.[^.]+$/, '');
	const cleaned = base
		.replace(/[_+]+/g, ' ')
		.replace(/-+/g, ' ')
		.replace(/\s*\(\d+\)\s*$/, '')
		.replace(/\s+/g, ' ')
		.trim();
	return (cleaned || base).slice(0, 255);
}

export type ImportOneResult = { ok: true; id: string; title: string } | { ok: false; skipped: true; name: string };

// Imports a single pattern PDF: one pattern row + one file, best-effort
// embedding. Shared by the whole-batch form action (patterns/import, the
// no-JS fallback) and the per-file upload endpoint
// (/api/patterns/import-one, the normal path) -- one request per file keeps
// each request small regardless of how many files the batch has, which
// matters both for the app's own memory (a single leftover leak no longer
// compounds across a big batch) and for any reverse proxy/CDN sitting in
// front with its own body-size cap (e.g. Cloudflare's ~100MB per request).
export async function importOnePattern(opts: {
	uid: string;
	craft: Craft;
	tags: string[];
	file: File;
	aiLanguage?: InfoLanguage;
}): Promise<ImportOneResult> {
	const { uid, craft, file, aiLanguage = DEFAULT_INFO_LANGUAGE } = opts;
	let tags = opts.tags;

	// Anything that is not a PDF is reported rather than silently dropped: a
	// batch where a few files vanished without a word is worse than none.
	const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
	if (!isPdf) return { ok: false, skipped: true, name: file.name };

	let title = titleFromFilename(file.name);
	const buf = Buffer.from(await file.arrayBuffer());
	const extractedText = await extractPdfText(buf);

	const inserted = (
		await db
			.insert(patterns)
			.values({ ownerId: uid, title, craft, tags, extractedText })
			.returning({ id: patterns.id })
	)[0];

	const saved = await saveUpload(uid, file, 'patterns');
	await db.insert(patternFiles).values({
		patternId: inserted.id,
		filename: saved.filename,
		storedPath: saved.storedPath,
		mimeType: saved.mimeType,
		sizeBytes: saved.sizeBytes,
		isPrimary: true
	});

	const updates: Record<string, unknown> = {};

	// Auto-fill only fields nothing was specified for (a batch has no per-file
	// form beyond craft/tags, so that's just tags here) -- an explicit choice,
	// even one shared across the whole batch, is never overridden. Best-effort,
	// same policy as the embedding step below: a slow/unavailable Ollama must
	// not abort the import. The title is the one exception to "only fill if
	// empty": at import it's always the filename guess, never a deliberate
	// choice (there's no per-file title field in a batch), so a title the AI
	// can actually read off the document is preferred outright.
	if (aiConfigured()) {
		try {
			const vocabulary = await getPatternVocabulary(uid);
			const suggested = await suggestPatternInfo(
				[title, extractedText].filter(Boolean).join('\n\n'),
				aiLanguage,
				vocabulary
			);
			if (suggested.title) {
				title = suggested.title;
				updates.title = title;
			}
			const merged = mergePatternInfo(
				{
					tags,
					garmentType: null,
					designer: null,
					language: null,
					difficulty: null,
					sizes: null,
					gaugeStitches: null,
					gaugeRows: null,
					yardageRequired: null
				},
				suggested,
				vocabulary
			);
			tags = merged.tags;
			Object.assign(updates, merged.updates);
		} catch {
			/* Ollama absent or busy — the pattern is imported as-is */
		}
	}

	// Semantic search is a bonus: an embedding failing must not abort the import.
	if (aiConfigured()) {
		try {
			const parts = [title, craft, tags.join(' '), extractedText?.slice(0, 800)].filter(Boolean).join(' ');
			updates.embedding = await embed(parts);
		} catch {
			/* Ollama absent or busy — the pattern is imported either way */
		}
	}

	if (Object.keys(updates).length) {
		await db.update(patterns).set(updates).where(eq(patterns.id, inserted.id));
	}

	return { ok: true, id: inserted.id, title };
}
