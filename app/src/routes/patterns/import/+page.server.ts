import { fail } from '@sveltejs/kit';
import { t } from '$lib/i18n';
import { importOnePattern } from '$lib/server/patternImport';
import { normalizeInfoLanguage } from '$lib/server/ai/patternInfo';
import type { Actions } from './$types';
import type { Craft } from '$lib/server/db/schema';

// A pattern collection arrives as a folder of PDFs, not one at a time. This
// creates ONE pattern per file -- the single-pattern form attaches every file
// to the same pattern, which is the opposite of what is wanted here. Kept in
// sync with the client-side MAX_FILES in +page.svelte (SvelteKit only allows
// a fixed set of names to be exported from a +page.server.ts, so it can't be
// imported from there).
const MAX_FILES = 60;

function parseCraft(v: string): Craft | null {
	return v === 'couture' || v === 'tricot' || v === 'crochet' ? v : null;
}

// No-JS fallback only: with JS, +page.svelte instead uploads each file
// individually against /api/patterns/import-one, so a big batch is many
// small requests rather than one that can OOM the app or exceed a reverse
// proxy's body-size limit. Without JS, the browser has no choice but to send
// every file in one request, same as before.
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
		const aiLanguage = normalizeInfoLanguage(form.get('aiLanguage'));

		const all = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
		if (all.length === 0) return fail(400, { error: t(locale, 'patterns.import.error.noFiles') });
		if (all.length > MAX_FILES) {
			return fail(400, { error: t(locale, 'patterns.import.error.tooMany', { max: MAX_FILES }) });
		}

		const aiAutoFillEnabled = event.locals.user!.aiAutoFillEnabled;
		const skipped: string[] = [];
		const created: { id: string; title: string }[] = [];
		for (const file of all) {
			const result = await importOnePattern({ uid, craft, tags, file, aiLanguage, aiAutoFillEnabled });
			if (result.ok) created.push({ id: result.id, title: result.title });
			else skipped.push(result.name);
		}

		return { created, skipped };
	}
};
