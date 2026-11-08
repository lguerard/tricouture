// Cover for a pattern created before covers were found automatically: the
// same choice a new pattern gets (its first uploaded image, else a web search
// on designer + title), for the "find missing covers" button of the list.
import { and, asc, eq, isNull, like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patternFiles, patterns, type Pattern } from '$lib/server/db/schema';
import { autoFindCover, isStorableImage } from '$lib/server/cover-search';
import { saveDataUrl } from '$lib/server/storage';

// The new cover's path, or null when nothing was found (the pattern is left
// as it is). Only for a pattern of `uid` that has no cover yet.
export async function fillMissingCover(uid: string, id: string): Promise<string | null> {
	const [p] = await db
		.select()
		.from(patterns)
		.where(and(eq(patterns.id, id), eq(patterns.ownerId, uid), isNull(patterns.coverPath)))
		.limit(1);
	if (!p) return null;
	const path = (await firstImage(p)) ?? (await webCover(uid, p));
	if (!path) return null;
	// Still without a cover: one set by hand meanwhile wins.
	const done = await db
		.update(patterns)
		.set({ coverPath: path, updatedAt: new Date() })
		.where(and(eq(patterns.id, p.id), isNull(patterns.coverPath)))
		.returning({ id: patterns.id });
	return done.length ? path : null;
}

async function firstImage(p: Pattern): Promise<string | null> {
	const [f] = await db
		.select({ storedPath: patternFiles.storedPath })
		.from(patternFiles)
		.where(and(eq(patternFiles.patternId, p.id), like(patternFiles.mimeType, 'image/%')))
		.orderBy(asc(patternFiles.createdAt))
		.limit(1);
	return f?.storedPath ?? null;
}

async function webCover(uid: string, p: Pattern): Promise<string | null> {
	if (!p.designer) return null;
	const data = await autoFindCover({ designer: p.designer, title: p.title, craft: p.craft });
	if (!data || !isStorableImage(data)) return null;
	return (await saveDataUrl(uid, data, 'patterns/covers'))?.storedPath ?? null;
}
