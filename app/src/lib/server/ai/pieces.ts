// Parsing for the pattern-pieces extraction response. Lives here (not inline
// in the API route) so the monthly model-watch evaluation
// ($lib/server/ai/model-watch/) can run the exact same parsing the real
// pattern-pieces endpoint uses, rather than a re-implementation that could
// silently drift out of sync.

export type ParsedPiece = { name: string; rows?: number; quantity?: number };

function positiveInt(v: unknown): number | undefined {
	const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
	return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

// Parses the model's response into a deduplicated list of pieces, each with
// an optional row count (tricot/crochet) and cut quantity (couture). Models
// sometimes wrap JSON in markdown fences, ignore the format instruction
// entirely, or return plain strings instead of objects — fall back to
// one-piece-per-line (name only) in that case.
export function parsePieces(raw: string): ParsedPiece[] {
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
