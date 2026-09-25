import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { env } from '$env/dynamic/private';
import { THUMB_WIDTHS, thumbPath } from '$lib/server/thumbnails';

const MEDIA_DIR = env.MEDIA_DIR || join(process.cwd(), 'media');

// Returns the absolute disk path for a relative path stored in the database.
export function absolutePath(relative: string): string {
	const safe = normalize(relative).replace(/^(\.\.([/\\]|$))+/, '');
	return join(MEDIA_DIR, safe);
}

// Saves an uploaded file in the owner's directory.
// Returns the relative path `<ownerId>/<uuid><ext>` (also acts as an access-control anchor).
export async function saveUpload(
	ownerId: string,
	file: File,
	subdir = ''
): Promise<{ storedPath: string; sizeBytes: number; mimeType: string; filename: string }> {
	const ext = extname(file.name).toLowerCase().slice(0, 12);
	const rel = join(ownerId, subdir, `${randomUUID()}${ext}`).split(sep).join('/');
	const abs = absolutePath(rel);
	await mkdir(join(abs, '..'), { recursive: true });
	const buf = Buffer.from(await file.arrayBuffer());
	await writeFile(abs, buf);
	return {
		storedPath: rel,
		sizeBytes: buf.length,
		mimeType: file.type || 'application/octet-stream',
		filename: file.name
	};
}

const EXT_BY_MIME: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
	'image/gif': '.gif'
};

// Levée quand la photo est dans un format que /media/[...path] ne sait pas
// resservir : il ne connaît que les types ci-dessus et retombe sinon sur
// application/octet-stream, ce qui donne une image cassée dans le navigateur.
export class UnsupportedImageError extends Error {
	constructor(readonly mimeType: string) {
		super(`Unsupported image type: ${mimeType || 'unknown'}`);
		this.name = 'UnsupportedImageError';
	}
}

// Enregistre une photo de stock (pelote, tissu, mercerie, outil).
//
// Contrairement à saveUpload — qui sert aussi aux PDF de patrons et accepte
// donc tout — on valide ici le type AVANT d'écrire, et on tire l'extension du
// type MIME plutôt que du nom de fichier : un téléphone envoie volontiers
// « IMG_1234.HEIC », que saveUpload aurait stocké tel quel pour ne plus
// jamais pouvoir l'afficher, sur mobile comme sur fixe.
export async function saveImageUpload(
	ownerId: string,
	file: File,
	subdir = ''
): Promise<{ storedPath: string; sizeBytes: number; mimeType: string }> {
	const mimeType = (file.type || '').split(';')[0].trim().toLowerCase();
	const ext = EXT_BY_MIME[mimeType];
	if (!ext) throw new UnsupportedImageError(mimeType);
	const buf = Buffer.from(await file.arrayBuffer());
	const rel = join(ownerId, subdir, `${randomUUID()}${ext}`).split(sep).join('/');
	const abs = absolutePath(rel);
	await mkdir(join(abs, '..'), { recursive: true });
	await writeFile(abs, buf);
	return { storedPath: rel, sizeBytes: buf.length, mimeType };
}

// Saves a `data:<mime>;base64,<...>` string (e.g. a photo fetched server-side
// from a shop URL / barcode lookup) the same way saveUpload stores a File.
export async function saveDataUrl(
	ownerId: string,
	dataUrl: string,
	subdir = ''
): Promise<{ storedPath: string; sizeBytes: number; mimeType: string } | null> {
	const m = dataUrl.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/);
	if (!m) return null;
	const mimeType = m[1].toLowerCase();
	const ext = EXT_BY_MIME[mimeType];
	if (!ext) return null;
	const buf = Buffer.from(m[2], 'base64');
	if (buf.length === 0 || buf.length > 5_000_000) return null;
	const rel = join(ownerId, subdir, `${randomUUID()}${ext}`).split(sep).join('/');
	const abs = absolutePath(rel);
	await mkdir(join(abs, '..'), { recursive: true });
	await writeFile(abs, buf);
	return { storedPath: rel, sizeBytes: buf.length, mimeType };
}

export async function deleteStored(relative: string): Promise<void> {
	const abs = absolutePath(relative);
	// The original plus any cached thumbnails generated from it.
	for (const path of [abs, ...THUMB_WIDTHS.map((w) => thumbPath(abs, w))]) {
		try {
			await unlink(path);
		} catch {
			// file already gone (or thumbnail never generated) — ignore
		}
	}
}

// Checks that a path belongs to the given user (first segment must equal ownerId).
export function ownsPath(ownerId: string, relative: string): boolean {
	return normalize(relative).split(sep).join('/').startsWith(`${ownerId}/`);
}
