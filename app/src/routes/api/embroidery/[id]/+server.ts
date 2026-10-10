import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { embroideryDesigns } from '$lib/server/db/schema';
import { DesignInputError, filesOf, ownDesign, parseMeta, saveDesignFiles } from '$lib/server/embroidery';
import { deleteStored, UnsupportedImageError } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// Saves a new version of a patch (same multipart body as POST); the old files
// are removed once the new ones are in place.
export const PUT: RequestHandler = async ({ request, locals, params }) => {
	const uid = locals.user!.id;
	const old = await ownDesign(uid, params.id);
	if (!old) throw error(404, 'Not found');
	const form = await request.formData();
	const meta = parseMeta(form.get('meta'));
	if (!meta) throw error(400, 'Invalid design');
	try {
		const paths = await saveDesignFiles(uid, form);
		await db
			.update(embroideryDesigns)
			.set({ ...meta, ...paths, updatedAt: new Date() })
			.where(eq(embroideryDesigns.id, old.id));
		await Promise.all(filesOf(old).map(deleteStored));
		return json({ id: old.id });
	} catch (e) {
		if (e instanceof DesignInputError || e instanceof UnsupportedImageError) throw error(400, e.message);
		throw e;
	}
};

// Deletes a patch for good: the database row and its three files.
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const uid = locals.user!.id;
	const row = await ownDesign(uid, params.id);
	if (!row) throw error(404, 'Not found');
	await db.delete(embroideryDesigns).where(eq(embroideryDesigns.id, row.id));
	await Promise.all(filesOf(row).map(deleteStored));
	return new Response(null, { status: 204 });
};
