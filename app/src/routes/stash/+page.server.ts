import { fail } from '@sveltejs/kit';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { yarns, fabrics, notions, tools } from '$lib/server/db/schema';
import { saveUpload, deleteStored } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';
import type { toolType } from '$lib/server/db/schema';

function num(v: FormDataEntryValue | null): number | null {
	const n = parseFloat(String(v ?? ''));
	return Number.isFinite(n) ? n : null;
}
function str(v: FormDataEntryValue | null): string | null {
	const s = String(v ?? '').trim();
	return s.length ? s : null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;
	const [yarnList, fabricList, notionList, toolList] = await Promise.all([
		db.select().from(yarns).where(eq(yarns.ownerId, uid)).orderBy(desc(yarns.createdAt)),
		db.select().from(fabrics).where(eq(fabrics.ownerId, uid)).orderBy(desc(fabrics.createdAt)),
		db.select().from(notions).where(eq(notions.ownerId, uid)).orderBy(desc(notions.createdAt)),
		db.select().from(tools).where(eq(tools.ownerId, uid)).orderBy(desc(tools.createdAt))
	]);
	return { yarnList, fabricList, notionList, toolList };
};

export const actions: Actions = {
	addYarn: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		let photoPath: string | null = null;
		const photo = form.get('photo');
		if (photo instanceof File && photo.size > 0) {
			photoPath = (await saveUpload(uid, photo, 'yarns')).storedPath;
		}
		await db.insert(yarns).values({
			ownerId: uid,
			brand: str(form.get('brand')),
			name: str(form.get('name')),
			colorway: str(form.get('colorway')),
			colorHex: str(form.get('colorHex')),
			dyeLot: str(form.get('dyeLot')),
			weightCategory: str(form.get('weightCategory')),
			fiber: str(form.get('fiber')),
			yardsPerSkein: num(form.get('yardsPerSkein')),
			gramsPerSkein: num(form.get('gramsPerSkein')),
			skeins: num(form.get('skeins')) ?? 1,
			photoPath
		});
		return { ok: true };
	},

	addFabric: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		await db.insert(fabrics).values({
			ownerId: uid,
			name: str(form.get('name')),
			fabricType: str(form.get('fabricType')),
			composition: str(form.get('composition')),
			colorHex: str(form.get('colorHex')),
			lengthCm: num(form.get('lengthCm')),
			widthCm: num(form.get('widthCm'))
		});
		return { ok: true };
	},

	addNotion: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const name = str(form.get('name'));
		if (!name) return fail(400, { error: 'Nom requis' });
		await db.insert(notions).values({
			ownerId: uid,
			name,
			category: str(form.get('category')),
			quantity: num(form.get('quantity')) ?? 0
		});
		return { ok: true };
	},

	addTool: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const type = String(form.get('type') ?? '') as (typeof toolType.enumValues)[number];
		const valid = ['aiguille_droite', 'aiguille_circulaire', 'aiguille_double_pointe', 'crochet', 'autre'];
		if (!valid.includes(type)) return fail(400, { error: 'Type requis' });
		await db.insert(tools).values({
			ownerId: uid,
			type,
			sizeMm: num(form.get('sizeMm')),
			lengthCm: num(form.get('lengthCm')),
			quantity: num(form.get('quantity')) ?? 1
		});
		return { ok: true };
	},

	delete: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const kind = String(form.get('kind') ?? '');
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'id manquant' });

		if (kind === 'yarn') {
			const row = (
				await db.select({ photoPath: yarns.photoPath }).from(yarns)
					.where(and(eq(yarns.id, id), eq(yarns.ownerId, uid))).limit(1)
			)[0];
			if (row?.photoPath) await deleteStored(row.photoPath);
			await db.delete(yarns).where(and(eq(yarns.id, id), eq(yarns.ownerId, uid)));
		} else if (kind === 'fabric') {
			await db.delete(fabrics).where(and(eq(fabrics.id, id), eq(fabrics.ownerId, uid)));
		} else if (kind === 'notion') {
			await db.delete(notions).where(and(eq(notions.id, id), eq(notions.ownerId, uid)));
		} else if (kind === 'tool') {
			await db.delete(tools).where(and(eq(tools.id, id), eq(tools.ownerId, uid)));
		}
		return { ok: true };
	}
};
