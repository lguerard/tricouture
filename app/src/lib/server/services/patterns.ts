// Pattern changes shared by the pattern pages / AI routes and the assistant.
import { and, eq } from 'drizzle-orm';
import { lookup } from 'node:dns/promises';
import { db } from '$lib/server/db';
import { patternFiles, patternPieces, patterns } from '$lib/server/db/schema';
import { deleteStored, saveDataUrl } from '$lib/server/storage';
import { dropSharesOf } from '$lib/server/access';
import { generate } from '$lib/server/ai/ollama';
import { PIECES_SYSTEM, piecesPrompt } from '$lib/server/ai/prompts';
import { parsePiecesResult, PIECES_GENERATE_OPTIONS } from '$lib/server/ai/pieces';
import { mergePatternInfo, suggestPatternInfo, type InfoLanguage } from '$lib/server/ai/patternInfo';
import { getPatternVocabulary } from '$lib/server/patternVocabulary';
import { isStorableImage, resolveImageFromUrl } from '$lib/server/cover-search';

// Covers downloaded from the web are standalone files; a cover reusing an
// uploaded pattern image must survive (it is deleted with the files).
export async function dropCover(patternId: string, coverPath: string | null) {
	if (!coverPath) return;
	const isFile = (
		await db
			.select({ id: patternFiles.id })
			.from(patternFiles)
			.where(and(eq(patternFiles.patternId, patternId), eq(patternFiles.storedPath, coverPath)))
			.limit(1)
	)[0];
	if (!isFile) await deleteStored(coverPath);
}

// Cover from an image URL or a web page's main image; false when none usable.
export async function setCoverFromUrl(uid: string, p: { id: string; coverPath: string | null }, url: string): Promise<boolean> {
	const data = await resolveImageFromUrl(url);
	const saved = data && isStorableImage(data) ? await saveDataUrl(uid, data, 'patterns/covers') : null;
	if (!saved) return false;
	await dropCover(p.id, p.coverPath);
	await db.update(patterns).set({ coverPath: saved.storedPath, updatedAt: new Date() }).where(eq(patterns.id, p.id));
	return true;
}

export async function removeCover(p: { id: string; coverPath: string | null }) {
	await dropCover(p.id, p.coverPath);
	await db.update(patterns).set({ coverPath: null, updatedAt: new Date() }).where(eq(patterns.id, p.id));
}

// Owner only (checked by the caller): cover, files on disk, shares, rows.
export async function deletePattern(p: { id: string; coverPath: string | null }) {
	await dropCover(p.id, p.coverPath);
	const files = await db.select({ storedPath: patternFiles.storedPath }).from(patternFiles).where(eq(patternFiles.patternId, p.id));
	for (const f of files) await deleteStored(f.storedPath);
	await dropSharesOf('pattern', p.id);
	await db.delete(patterns).where(eq(patterns.id, p.id));
}

export type DetectedPiece = { id: string; name: string; position: number; defaultTotalRows: number | null; quantity: number | null };

