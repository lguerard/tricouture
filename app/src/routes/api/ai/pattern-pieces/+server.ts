import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternPieces } from '$lib/server/db/schema';
import { generate, AiUnavailable } from '$lib/server/ai/ollama';
import { PIECES_SYSTEM, piecesPrompt } from '$lib/server/ai/prompts';
import { parsePiecesResult, PIECES_GENERATE_OPTIONS, type PiecesParseResult } from '$lib/server/ai/pieces';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => ({}));
	const patternId = String(body?.patternId ?? '');
	if (!patternId) return json({ error: 'patternId required' }, { status: 400 });

	const pat = (
		await db
			.select({ title: patterns.title, notes: patterns.notes, extractedText: patterns.extractedText, craft: patterns.craft })
			.from(patterns)
			.where(and(eq(patterns.id, patternId), eq(patterns.ownerId, locals.user!.id)))
			.limit(1)
	)[0];
	if (!pat) return json({ error: 'Pattern not found' }, { status: 404 });
	if (!pat.extractedText) return json({ error: 'no-text' }, { status: 422 });

	let result: PiecesParseResult;
	try {
		const context = [pat.title, pat.notes, pat.extractedText].filter(Boolean).join('\n\n');
		result = parsePiecesResult(
			await generate(piecesPrompt(context, pat.craft), PIECES_SYSTEM, undefined, PIECES_GENERATE_OPTIONS)
		);
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
	// Nothing usable (reasoning, prose, truncated JSON): leave the stored
	// pieces untouched rather than "merging" them with an empty list.
	const parsed = result.pieces;
	if (result.source === 'none' || !parsed.length) return json({ error: 'empty' }, { status: 422 });

	// Merge with what is already stored: keep (and reposition) pieces whose
	// name still matches so a project's per-piece progress on them survives
	// re-analysis; drop the ones no longer detected; insert the new ones.
	// Dropping only happens for a structured (JSON) reply: a list salvaged
	// from plain text is too unreliable to delete anything on its strength
	// (and a project's per-piece progress would go with it).
	// A newly detected rows/quantity always wins; when this pass doesn't spot
	// one (a smaller local model can miss it), the previously stored value is
	// kept rather than wiped, so re-analysis only ever adds information.
	const existing = await db.select().from(patternPieces).where(eq(patternPieces.patternId, patternId));
	const existingByName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]));
	const keepIds = new Set<string>();
	const finalRows: { id: string; name: string; position: number; defaultTotalRows: number | null; quantity: number | null }[] = [];

	for (let i = 0; i < parsed.length; i++) {
		const { name, rows, quantity } = parsed[i];
		const match = existingByName.get(name.trim().toLowerCase());
		const defaultTotalRows = rows ?? match?.defaultTotalRows ?? null;
		const qty = quantity ?? match?.quantity ?? null;
		if (match) {
			keepIds.add(match.id);
			if (match.position !== i || match.defaultTotalRows !== defaultTotalRows || match.quantity !== qty) {
				await db
					.update(patternPieces)
					.set({ position: i, defaultTotalRows, quantity: qty })
					.where(eq(patternPieces.id, match.id));
			}
			finalRows.push({ id: match.id, name: match.name, position: i, defaultTotalRows, quantity: qty });
		} else {
			const inserted = (
				await db.insert(patternPieces).values({ patternId, name, position: i, defaultTotalRows, quantity: qty }).returning()
			)[0];
			finalRows.push({
				id: inserted.id,
				name: inserted.name,
				position: i,
				defaultTotalRows: inserted.defaultTotalRows,
				quantity: inserted.quantity
			});
		}
	}

	if (result.source === 'json') {
		for (const stale of existing.filter((p) => !keepIds.has(p.id))) {
			await db.delete(patternPieces).where(eq(patternPieces.id, stale.id));
		}
	} else {
		// Kept pieces go after the newly listed ones, in their former order.
		const kept = existing.filter((p) => !keepIds.has(p.id)).sort((a, b) => a.position - b.position);
		for (const p of kept) {
			const position = finalRows.length;
			if (p.position !== position) {
				await db.update(patternPieces).set({ position }).where(eq(patternPieces.id, p.id));
			}
			finalRows.push({ id: p.id, name: p.name, position, defaultTotalRows: p.defaultTotalRows, quantity: p.quantity });
		}
	}

	return json({ pieces: finalRows.sort((a, b) => a.position - b.position) });
};
