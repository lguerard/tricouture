// Parsing for the pattern-pieces extraction response. Lives here (not inline
// in the API route) so the monthly model-watch evaluation
// ($lib/server/ai/model-watch/) can run the exact same parsing the real
// pattern-pieces endpoint uses, rather than a re-implementation that could
// silently drift out of sync.

import { parseJsonReply, stripReasoning } from './output';

export type ParsedPiece = { name: string; rows?: number; quantity?: number };

function positiveInt(v: unknown): number | undefined {
	const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
	return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

// Structured-output schema for the pieces extraction (Ollama `format`):
// decoding is constrained to it, so a compliant server always returns
// {"pieces": [...]} -- the lenient parsing below is for older servers and
// models that ignore it.
export const PIECES_SCHEMA = {
	type: 'object',
	properties: {
		pieces: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					rows: { type: 'integer' },
					quantity: { type: 'integer' }
				},
				required: ['name']
			}
		}
	},
	required: ['pieces']
} as const;

// The generate() options every pieces extraction uses (the API route and the
// model-watch evaluation alike): schema-constrained JSON, deterministic.
export const PIECES_GENERATE_OPTIONS = { schema: PIECES_SCHEMA, temperature: 0, think: false };

const MAX_PIECES = 30;
const MAX_FALLBACK_WORDS = 6;
const MAX_FALLBACK_LENGTH = 60;

// `json`: the pieces came from a structured reply (trustworthy enough to
// also drop pieces it no longer lists); `lines`: salvaged from a plain-text
// list (only ever used to add/update); `none`: nothing usable.
export type PiecesParseResult = { pieces: ParsedPiece[]; source: 'json' | 'lines' | 'none' };

function dedupe(values: ParsedPiece[]): ParsedPiece[] {
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
	return out.slice(0, MAX_PIECES);
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

// Whether a (bullet-stripped) line plausibly names a piece rather than being
// a sentence of reasoning/prose ("Voici les pièces :", "First, I need to…").
function looksLikePieceName(line: string): boolean {
	if (!line || line.length > MAX_FALLBACK_LENGTH) return false;
	if (line.split(/\s+/).length > MAX_FALLBACK_WORDS) return false;
	if (/[:?!{}[\]"`<>]/.test(line) || /[.;,]\s*\S/.test(line) || /\.$/.test(line)) return false;
	return true;
}

// Plain-text fallback: a bulleted list when there is one (prose around it is
// ignored), otherwise short standalone lines. Any line that reads as prose
// is dropped rather than turned into a piece.
function parseLines(text: string): ParsedPiece[] {
	const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
	const bulleted = lines.filter((l) => BULLET.test(l));
	const candidates = (bulleted.length ? bulleted : lines).map((l) => l.replace(BULLET, '').trim());
	return dedupe(candidates.filter(looksLikePieceName).map((name) => ({ name })));
}

// Parses the model's response into a deduplicated list of pieces, each with
// an optional row count (tricot/crochet) and cut quantity (couture). Models
// sometimes wrap JSON in markdown fences or a reasoning block, add prose
// around it, ignore the format instruction entirely, or return plain strings
// instead of objects -- see PiecesParseResult for how each case is reported.
export function parsePiecesResult(raw: string): PiecesParseResult {
	const text = stripReasoning(raw);
	const data = parseJsonReply(text) as { pieces?: unknown } | unknown[] | undefined;
	const arr = Array.isArray((data as { pieces?: unknown })?.pieces)
		? ((data as { pieces: unknown[] }).pieces)
		: Array.isArray(data)
			? data
			: null;
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
		const pieces = dedupe(normalized);
		return { pieces, source: pieces.length ? 'json' : 'none' };
	}
	// Something that starts like JSON but did not parse (truncated output):
	// line-splitting it would only produce garbage pieces.
	if (data !== undefined || /^\s*[[{]/.test(text)) return { pieces: [], source: 'none' };
	const pieces = parseLines(text.replace(/```(?:json)?/gi, ''));
	return { pieces, source: pieces.length ? 'lines' : 'none' };
}

export function parsePieces(raw: string): ParsedPiece[] {
	return parsePiecesResult(raw).pieces;
}
