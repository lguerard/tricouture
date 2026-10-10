import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { embroideryDesigns } from '$lib/server/db/schema';
import { DesignInputError, parseMeta, saveDesignFiles } from '$lib/server/embroidery';
import { UnsupportedImageError } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// Adds a patch to the library (multipart: meta JSON + image, preview, pes).
export const POST: RequestHandler = async ({ request, locals }) => {
	const uid = locals.user!.id;
	const form = await request.formData();
	const meta = parseMeta(form.get('meta'));
	if (!meta) throw error(400, 'Invalid design');
	try {
		const paths = await saveDesignFiles(uid, form);
		const [row] = await db
			.insert(embroideryDesigns)
			.values({ ownerId: uid, ...meta, ...paths })
			.returning({ id: embroideryDesigns.id });
		return json({ id: row.id }, { status: 201 });
	} catch (e) {
		if (e instanceof DesignInputError || e instanceof UnsupportedImageError) throw error(400, e.message);
		throw e;
	}
};
