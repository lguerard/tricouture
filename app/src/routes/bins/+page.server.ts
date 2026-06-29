import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { and, eq, desc, sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from '$lib/server/db';
import { storageBins, yarns, fabrics, notions, tools } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;
	const bins = await db
		.select()
		.from(storageBins)
		.where(eq(storageBins.ownerId, uid))
		.orderBy(desc(storageBins.createdAt));

	// QR encodant l'URL de consultation du bac (scannable depuis l'app mobile).
	const withQr = await Promise.all(
		bins.map(async (b) => ({
			...b,
			qrDataUrl: await QRCode.toDataURL(`tricouture://bin/${b.qrCode}`, { margin: 1, width: 200 })
		}))
	);

	// Compte d'items rangés par bac (laine + tissu + mercerie + outils).
	const counts = new Map<string, number>();
	for (const table of [yarns, fabrics, notions, tools]) {
		const rows = await db
			.select({ binId: table.binId, n: sql<number>`count(*)::int` })
			.from(table)
			.where(eq(table.ownerId, uid))
			.groupBy(table.binId);
		for (const r of rows) if (r.binId) counts.set(r.binId, (counts.get(r.binId) ?? 0) + r.n);
	}

	return { bins: withQr.map((b) => ({ ...b, itemCount: counts.get(b.id) ?? 0 })) };
};

export const actions: Actions = {
	add: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const label = String(form.get('label') ?? '').trim();
		if (!label) return fail(400, { error: 'Nom requis' });
		await db.insert(storageBins).values({
			ownerId: uid,
			label,
			location: String(form.get('location') ?? '').trim() || null,
			qrCode: randomUUID().slice(0, 12)
		});
		return { ok: true };
	},
	delete: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const id = String((await request.formData()).get('id') ?? '');
		await db.delete(storageBins).where(and(eq(storageBins.id, id), eq(storageBins.ownerId, uid)));
		return { ok: true };
	}
};
