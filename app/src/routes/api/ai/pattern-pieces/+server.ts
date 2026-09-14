import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternPieces } from '$lib/server/db/schema';
import { generate, AiUnavailable } from '$lib/server/ai/ollama';
import { PIECES_SYSTEM, piecesPrompt } from '$lib/server/ai/prompts';
import type { RequestHandler } from './$types';

type ParsedPiece = { name: string; rows?: number; quantity?: number };

function positiveInt(v: unknown): number | undefined {
	const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
	return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

// Parses the model's response into a deduplicated list of pieces, each with
// an optional row count (tricot/crochet) and cut quantity (couture). Models
// sometimes wrap JSON in markdown fences, ignore the format instruction
// entirely, or return plain strings instead of objects — fall back to
// one-piece-per-line (name only) in that case.
function parsePieces(raw: string): ParsedPiece[] {
	let text = raw.trim();
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) text = fence[1].trim();

	const dedupe = (values: ParsedPiece[]): ParsedPiece[] => {
		const seen = new Set<string>();
		const out: ParsedPiece[] = [];
		for (const v of values) {
			const name = String(v.name ?? '').trim();
			const key = name.toLowerCase();
			if (name && name.length < 100 && !seen.has(key)) {
				seen.add(key);
				out.push({ name, rows: v.rows, quantity: v.quantity });
			}
		}
		return out;
	};

	try {
		const data = JSON.parse(text);
		const arr = Array.isArray(data?.pieces) ? data.pieces : Array.isArray(data) ? data : null;
		if (arr) {
			const normalized = arr.map((item: unknown): ParsedPiece =>
				typeof item === 'string'
					? { name: item }
					: {
							name: String((item as Record<string, unknown>)?.name ?? ''),
							rows: positiveInt((item as Record<string, unknown>)?.rows),
							quantity: positiveInt((item as Record<string, unknown>)?.quantity)
						}
			);
			return dedupe(normalized).slice(0, 30);
		}
	} catch {
		/* not valid JSON — fall through to the line-based fallback below */
	}

	return dedupe(
		text.split('\n').map((line) => ({ name: line.replace(/^[\s\-*•\d.)]+/, '') }))
	).slice(0, 30);
}

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

	let parsed: ParsedPiece[];
	try {
		const context = [pat.title, pat.notes, pat.extractedText].filter(Boolean).join('\n\n');
		parsed = parsePieces(await generate(piecesPrompt(context, pat.craft), PIECES_SYSTEM));
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
	if (!parsed.length) return json({ error: 'empty' }, { status: 422 });

	// Merge with what is already stored: keep (and reposition) pieces whose
	// name still matches so a project's per-piece progress on them survives
	// re-analysis; drop the ones no longer detected; insert the new ones.
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

	for (const stale of existing.filter((p) => !keepIds.has(p.id))) {
		await db.delete(patternPieces).where(eq(patternPieces.id, stale.id));
	}

	return json({ pieces: finalRows.sort((a, b) => a.position - b.position) });
};
