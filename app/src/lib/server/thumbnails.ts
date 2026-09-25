// Resized WebP copies of stored photos, generated on first request and cached
// next to the original (`photo.jpg` → `photo.jpg.w400.webp`). A phone photo is
// 4–8 MB; a grid only needs a few dozen KB.
import sharp from 'sharp';
import { rename, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const THUMB_WIDTHS = [200, 400, 800] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

const RESIZABLE = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export function isThumbWidth(w: number): w is ThumbWidth {
	return (THUMB_WIDTHS as readonly number[]).includes(w);
}

export function isResizable(path: string): boolean {
	const lower = path.toLowerCase();
	return RESIZABLE.some((ext) => lower.endsWith(ext));
}

export function thumbPath(abs: string, width: ThumbWidth): string {
	return `${abs}.w${width}.webp`;
}

// Path of an up-to-date thumbnail, or null if the image can't be processed
// (the caller then serves the original).
export async function ensureThumbnail(abs: string, width: ThumbWidth): Promise<string | null> {
	const out = thumbPath(abs, width);
	try {
		const [src, cached] = await Promise.all([stat(abs), stat(out).catch(() => null)]);
		if (cached && cached.mtimeMs >= src.mtimeMs) return out;
		// Write to a temp name then rename: two requests racing on the same
		// thumbnail never serve a half-written file.
		const tmp = `${out}.${randomUUID()}.tmp`;
		await sharp(abs)
			.rotate() // honour EXIF orientation from phone cameras
			.resize({ width, withoutEnlargement: true })
			.webp({ quality: 78 })
			.toFile(tmp);
		await rename(tmp, out);
		return out;
	} catch {
		return null;
	}
}
