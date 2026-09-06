import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternFiles } from '$lib/server/db/schema';
import { saveUpload } from '$lib/server/storage';
import { extractPdfText } from '$lib/server/pdf';
import { embed, aiConfigured } from '$lib/server/ai/ollama';
import { t } from '$lib/i18n';
import type { Actions } from './$types';
import type { Craft } from '$lib/server/db/schema';

// A pattern collection arrives as a folder of PDFs, not one at a time. This
// creates ONE pattern per file -- the single-pattern form attaches every file
// to the same pattern, which is the opposite of what is wanted here.
const MAX_FILES = 60;

function parseCraft(v: string): Craft | null {
	return v === 'couture' || v === 'tricot' || v === 'crochet' ? v : null;
}

// "Pull_Aiguilles-No12_v2.pdf" -> "Pull Aiguilles No12 v2". Separators become
// spaces, the extension goes, and a trailing "(1)" from a duplicate download
// disappears. Titles stay editable afterwards -- this only has to be better
// than the raw filename.
function titleFromFilename(name: string): string {
	const base = name.replace(/\.[^.]+$/, '');
	const cleaned = base
		.replace(/[_+]+/g, ' ')
		.replace(/-+/g, ' ')
		.replace(/\s*\(\d+\)\s*$/, '')
		.replace(/\s+/g, ' ')
		.trim();
	return (cleaned || base).slice(0, 255);
}

export const actions: Actions = {
	default: async (event) => {
		const uid = event.locals.user!.id;
		const locale = event.locals.locale;
		const form = await event.request.formData();

		const craft = parseCraft(String(form.get('craft') ?? ''));
		if (!craft) return fail(400, { error: t(locale, 'patterns.import.error.craft') });

		const tags = String(form.get('tags') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		const all = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
		if (all.length === 0) return fail(400, { error: t(locale, 'patterns.import.error.noFiles') });
		if (all.length > MAX_FILES) {
			return fail(400, { error: t(locale, 'patterns.import.error.tooMany', { max: MAX_FILES }) });
		}

		// Anything that is not a PDF is reported rather than silently dropped:
		// a batch where three files vanished without a word is worse than none.
		const skipped: string[] = [];
		const created: { id: string; title: string }[] = [];

		for (const file of all) {
			const isPdf =
				file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
			if (!isPdf) {
				skipped.push(file.name);
				continue;
			}

			const title = titleFromFilename(file.name);
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

			// Semantic search is a bonus: one embedding failing must not abort an
			// import of sixty files that are otherwise fine.
			if (aiConfigured()) {
				try {
					const parts = [title, craft, tags.join(' '), extractedText?.slice(0, 800)]
						.filter(Boolean)
						.join(' ');
					const embedding = await embed(parts);
					await db.update(patterns).set({ embedding }).where(eq(patterns.id, inserted.id));
				} catch {
					/* Ollama absent or busy — the pattern is imported either way */
				}
			}

			created.push({ id: inserted.id, title });
		}

		return { created, skipped };
	}
};
