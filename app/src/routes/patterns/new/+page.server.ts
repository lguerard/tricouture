import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternFiles } from '$lib/server/db/schema';
import { saveUpload } from '$lib/server/storage';
import { extractPdfText } from '$lib/server/pdf';
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
			return fail(400, { error: 'Titre et type de craft requis.' });
		}

		const tags = String(form.get('tags') ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);

		const inserted = (
			await db
				.insert(patterns)
				.values({
					ownerId: uid,
					title,
					craft,
					garmentType: String(form.get('garmentType') ?? '').trim() || null,
					designer: String(form.get('designer') ?? '').trim() || null,
					source: String(form.get('source') ?? '').trim() || null,
					language: String(form.get('language') ?? '').trim() || null,
					difficulty: intOrNull(form.get('difficulty')),
					sizes: String(form.get('sizes') ?? '').trim() || null,
					gaugeStitches: intOrNull(form.get('gaugeStitches')),
					gaugeRows: intOrNull(form.get('gaugeRows')),
					yardageRequired: intOrNull(form.get('yardageRequired')),
					notes: String(form.get('notes') ?? '').trim() || null,
					tags
				})
				.returning({ id: patterns.id })
		)[0];

		// Fichiers (PDF/images). Le 1er PDF alimente le texte de recherche.
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

		if (extractedText) {
			await db
				.update(patterns)
				.set({ extractedText })
				.where(eq(patterns.id, inserted.id));
		}

		throw redirect(303, `/patterns/${inserted.id}`);
	}
};
