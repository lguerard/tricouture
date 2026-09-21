import { json } from '@sveltejs/kit';
import { importOnePattern } from '$lib/server/patternImport';
import { normalizeInfoLanguage } from '$lib/server/ai/patternInfo';
import type { RequestHandler } from './$types';
import type { Craft } from '$lib/server/db/schema';

function parseCraft(v: string): Craft | null {
	return v === 'couture' || v === 'tricot' || v === 'crochet' ? v : null;
}

// One pattern per request: the batch importer (patterns/import) calls this
// once per selected file instead of sending the whole batch as one request,
// so an import of dozens of PDFs is many small requests rather than a single
// large one -- see $lib/server/patternImport.ts for why that matters.
export const POST: RequestHandler = async ({ request, locals }) => {
	const uid = locals.user!.id;
	const form = await request.formData();

	const craft = parseCraft(String(form.get('craft') ?? ''));
	if (!craft) return json({ error: 'invalid craft' }, { status: 400 });

	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'file required' }, { status: 400 });
	}

	const tags = String(form.get('tags') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const aiLanguage = normalizeInfoLanguage(form.get('aiLanguage'));

	const result = await importOnePattern({ uid, craft, tags, file, aiLanguage });
	return json(result);
};