// AI piece detection from the pattern's text, merged with what is stored.
// 'no-text': nothing to read; 'empty': the model found nothing usable. Throws
// AiUnavailable when Ollama is down.
export async function detectPieces(p: {
	id: string;
	title: string;
	notes: string | null;
	extractedText: string | null;
	craft: string;
}): Promise<DetectedPiece[] | 'no-text' | 'empty'> {
	if (!p.extractedText) return 'no-text';
	const context = [p.title, p.notes, p.extractedText].filter(Boolean).join('\n\n');
	const result = parsePiecesResult(await generate(piecesPrompt(context, p.craft), PIECES_SYSTEM, undefined, PIECES_GENERATE_OPTIONS));
	// Nothing usable (reasoning, prose, truncated JSON): leave the stored
	// pieces untouched rather than "merging" them with an empty list.
	const parsed = result.pieces;
	if (result.source === 'none' || !parsed.length) return 'empty';

	// Merge with what is already stored: keep (and reposition) pieces whose
	// name still matches so a project's per-piece progress on them survives
	// re-analysis; drop the ones no longer detected; insert the new ones.
	// Dropping only happens for a structured (JSON) reply: a list salvaged
	// from plain text is too unreliable to delete anything on its strength
	// (and a project's per-piece progress would go with it).
	// A newly detected rows/quantity always wins; when this pass doesn't spot
	// one (a smaller local model can miss it), the previously stored value is
	// kept rather than wiped, so re-analysis only ever adds information.
	const existing = await db.select().from(patternPieces).where(eq(patternPieces.patternId, p.id));
	const existingByName = new Map(existing.map((x) => [x.name.trim().toLowerCase(), x]));
	const keepIds = new Set<string>();
	const finalRows: DetectedPiece[] = [];

	for (let i = 0; i < parsed.length; i++) {
		const { name, rows, quantity } = parsed[i];
		const match = existingByName.get(name.trim().toLowerCase());
		const defaultTotalRows = rows ?? match?.defaultTotalRows ?? null;
		const qty = quantity ?? match?.quantity ?? null;
		if (match) {
			keepIds.add(match.id);
			if (match.position !== i || match.defaultTotalRows !== defaultTotalRows || match.quantity !== qty) {
				await db.update(patternPieces).set({ position: i, defaultTotalRows, quantity: qty }).where(eq(patternPieces.id, match.id));
			}
			finalRows.push({ id: match.id, name: match.name, position: i, defaultTotalRows, quantity: qty });
		} else {
			const inserted = (
				await db.insert(patternPieces).values({ patternId: p.id, name, position: i, defaultTotalRows, quantity: qty }).returning()
			)[0];
			finalRows.push({ id: inserted.id, name: inserted.name, position: i, defaultTotalRows: inserted.defaultTotalRows, quantity: inserted.quantity });
		}
	}

	if (result.source === 'json') {
		for (const stale of existing.filter((x) => !keepIds.has(x.id))) {
			await db.delete(patternPieces).where(eq(patternPieces.id, stale.id));
		}
	} else {
		// Kept pieces go after the newly listed ones, in their former order.
		const kept = existing.filter((x) => !keepIds.has(x.id)).sort((a, b) => a.position - b.position);
		for (const x of kept) {
			const position = finalRows.length;
			if (x.position !== position) await db.update(patternPieces).set({ position }).where(eq(patternPieces.id, x.id));
			finalRows.push({ id: x.id, name: x.name, position, defaultTotalRows: x.defaultTotalRows, quantity: x.quantity });
		}
	}
	return finalRows.sort((a, b) => a.position - b.position);
}

// AI auto-fill of the empty info fields from the pattern's text. Returns what
// was written (empty: nothing found). Throws AiUnavailable when Ollama is down.
export async function fillPatternInfo(uid: string, patternId: string, language: InfoLanguage) {
	const pat = (
		await db
			.select({
				title: patterns.title,
				craft: patterns.craft,
				notes: patterns.notes,
				extractedText: patterns.extractedText,
				tags: patterns.tags,
				garmentType: patterns.garmentType,
				designer: patterns.designer,
				language: patterns.language,
				difficulty: patterns.difficulty,
				sizes: patterns.sizes,
				gaugeStitches: patterns.gaugeStitches,
				gaugeRows: patterns.gaugeRows,
				yardageRequired: patterns.yardageRequired
			})
			.from(patterns)
			.where(and(eq(patterns.id, patternId), eq(patterns.ownerId, uid)))
			.limit(1)
	)[0];
	if (!pat) return null;
	const context = [pat.title, pat.notes, pat.extractedText].filter(Boolean).join('\n\n');
	const vocabulary = await getPatternVocabulary(uid);
	const suggested = await suggestPatternInfo(context, language, vocabulary, { craft: pat.craft, garmentType: pat.garmentType });
	const { tags, updates } = mergePatternInfo(
		{
			tags: pat.tags ?? [],
			garmentType: pat.garmentType,
			designer: pat.designer,
			language: pat.language,
			difficulty: pat.difficulty,
			sizes: pat.sizes,
			gaugeStitches: pat.gaugeStitches,
			gaugeRows: pat.gaugeRows,
			yardageRequired: pat.yardageRequired
		},
		suggested,
		vocabulary
	);
	if (Object.keys(updates).length) {
		await db.update(patterns).set({ ...updates, updatedAt: new Date() }).where(eq(patterns.id, patternId));
	}
	return { tags, updates };
}

