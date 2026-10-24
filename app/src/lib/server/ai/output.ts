// Clean-up of raw model output shared by every parser. Local models wrap
// their answer in all sorts of things even when asked not to: a reasoning
// block (<think>…</think>, emitted inline by some models whatever `think`
// says), markdown fences, or a sentence of prose before/after the JSON.

// Removes a leading reasoning block. An unterminated <think> (generation cut
// off mid-reasoning) means there is no answer at all -> empty string.
export function stripReasoning(raw: string): string {
	let text = raw.trimStart();
	const open = text.match(/^<(think|thinking|reasoning)>/i);
	if (open) {
		const close = text.search(new RegExp(`</${open[1]}>`, 'i'));
		if (close === -1) return '';
		text = text.slice(close + open[0].length + 1);
	}
	return text.trim();
}

// Best-effort extraction of the JSON payload from a model reply: strips a
// reasoning block and markdown fences, then, if prose surrounds it, keeps
// the outermost {...} or [...] span. Returns null when nothing in the reply
// even looks like JSON (callers then decide whether a fallback is safe).
export function extractJsonText(raw: string): string | null {
	let text = stripReasoning(raw);
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) text = fence[1].trim();
	if (/^[[{]/.test(text)) return text;
	const start = text.search(/[[{]/);
	if (start === -1) return null;
	const closer = text[start] === '{' ? '}' : ']';
	const end = text.lastIndexOf(closer);
	return end > start ? text.slice(start, end + 1) : null;
}

// JSON.parse of extractJsonText's result; undefined when absent/invalid.
export function parseJsonReply(raw: string): unknown {
	const text = extractJsonText(raw);
	if (text == null) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
