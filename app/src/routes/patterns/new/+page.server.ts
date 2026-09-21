import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternFiles } from '$lib/server/db/schema';
import { saveUpload } from '$lib/server/storage';
import { extractPdfText } from '$lib/server/pdf';
import { embed, aiConfigured } from '$lib/server/ai/ollama';
import { suggestPatternInfo, mergePatternInfo, normalizeInfoLanguage } from '$lib/server/ai/patternInfo';
import { getPatternVocabulary } from '$lib/server/patternVocabulary';
import { t } from '$lib/i18n';
import type { Actions } from './$types';
import type { Craft } from '$lib/server/db/schema';

function parseCraft(v: string): Craft | null {
	return v === 'couture' || v === 'tricot' || v === 'crochet' ? v : null;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
	const n = parseInt(String(v ?? ''), 10);
	return Number.isFinite(n) ? n : null;
}

export const actions: Actions = {
	default: async (event) => {
		const uid = event.locals.user!.id;
		const form = await event.request.formData();

		const title = String(form.get('title') ?? '').trim();
		const craft = parseCraft(String(form.get('craft') ?? ''));
		if (!title || !craft) {
			return fail(400, { error: t(event.locals.locale, 'patterns.new.error.missingFields') });
		}

		let tags = String(form.get('tags') ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const garmentType = String(form.get('garmentType') ?? '').trim() || null;
		const designer = String(form.get('designer') ?? '').trim() || null;
		const language = String(form.get('language') ?? '').trim() || null;
		const difficulty = intOrNull(form.get('difficulty'));
		const sizes = String(form.get('sizes') ?? '').trim() || null;
		const gaugeStitches = intOrNull(form.get('gaugeStitches'));
		const gaugeRows = intOrNull(form.get('gaugeRows'));
		const yardageRequired = intOrNull(form.get('yardageRequired'));
		const aiLanguage = normalizeInfoLanguage(form.get('aiLanguage'));

		const inserted = (
			await db
				.insert(patterns)
				.values({
					ownerId: uid,
					title,
					craft,
					garmentType,
					designer,
					source: String(form.get('source') ?? '').trim() || null,
					language,
					difficulty,
					sizes,
					gaugeStitches,
					gaugeRows,
					yardageRequired,
					notes: String(form.get('notes') ?? '').trim() || null,
					tags
				})
				.returning({ id: patterns.id })
		)[0];

		// Files (PDF/images). The first PDF feeds the full-text search index.
		const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
		let extractedText: string | null = null;
		let first = true;
		for (const file of files) {
			const saved = await saveUpload(uid, file, 'patterns');
			await db.insert(patternFiles).values({
				patternId: inserted.id,
				filename: saved.filename,
				storedPath: saved.storedPath,
				mimeType: saved.mimeType,
				sizeBytes: saved.sizeBytes,
				isPrimary: first
			});
			first = false;
			if (!extractedText && saved.mimeType === 'application/pdf') {
				extractedText = await extractPdfText(Buffer.from(await file.arrayBuffer()));
			}
		}

		const updates: Record<string, unknown> = {};
		if (extractedText) updates.extractedText = extractedText;

		// Auto-fill only fields the form left empty -- an explicit choice is
		// never overridden. Best-effort, same policy as the embedding step below.
		// Gated on the user's own aiAutoFillEnabled setting (account page), on
		// top of aiConfigured() (whether Ollama is reachable at all).
		if (aiConfigured() && event.locals.user!.aiAutoFillEnabled) {
			try {
				const vocabulary = await getPatternVocabulary(uid);
				const suggested = await suggestPatternInfo(
					[title, extractedText].filter(Boolean).join('\n\n'),
					aiLanguage,
					vocabulary
				);
				const merged = mergePatternInfo(
					{ tags, garmentType, designer, language, difficulty, sizes, gaugeStitches, gaugeRows, yardageRequired },
					suggested,
					vocabulary
				);
				tags = merged.tags;
				Object.assign(updates, merged.updates);
			} catch {
				/* Ollama absent — the pattern is created as typed */
			}
		}

		if (aiConfigured()) {
			try {
				const parts = [title, craft, form.get('garmentType'), form.get('designer'), tags.join(' '), form.get('notes'), extractedText?.slice(0, 800)].filter(Boolean).join(' ');
				updates.embedding = await embed(parts);
			} catch { /* Ollama absent — semantic search unavailable */ }
		}

		if (Object.keys(updates).length) {
			await db.update(patterns).set(updates).where(eq(patterns.id, inserted.id));
		}

		throw redirect(303, `/patterns/${inserted.id}`);
	}
};
