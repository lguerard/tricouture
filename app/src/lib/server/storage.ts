import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { env } from '$env/dynamic/private';

const MEDIA_DIR = env.MEDIA_DIR || join(process.cwd(), 'media');

// Chemin absolu sur disque pour un chemin relatif stocké en base.
export function absolutePath(relative: string): string {
	const safe = normalize(relative).replace(/^(\.\.([/\\]|$))+/, '');
	return join(MEDIA_DIR, safe);
}

// Sauvegarde un fichier uploadé dans le dossier de l'utilisateur.
// Retourne le chemin relatif `<ownerId>/<uuid><ext>` (sert aussi de contrôle d'accès).
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

export async function deleteStored(relative: string): Promise<void> {
	try {
		await unlink(absolutePath(relative));
	} catch {
		// fichier déjà absent : on ignore
	}
}

// Vérifie qu'un chemin appartient bien à l'utilisateur (1er segment = ownerId).
export function ownsPath(ownerId: string, relative: string): boolean {
	return normalize(relative).split(sep).join('/').startsWith(`${ownerId}/`);
}
