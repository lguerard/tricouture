import { error, fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { moodBoards, moodItems } from '$lib/server/db/schema';
import { absolutePath, deleteStored, isSupportedImage, saveImageUpload } from '$lib/server/storage';
import { t } from '$lib/i18n';
import { extractPalette } from '$lib/server/palette';
import { isUuid } from '$lib/uuid';
import type { Actions, PageServerLoad } from './$types';

async function ownedBoard(uid: string, id: string) {
	if (!isUuid(id)) return undefined;
	return (
		await db
			.select()
			.from(moodBoards)
			.where(and(eq(moodBoards.id, id), eq(moodBoards.ownerId, uid)))
			.limit(1)
	)[0];
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const board = await ownedBoard(locals.user!.id, params.id);
	if (!board) throw error(404, 'Board not found');
	const items = await db
		.select()
		.from(moodItems)
		.where(eq(moodItems.boardId, board.id))
		.orderBy(desc(moodItems.createdAt));
	return { board, items };
};

const MAX_IMAGES_PER_UPLOAD = 12;

// Only http(s) links are kept: anything else would end up in an href.
function cleanUrl(raw: FormDataEntryValue | null): string | null {
	const s = String(raw ?? '').trim();
	if (!s) return null;
	try {
		const url = new URL(s);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href.slice(0, 2000) : null;
	} catch {
		return null;
	}
}

export const actions: Actions = {
	rename: async ({ locals, params, request }) => {
		const board = await ownedBoard(locals.user!.id, params.id);
		if (!board) return fail(404, { error: 'Not found' });
		const title = String((await request.formData()).get('title') ?? '').trim().slice(0, 200);
		if (!title) return fail(400, { error: 'title required' });
		await db.update(moodBoards).set({ title }).where(eq(moodBoards.id, board.id));
		return { ok: true };
	},

	// One item per uploaded image (sharing the note and link), or a single
	// image-less item when only a link or a note is given.
	addItem: async ({ locals, params, request }) => {
		const uid = locals.user!.id;
		const board = await ownedBoard(uid, params.id);
		if (!board) return fail(404, { error: 'Not found' });
		const form = await request.formData();
		const files = form
			.getAll('images')
			.filter((f): f is File => f instanceof File && f.size > 0)
			.slice(0, MAX_IMAGES_PER_UPLOAD);
		const note = String(form.get('note') ?? '').trim().slice(0, 2000) || null;
		const rawUrl = String(form.get('sourceUrl') ?? '').trim();
		const sourceUrl = cleanUrl(rawUrl);
		const locale = locals.locale;
		if (rawUrl && !sourceUrl) return fail(400, { itemError: t(locale, 'moodboards.errorLink') });
		if (files.length === 0 && !note && !sourceUrl) return fail(400, { itemError: t(locale, 'moodboards.errorEmpty') });
		if (!files.every(isSupportedImage)) return fail(400, { itemError: t(locale, 'moodboards.errorFormat') });

		if (files.length === 0) {
			await db.insert(moodItems).values({ boardId: board.id, note, sourceUrl });
			return { ok: true };
		}
		for (const file of files) {
			const imagePath = (await saveImageUpload(uid, file, 'moodboards')).storedPath;
			// Best-effort: an image sharp can't read still gets pinned, just
			// without swatches.
			const palette = await extractPalette(absolutePath(imagePath)).catch(() => []);
			await db.insert(moodItems).values({ boardId: board.id, imagePath, note, sourceUrl, palette });
		}
		return { ok: true };
	},

	deleteItem: async ({ locals, params, request }) => {
		const board = await ownedBoard(locals.user!.id, params.id);
		if (!board) return fail(404, { error: 'Not found' });
		const itemId = String((await request.formData()).get('itemId') ?? '');
		if (!isUuid(itemId)) return fail(400, { error: 'itemId required' });
		const item = (
			await db
				.delete(moodItems)
				.where(and(eq(moodItems.id, itemId), eq(moodItems.boardId, board.id)))
				.returning({ imagePath: moodItems.imagePath })
		)[0];
		if (item?.imagePath) await deleteStored(item.imagePath);
		return { ok: true };
	}
};
