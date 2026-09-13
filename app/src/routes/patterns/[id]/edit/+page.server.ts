import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternFiles } from '$lib/server/db/schema';
import { saveUpload } from '$lib/server/storage';
import { extractPdfText } from '$lib/server/pdf';
import { embed, aiConfigured } from '$lib/server/ai/ollama';
import { t } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';
import type { Craft } from '$lib/server/db/schema';

function parseCraft(v: string): Craft | null {
	return v === 'couture' || v === 'tricot' || v === 'crochet' ? v : null;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
	const n = parseInt(String(v ?? ''), 10);
	return Number.isFinite(n) ? n : null;
}

async function ownedPattern(uid: string, id: string) {
	return (
		await db
			.select()
			.from(patterns)
			.where(and(eq(patterns.id, id), eq(patterns.ownerId, uid)))
			.limit(1)
	)[0];
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const uid = locals.user!.id;
	const pattern = await ownedPattern(uid, params.id);
	if (!pattern) throw error(404, 'Pattern not found');
	return { pattern };
};

export const actions: Actions = {
	default: async (event) => {
		const uid = event.locals.user!.id;
		const pattern = await ownedPattern(uid, event.params.id);
		if (!pattern) return fail(403, { error: 'Owner only' });

		const form = await event.request.formData();

		const title = String(form.get('title') ?? '').trim();
		const craft = parseCraft(String(form.get('craft') ?? ''));
		if (!title || !craft) {
			return fail(400, { error: t(event.locals.locale, 'patterns.new.error.missingFields') });
		}

		const tags = String(form.get('tags') ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);

		const updates: Record<string, unknown> = {
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
			tags,
			updatedAt: new Date()
		};

		// Extra files (PDF/images) added on top of the ones already attached.
		const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
		if (files.length) {
			const hadFiles = (
				await db.select({ id: patternFiles.id }).from(patternFiles).where(eq(patternFiles.patternId, pattern.id)).limit(1)
			).length > 0;
			let first = !hadFiles;
			let extractedText: string | null = null;
			for (const file of files) {
				const saved = await saveUpload(uid, file, 'patterns');
				await db.insert(patternFiles).values({
					patternId: pattern.id,
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
			if (extractedText) updates.extractedText = extractedText;
		}

		if (aiConfigured()) {
			try {
				const parts = [title, craft, updates.garmentType, updates.designer, tags.join(' '), updates.notes, (updates.extractedText as string | undefined)?.slice(0, 800)]
					.filter(Boolean)
					.join(' ');
				updates.embedding = await embed(parts);
			} catch {
				/* Ollama absent — semantic search unavailable */
			}
		}

		await db.update(patterns).set(updates).where(eq(patterns.id, pattern.id));

		throw redirect(303, `/patterns/${pattern.id}`);
	}
};
