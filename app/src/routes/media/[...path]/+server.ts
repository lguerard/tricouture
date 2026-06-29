import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patternFiles, patterns } from '$lib/server/db/schema';
import { absolutePath, ownsPath } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// Un fichier non possédé reste accessible s'il appartient à un patron partagé.
async function isSharedPatternFile(rel: string): Promise<boolean> {
	const row = (
		await db
			.select({ shared: patterns.isShared })
			.from(patternFiles)
			.innerJoin(patterns, eq(patternFiles.patternId, patterns.id))
			.where(and(eq(patternFiles.storedPath, rel), eq(patterns.isShared, true)))
			.limit(1)
	)[0];
	return !!row;
}

const MIME: Record<string, string> = {
	'.pdf': 'application/pdf',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif'
};

export const GET: RequestHandler = async ({ params, locals }) => {
	const rel = params.path;
	if (!locals.user) throw error(403, 'Accès refusé');
	if (!ownsPath(locals.user.id, rel) && !(await isSharedPatternFile(rel))) {
		throw error(403, 'Accès refusé');
	}

	const abs = absolutePath(rel);
	let size: number;
	try {
		size = (await stat(abs)).size;
	} catch {
		throw error(404, 'Fichier introuvable');
	}

	const type = MIME[extname(rel).toLowerCase()] ?? 'application/octet-stream';
	const stream = createReadStream(abs);
	return new Response(stream as unknown as ReadableStream, {
		headers: {
			'content-type': type,
			'content-length': String(size),
			'cache-control': 'private, max-age=3600'
		}
	});
};
