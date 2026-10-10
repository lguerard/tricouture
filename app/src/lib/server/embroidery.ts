// Validation and file handling for the patch library (Écussons tab).
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { embroideryDesigns, type EmbroideryDesign } from '$lib/server/db/schema';
import { deleteStored, saveImageUpload, saveUpload } from '$lib/server/storage';

export { parseMeta, type DesignMeta } from '$lib/server/embroideryMeta';

const MAX_IMAGE_BYTES = 5_000_000;
const MAX_PES_BYTES = 3_000_000;

export class DesignInputError extends Error {}

function file(form: FormData, name: string): File {
	const f = form.get(name);
	if (!(f instanceof File) || f.size === 0) throw new DesignInputError(`missing ${name}`);
	return f;
}

// Saves the three files of a design; the caller stores the returned paths.
export async function saveDesignFiles(uid: string, form: FormData) {
	const image = file(form, 'image');
	const preview = file(form, 'preview');
	const pes = file(form, 'pes');
	if (image.size > MAX_IMAGE_BYTES || preview.size > MAX_IMAGE_BYTES) throw new DesignInputError('image too large');
	if (pes.size > MAX_PES_BYTES) throw new DesignInputError('pes too large');
	const head = new TextDecoder().decode(new Uint8Array(await pes.slice(0, 8).arrayBuffer()));
	if (head !== '#PES0001') throw new DesignInputError('not a PES file');
	const saved: string[] = [];
	try {
		const img = await saveImageUpload(uid, image, 'embroidery');
		saved.push(img.storedPath);
		const prev = await saveImageUpload(uid, preview, 'embroidery');
		saved.push(prev.storedPath);
		const p = await saveUpload(uid, new File([pes], 'design.pes'), 'embroidery');
		saved.push(p.storedPath);
		return { imagePath: img.storedPath, previewPath: prev.storedPath, pesPath: p.storedPath };
	} catch (e) {
		await Promise.all(saved.map(deleteStored));
		throw e;
	}
}

export const filesOf = (d: Pick<EmbroideryDesign, 'imagePath' | 'previewPath' | 'pesPath'>) => [d.imagePath, d.previewPath, d.pesPath];

export async function ownDesign(uid: string, id: string) {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const [row] = await db
		.select()
		.from(embroideryDesigns)
		.where(and(eq(embroideryDesigns.id, id), eq(embroideryDesigns.ownerId, uid)))
		.limit(1);
	return row ?? null;
}
