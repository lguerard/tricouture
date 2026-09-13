import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patterns, patternPieces } from '$lib/server/db/schema';
import { generate, AiUnavailable } from '$lib/server/ai/ollama';
import { PIECES_SYSTEM, piecesPrompt } from '$lib/server/ai/prompts';
import type { RequestHandler } from './$types';

// Parses the model's response into a deduplicated list of piece names.
// Models sometimes wrap JSON in markdown fences or ignore the format
// instruction entirely — fall back to one-piece-per-line in that case.
function parsePieces(raw: string): string[] {
	let text = raw.trim();
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) text = fence[1].trim();

	const dedupe = (values: unknown[]): string[] => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const v of values) {
			const name = String(v ?? '').trim();
			const key = name.toLowerCase();
			if (name && name.length < 100 && !seen.has(key)) {
				seen.add(key);
				out.push(name);
			}
		}
		return out;
	};

	try {
		const data = JSON.parse(text);
		const arr = Array.isArray(data?.pieces) ? data.pieces : Array.isArray(data) ? data : null;
		if (arr) return dedupe(arr).slice(0, 30);
	} catch {
		/* not valid JSON — fall through to the line-based fallback below */
	}

	return dedupe(text.split('\n').map((line) => line.replace(/^[\s\-*•\d.)]+/, ''))).slice(0, 30);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => ({}));
	const patternId = String(body?.patternId ?? '');
	if (!patternId) return json({ error: 'patternId required' }, { status: 400 });

	const pat = (
		await db
			.select({ title: patterns.title, notes: patterns.notes, extractedText: patterns.extractedText })
			.from(patterns)
			.where(and(eq(patterns.id, patternId), eq(patterns.ownerId, locals.user!.id)))
			.limit(1)
	)[0];
	if (!pat) return json({ error: 'Pattern not found' }, { status: 404 });
	if (!pat.extractedText) return json({ error: 'no-text' }, { status: 422 });

	let names: string[];
	try {
		const context = [pat.title, pat.notes, pat.extractedText].filter(Boolean).join('\n\n');
		names = parsePieces(await generate(piecesPrompt(context), PIECES_SYSTEM));
	} catch (e) {
		if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
		return json({ error: 'Analysis failed' }, { status: 500 });
	}
	if (!names.length) return json({ error: 'empty' }, { status: 422 });

	// Merge with what is already stored: keep (and reposition) pieces whose
	// name still matches so a project's per-piece progress on them survives
	// re-analysis; drop the ones no longer detected; insert the new ones.
	const existing = await db.select().from(patternPieces).where(eq(patternPieces.patternId, patternId));
	const existingByName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]));
	const keepIds = new Set<string>();
	const finalRows: { id: string; name: string; position: number }[] = [];

	for (let i = 0; i < names.length; i++) {
		const name = names[i];
		const match = existingByName.get(name.trim().toLowerCase());
		if (match) {
			keepIds.add(match.id);
			if (match.position !== i) await db.update(patternPieces).set({ position: i }).where(eq(patternPieces.id, match.id));
			finalRows.push({ id: match.id, name: match.name, position: i });
		} else {
			const inserted = (
				await db.insert(patternPieces).values({ patternId, name, position: i }).returning()
			)[0];
			finalRows.push({ id: inserted.id, name: inserted.name, position: i });
		}
	}

	for (const stale of existing.filter((p) => !keepIds.has(p.id))) {
		await db.delete(patternPieces).where(eq(patternPieces.id, stale.id));
	}

	return json({ pieces: finalRows.sort((a, b) => a.position - b.position) });
};
