import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { env } from '$env/dynamic/private';

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

export async function deleteStored(relative: string): Promise<void> {
	try {
		await unlink(absolutePath(relative));
	} catch {
		// file already gone — ignore
	}
}

// Checks that a path belongs to the given user (first segment must equal ownerId).
export function ownsPath(ownerId: string, relative: string): boolean {
	return normalize(relative).split(sep).join('/').startsWith(`${ownerId}/`);
}
