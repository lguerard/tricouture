import { generate } from './ollama';
import { patternInfoSystem, patternInfoPrompt } from './prompts';
import type { PatternVocabulary } from '$lib/server/patternVocabulary';

const MAX_TAGS = 6;
const MAX_TAG_LENGTH = 40;
const MAX_TEXT_FIELD_LENGTH = 160;

// Locale codes the app's own UI supports (see $lib/i18n) -- also what the
// "language of the info" picker offers, so an unrecognized/missing value
// falls back to the app's default rather than being passed to the model
// verbatim.
export const SUPPORTED_INFO_LANGUAGES = ['fr', 'en'] as const;
export type InfoLanguage = (typeof SUPPORTED_INFO_LANGUAGES)[number];
export const DEFAULT_INFO_LANGUAGE: InfoLanguage = 'fr';

export function normalizeInfoLanguage(v: unknown): InfoLanguage {
	return (SUPPORTED_INFO_LANGUAGES as readonly string[]).includes(String(v))
		? (v as InfoLanguage)
		: DEFAULT_INFO_LANGUAGE;
}

export type SuggestedPatternInfo = {
	tags: string[];
	garmentType?: string;
	designer?: string;
	language?: string;
	difficulty?: number;
	sizes?: string;
	gaugeStitches?: number;
	gaugeRows?: number;
	yardageRequired?: number;
};

// The pattern fields a suggestion can fill, and their current values -- only
// fields that are still empty get filled; anything the person already typed
// (or a previous suggestion already set) is left alone.
export type PatternInfoBaseline = {
	tags: string[];
	garmentType: string | null;
	designer: string | null;
	language: string | null;
	difficulty: number | null;
	sizes: string | null;
	gaugeStitches: number | null;
	gaugeRows: number | null;
	yardageRequired: number | null;
};

function cleanTags(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const v of values) {
		const tag = String(v ?? '')
			.trim()
			.toLowerCase();
		if (tag && tag.length <= MAX_TAG_LENGTH && !seen.has(tag)) {
			seen.add(tag);
			out.push(tag);
		}
	}
	return out.slice(0, MAX_TAGS);
}

function cleanText(v: unknown, maxLength = MAX_TEXT_FIELD_LENGTH): string | undefined {
	const s = String(v ?? '').trim();
	return s ? s.slice(0, maxLength) : undefined;
}

function cleanNumber(v: unknown, min: number, max: number, decimals: number): number | undefined {
	const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
	if (!Number.isFinite(n) || n < min || n > max) return undefined;
	const factor = 10 ** decimals;
	return Math.round(n * factor) / factor;
}

// Parses the model's response, tolerating the usual local-model quirks
// (markdown fences, a non-JSON reply) the same way pieces.ts does. Never
// throws -- a response we can't parse just means nothing to suggest.
function parsePatternInfo(raw: string): SuggestedPatternInfo {
	let text = raw.trim();
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) text = fence[1].trim();

	try {
		const data = JSON.parse(text);
		if (data && typeof data === 'object' && !Array.isArray(data)) {
			return {
				tags: cleanTags(data.tags),
				garmentType: cleanText(data.garmentType, 120),
				designer: cleanText(data.designer, 160),
				language: cleanText(data.language, 16),
				difficulty: cleanNumber(data.difficulty, 1, 5, 0),
				sizes: cleanText(data.sizes),
				gaugeStitches: cleanNumber(data.gaugeStitches, 1, 200, 1),
				gaugeRows: cleanNumber(data.gaugeRows, 1, 200, 1),
				yardageRequired: cleanNumber(data.yardageRequired, 1, 100_000, 0)
			};
		}
	} catch {
		/* not valid JSON — no structured info to salvage */
	}
	return { tags: [] };
}

// Suggests pattern info from its text (title/notes/extracted PDF text). Lets
// AiUnavailable and other generate() failures propagate -- callers that want
// this best-effort (auto-fill on creation, same policy as the embedding
// step) wrap the call themselves; the manual "suggest" endpoint instead
// reports the failure to the person who clicked it.
export async function suggestPatternInfo(
	context: string,
	language: InfoLanguage = DEFAULT_INFO_LANGUAGE,
	vocabulary?: PatternVocabulary
): Promise<SuggestedPatternInfo> {
	return parsePatternInfo(await generate(patternInfoPrompt(context, vocabulary), patternInfoSystem(language)));
}

// Merges newly suggested tags into an existing list without duplicates
// (case-insensitive), keeping the casing and order of what was already there.
export function mergeTags(existing: string[], suggested: string[]): string[] {
	const seen = new Set(existing.map((t) => t.trim().toLowerCase()));
	const merged = [...existing];
	for (const tag of suggested) {
		const key = tag.trim().toLowerCase();
		if (key && !seen.has(key)) {
			seen.add(key);
			merged.push(tag);
		}
	}
	return merged;
}

// Combines a suggestion with a pattern's current values: tags are merged
// (additive), every other field is filled only if currently empty. Returns
// the resulting tags array plus a DB update payload containing only the
// fields that actually changed.
export function mergePatternInfo(
	existing: PatternInfoBaseline,
	suggested: SuggestedPatternInfo
): { tags: string[]; updates: Record<string, unknown> } {
	const tags = mergeTags(existing.tags, suggested.tags);
	const updates: Record<string, unknown> = {};
	if (tags.length !== existing.tags.length) updates.tags = tags;
	if (!existing.garmentType && suggested.garmentType) updates.garmentType = suggested.garmentType;
	if (!existing.designer && suggested.designer) updates.designer = suggested.designer;
	if (!existing.language && suggested.language) updates.language = suggested.language;
	if (existing.difficulty == null && suggested.difficulty != null) updates.difficulty = suggested.difficulty;
	if (!existing.sizes && suggested.sizes) updates.sizes = suggested.sizes;
	if (existing.gaugeStitches == null && suggested.gaugeStitches != null) updates.gaugeStitches = suggested.gaugeStitches;
	if (existing.gaugeRows == null && suggested.gaugeRows != null) updates.gaugeRows = suggested.gaugeRows;
	if (existing.yardageRequired == null && suggested.yardageRequired != null) {
		updates.yardageRequired = suggested.yardageRequired;
	}
	return { tags, updates };
}