// --- Reading a pattern's web page (title, designer) ---------------------------

const MAX_HOPS = 3;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;

// Block anything resolving to a private / loopback / link-local address so the
// server can't be used to probe the internal network (SSRF).
function isPrivateAddress(ip: string): boolean {
	const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
	if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
		const [a, b] = v4.split('.').map(Number);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 169 && b === 254) || // link-local
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
			a >= 224 // multicast and reserved
		);
	}
	const v6 = ip.toLowerCase();
	return (
		v6 === '::' ||
		v6 === '::1' ||
		v6.startsWith('fc') ||
		v6.startsWith('fd') || // unique local
		v6.startsWith('fe80') // link-local
	);
}

async function publicUrlOrNull(raw: string): Promise<URL | null> {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return null;
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
	try {
		const addrs = await lookup(u.hostname, { all: true });
		if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) return null;
	} catch {
		return null;
	}
	return u;
}

function meta(html: string, prop: string): string | null {
	const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
	const m = html.match(re) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
	return m ? m[1].trim() : null;
}

function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&nbsp;/g, ' ');
}

export type PatternPage =
	| { ok: true; title: string | null; designer: string | null; source: string }
	| { ok: false; error: 'unsupported-url' | 'unreachable' | 'not-html' };

// Title and designer of a pattern's web page (Ravelry, a designer's shop...),
// following at most MAX_HOPS redirects, each checked against private addresses.
export async function readPatternPage(url: string): Promise<PatternPage> {
	const entry = await publicUrlOrNull(url.trim());
	if (!entry) return { ok: false, error: 'unsupported-url' };
	let target: URL = entry;

	let html = '';
	for (let hop = 0; hop <= MAX_HOPS; hop++) {
		let res: Response;
		try {
			res = await fetch(target, {
				redirect: 'manual',
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: { accept: 'text/html,application/xhtml+xml' }
			});
		} catch {
			return { ok: false, error: 'unreachable' };
		}

		if (res.status >= 300 && res.status < 400) {
			const next = res.headers.get('location');
			const checked: URL | null = next ? await publicUrlOrNull(new URL(next, target).href) : null;
			if (!checked) return { ok: false, error: 'unsupported-url' };
			target = checked;
			continue;
		}
		if (!res.ok) return { ok: false, error: 'unreachable' };
		if (!(res.headers.get('content-type') ?? '').includes('html')) return { ok: false, error: 'not-html' };

		const reader = res.body?.getReader();
		if (!reader) return { ok: false, error: 'unreachable' };
		const chunks: Uint8Array[] = [];
		let size = 0;
		while (size < MAX_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			size += value.length;
		}
		await reader.cancel().catch(() => {});
		html = new TextDecoder().decode(
			chunks.reduce((acc, c) => {
				const out = new Uint8Array(acc.length + c.length);
				out.set(acc);
				out.set(c, acc.length);
				return out;
			}, new Uint8Array())
		);
		break;
	}

	if (!html) return { ok: false, error: 'unreachable' };

	const rawTitle = meta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
	const rawAuthor = meta(html, 'author') ?? meta(html, 'article:author') ?? '';
	return {
		ok: true,
		title: decodeEntities(rawTitle).trim().slice(0, 255) || null,
		designer: decodeEntities(rawAuthor).trim().slice(0, 160) || null,
		source: target.href
	};
}
