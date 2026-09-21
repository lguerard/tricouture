import { generate } from './ollama';
import { TAGS_SYSTEM, tagsPrompt } from './prompts';

const MAX_TAGS = 6;
const MAX_TAG_LENGTH = 40;

// Parses the model's response into a deduplicated, lowercased list of tags.
// Models sometimes wrap JSON in markdown fences, ignore the format
// instruction entirely, or return a plain comma/newline list -- fall back to
// splitting on those in that case.
function parseTags(raw: string): string[] {
	let text = raw.trim();
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) text = fence[1].trim();

	const dedupe = (values: unknown[]): string[] => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const v of values) {
			const tag = String(v ?? '').trim().toLowerCase();
			if (tag && tag.length <= MAX_TAG_LENGTH && !seen.has(tag)) {
				seen.add(tag);
				out.push(tag);
			}
		}
		return out;
	};

	try {
		const data = JSON.parse(text);
		const arr = Array.isArray(data?.tags) ? data.tags : Array.isArray(data) ? data : null;
		if (arr) return dedupe(arr).slice(0, MAX_TAGS);
	} catch {
		/* not valid JSON — fall through to the list-based fallback below */
	}

	return dedupe(text.split(/[,\n]/).map((s) => s.replace(/^[\s\-*•\d.)]+/, ''))).slice(0, MAX_TAGS);
}

// Suggests tags from a pattern's text (title/notes/extracted PDF text). Lets
// AiUnavailable and other generate() failures propagate -- callers that want
// this best-effort (auto-tagging a freshly created pattern, same policy as
// the embedding step) wrap the call themselves; the manual "suggest tags"
// endpoint instead reports the failure to the person who clicked it.
export async function suggestTags(context: string): Promise<string[]> {
	return parseTags(await generate(tagsPrompt(context), TAGS_SYSTEM));
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
