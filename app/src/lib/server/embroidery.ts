// Validation and file handling for the patch library (Écussons tab).
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { embroideryDesigns, type EmbroideryDesign } from '$lib/server/db/schema';
import { deleteStored, saveImageUpload, saveUpload } from '$lib/server/storage';
import { readPes, type PesDesign } from '$lib/embroidery/pesRead';
import type { DesignMeta } from '$lib/server/embroideryMeta';

export { parseMeta, type DesignMeta } from '$lib/server/embroideryMeta';

const MAX_IMAGE_BYTES = 5_000_000;
const MAX_PES_BYTES = 5_000_000;

export class DesignInputError extends Error {}

function file(form: FormData, name: string): File {
	const f = form.get(name);
	if (!(f instanceof File) || f.size === 0) throw new DesignInputError(`missing ${name}`);
	return f;
}

// Saves the files of a design and returns everything to store for it. A
// patch from the editor sends its picture, preview and .pes; an imported one
// only the .pes and a preview drawn from it (the preview is its picture), and
// its size, stitch count and threads are taken from the file itself.
export async function saveDesignFiles(uid: string, form: FormData, meta: DesignMeta) {
	const imported = meta.source === 'import';
	const image = imported ? null : file(form, 'image');
	const preview = file(form, 'preview');
	const pes = file(form, 'pes');
	if ((image && image.size > MAX_IMAGE_BYTES) || preview.size > MAX_IMAGE_BYTES) throw new DesignInputError('image too large');
	if (pes.size > MAX_PES_BYTES) throw new DesignInputError('pes too large');
	const bytes = new Uint8Array(await pes.arrayBuffer());
	let read: PesDesign;
	try {
		read = readPes(bytes);
	} catch {
		throw new DesignInputError('not a PES file');
	}
	const values = { ...meta };
	if (imported) {
		if (read.threads.length > 64) throw new DesignInputError('too many colours');
		Object.assign(values, { threads: read.threads, widthMm: read.widthMm, heightMm: read.heightMm, stitchCount: read.stitchCount });
	}
	const saved: string[] = [];
	try {
		const prev = await saveImageUpload(uid, preview, 'embroidery');
		saved.push(prev.storedPath);
		const img = image ? await saveImageUpload(uid, image, 'embroidery') : prev;
		saved.push(img.storedPath);
		const p = await saveUpload(uid, new File([bytes], 'design.pes'), 'embroidery');
		saved.push(p.storedPath);
		return { ...values, imagePath: img.storedPath, previewPath: prev.storedPath, pesPath: p.storedPath };
	} catch (e) {
		await Promise.all([...new Set(saved)].map(deleteStored));
		throw e;
	}
}

// An imported patch's picture is its preview: each file once.
export const filesOf = (d: Pick<EmbroideryDesign, 'imagePath' | 'previewPath' | 'pesPath'>) => [...new Set([d.imagePath, d.previewPath, d.pesPath])];

export async function ownDesign(uid: string, id: string) {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const [row] = await db
		.select()
		.from(embroideryDesigns)
		.where(and(eq(embroideryDesigns.id, id), eq(embroideryDesigns.ownerId, uid)))
		.limit(1);
	return row ?? null;
}
