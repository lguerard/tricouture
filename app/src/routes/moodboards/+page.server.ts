import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { moodBoards, moodItems } from '$lib/server/db/schema';
import { deleteStored } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;
	const boards = await db
		.select({ id: moodBoards.id, title: moodBoards.title })
		.from(moodBoards)
		.where(eq(moodBoards.ownerId, uid))
		.orderBy(desc(moodBoards.createdAt));

	const items = boards.length
		? await db
				.select({ boardId: moodItems.boardId, imagePath: moodItems.imagePath })
				.from(moodItems)
				.where(inArray(moodItems.boardId, boards.map((b) => b.id)))
				.orderBy(desc(moodItems.createdAt))
		: [];

	return {
		boards: boards.map((b) => {
			const own = items.filter((i) => i.boardId === b.id);
			return {
				...b,
				itemCount: own.length,
				// Up to four recent images for the card's mosaic.
				previews: own.flatMap((i) => (i.imagePath ? [i.imagePath] : [])).slice(0, 4)
			};
		})
	};
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const title = String((await request.formData()).get('title') ?? '').trim().slice(0, 200);
		if (!title) return fail(400, { error: 'title required' });
		const board = (await db.insert(moodBoards).values({ ownerId: uid, title }).returning({ id: moodBoards.id }))[0];
		throw redirect(303, `/moodboards/${board.id}`);
	},

	delete: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const id = String((await request.formData()).get('id') ?? '');
		const board = (
			await db
				.select({ id: moodBoards.id })
				.from(moodBoards)
				.where(and(eq(moodBoards.id, id), eq(moodBoards.ownerId, uid)))
				.limit(1)
		)[0];
		if (!board) return fail(404, { error: 'Not found' });
		// Items go with the board (cascade); their image files don't.
		const images = await db
			.select({ path: moodItems.imagePath })
			.from(moodItems)
			.where(eq(moodItems.boardId, board.id));
		await db.delete(moodBoards).where(eq(moodBoards.id, board.id));
		for (const img of images) if (img.path) await deleteStored(img.path);
		return { ok: true };
	}
};
