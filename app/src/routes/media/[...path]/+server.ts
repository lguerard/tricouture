import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { absolutePath, ownsPath } from '$lib/server/storage';
import type { RequestHandler } from './$types';

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
	if (!locals.user || !ownsPath(locals.user.id, rel)) {
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
