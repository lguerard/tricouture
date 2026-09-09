import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patternFiles, patterns } from '$lib/server/db/schema';
import { absolutePath, ownsPath } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// A file not owned by the user is still accessible if it belongs to a shared pattern.
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
	if (!locals.user) throw error(403, 'Access denied');
	if (!ownsPath(locals.user.id, rel) && !(await isSharedPatternFile(rel))) {
		throw error(403, 'Access denied');
	}

	const abs = absolutePath(rel);
	let size: number;
	try {
		size = (await stat(abs)).size;
	} catch {
		throw error(404, 'File not found');
	}

	const type = MIME[extname(rel).toLowerCase()] ?? 'application/octet-stream';
	// Readable.toWeb, et surtout PAS un cast du flux Node vers ReadableStream :
	// undici finissait par appeler close() sur un contrôleur déjà fermé, ce qui
	// lève ERR_INVALID_STATE dans une micro-tâche — donc hors de tout try/catch,
	// donc process Node terminé. Reproduit à la 2e image servie : il suffisait
	// d'ouvrir une page de stock, qui en charge plusieurs à la fois, pour couper
	// l'application pour tout le monde.
	const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
	return new Response(stream, {
		headers: {
			'content-type': type,
			'content-length': String(size),
			'cache-control': 'private, max-age=3600'
		}
	});
};
