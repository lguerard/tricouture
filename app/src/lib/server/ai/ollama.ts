import { env } from '$env/dynamic/private';
import { stripReasoning } from './output';

const OLLAMA_URL = () => env.OLLAMA_URL?.replace(/\/$/, '') || '';
// Default models (overridable via env). gemma4:12b (~8 GB) is the largest
// model that still fits a 10 GB card, and it also accepts image input.
const CHAT_MODEL = () => env.OLLAMA_CHAT_MODEL || 'gemma4:12b';
const EMBED_MODEL = () => env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
// Generous enough for the embedding model's cold start on a busy GPU.
const EMBED_TIMEOUT_MS = 30_000;
// Default bound on one generation: a cold load of an ~8 GB model on a shared
// GPU plus a few thousand output tokens fits comfortably; a hung Ollama no
// longer hangs the request forever. Long-form callers (pattern generation)
// pass a larger timeoutMs.
export const GENERATE_TIMEOUT_MS = 180_000;
export const LONG_GENERATE_TIMEOUT_MS = 420_000;
// Context window sent with EVERY generation (options.num_ctx). It must be the
// same for every call AND for every other app sharing the same Ollama: Ollama
// reloads the model whenever num_ctx changes between requests, so a mismatch
// with a neighbour (another stack's apps typically run at 8192) means a full
// ~8 GB reload on each switch. Ollama's own default (2048-4096 depending on
// version) would silently truncate the pattern prompts, hence an explicit
// value. The prompt builders (prompts.ts) size their pattern excerpts so the
// whole prompt plus the answer fits in 8192 tokens. VRAM cost: the KV cache
// grows linearly with it -- 8192 is roughly 0.5-1 GB on a 12B model with
// OLLAMA_KV_CACHE_TYPE=q8_0 (about twice that in f16). Raise OLLAMA_NUM_CTX
// only if every app on that Ollama is raised with it.
const DEFAULT_NUM_CTX = 8192;

export function numCtx(): number {
	const n = parseInt(env.OLLAMA_NUM_CTX ?? '', 10);
	return Number.isFinite(n) && n >= 1024 ? n : DEFAULT_NUM_CTX;
}

export function aiConfigured(): boolean {
	return OLLAMA_URL().length > 0;
}

export class AiUnavailable extends Error {
	constructor(msg = 'AI service unavailable (OLLAMA_URL not configured or offline).') {
		super(msg);
	}
}

// The AI service did not answer in time (a busy shared GPU, a cold model
// load): still "unavailable", but worth telling apart for the person.
export class AiTimeout extends AiUnavailable {
	constructor(timeoutMs: number) {
		super(`AI service timed out after ${Math.round(timeoutMs / 1000)} s.`);
	}
}

export class OllamaHttpError extends Error {
	constructor(
		readonly status: number,
		detail: string
	) {
		super(`Ollama ${status}: ${detail}`);
	}
}

async function call(path: string, body: unknown, timeoutMs?: number): Promise<unknown> {
	if (!aiConfigured()) throw new AiUnavailable();
	let res: Response;
	try {
		res = await fetch(`${OLLAMA_URL()}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
		});
	} catch (e) {
		if ((e as Error)?.name === 'TimeoutError') {
			throw new AiTimeout(timeoutMs ?? 0);
		}
		throw new AiUnavailable();
	}
	if (!res.ok) throw new OllamaHttpError(res.status, await res.text().catch(() => ''));
	return res.json();
}

// A JSON schema handed to Ollama's structured outputs (`format`): decoding is
// constrained to it, so the reply is valid JSON of that shape.
export type JsonSchema = Record<string, unknown>;

export type GenerateOptions = {
	// Overrides the model default (~0.8) — extraction wants 0: same text,
	// same answer.
	temperature?: number;
	// Plain JSON mode (`format: "json"`): valid JSON, any shape.
	json?: boolean;
	// Structured output: a JSON schema the reply must follow. Wins over `json`.
	schema?: JsonSchema;
	// Reasoning ("thinking") is OFF unless a caller opts in explicitly: none of
	// today's tasks benefit enough to pay for the extra latency/tokens, and a
	// reasoning trace leaking into `response` breaks the parsers. Ollama
	// returns the trace in a separate `thinking` field when it is on, which is
	// dropped here.
	think?: boolean;
	timeoutMs?: number;
	// Upper bound on generated tokens (options.num_predict); unset = model default.
	maxTokens?: number;
	// Base64-encoded images (no data: prefix) for a vision-capable model.
	images?: string[];
	// Called with Ollama's own timing of the answer (tokens generated and
	// generation time) -- the model evaluation ($lib/server/ai/model-eval)
	// measures speed with it. Not part of the request body.
	onStats?: (stats: GenerateStats) => void;
};

export type GenerateStats = { evalCount: number; evalDurationNs: number };

// The exact JSON body sent to /api/generate — exported for the tests, which
// pin down the request shape (think, num_ctx, format...).
export function buildGenerateBody(prompt: string, system: string | undefined, model: string, opts: GenerateOptions) {
	const options: Record<string, number> = { num_ctx: numCtx() };
	if (opts.temperature != null) options.temperature = opts.temperature;
	if (opts.maxTokens != null) options.num_predict = opts.maxTokens;
	const format = opts.schema ?? (opts.json ? 'json' : undefined);
	return {
		model,
		prompt,
		...(system ? { system } : {}),
		stream: false,
		think: opts.think ?? false,
		...(format ? { format } : {}),
		...(opts.images?.length ? { images: opts.images } : {}),
		options
	};
}

// Text generation (non-streaming for simplicity). `model` defaults to the
// configured chat model; the model evaluation passes the model under test
// instead, so it runs the exact same call production uses. A leading
// <think>…</think> block (models that reason inline even with think:false)
// is stripped from the returned text.
export async function generate(
	prompt: string,
	system?: string,
	model?: string,
	opts: GenerateOptions = {}
): Promise<string> {
	const data = (await call(
		'/api/generate',
		buildGenerateBody(prompt, system, model || CHAT_MODEL(), opts),
		opts.timeoutMs ?? GENERATE_TIMEOUT_MS
	)) as { response?: string; eval_count?: number; eval_duration?: number };
	opts.onStats?.({ evalCount: data.eval_count ?? 0, evalDurationNs: data.eval_duration ?? 0 });
	return stripReasoning(data.response ?? '').trim();
}

// nomic-embed-text is trained with task prefixes: a query and the documents
// it should find are embedded differently ("search_query: " vs
// "search_document: "); without them its retrieval quality drops. Other
// embedding models get the raw text. Part of the stored-vector scheme
// (embeddingScheme below): changing this logic must change the scheme.
export type EmbedTask = 'query' | 'document';
const NOMIC_PREFIXES: Record<EmbedTask, string> = { query: 'search_query: ', document: 'search_document: ' };
const usesNomicPrefixes = () => /nomic-embed/i.test(EMBED_MODEL());

export function embedInput(text: string, task: EmbedTask): string {
	return usesNomicPrefixes() ? `${NOMIC_PREFIXES[task]}${text}` : text;
}

// Identifies what produced a stored vector: embedding model + prefix scheme.
// Vectors from different schemes are not comparable, so when this changes
// every stored embedding is reset and re-computed (embeddings.ts).
export function embeddingScheme(): string {
	return `${EMBED_MODEL()}|${usesNomicPrefixes() ? 'nomic-task-prefix-v1' : 'raw'}`;
}

// Embedding vector (768 dims with nomic-embed-text → vector(768) column).
// `task`: "document" for what gets stored (patterns, yarns), "query" for a
// search string. Bounded: it runs inline when a pattern or yarn is saved,
// and a hung Ollama must not hang the save with it (callers treat a failure
// as "no vector"). Uses /api/embed (`input`, batched response); falls back to
// the deprecated /api/embeddings only when the server is too old to know
// /api/embed (404).
export async function embed(raw: string, task: EmbedTask = 'document'): Promise<number[]> {
	const text = embedInput(raw, task);
	try {
		const data = (await call('/api/embed', { model: EMBED_MODEL(), input: text }, EMBED_TIMEOUT_MS)) as {
			embeddings?: number[][];
		};
		const vec = data.embeddings?.[0];
		if (!vec?.length) throw new Error('Empty embedding');
		return vec;
	} catch (e) {
		if (!(e instanceof OllamaHttpError && e.status === 404)) throw e;
		// A 404 can also mean "model not found": the legacy endpoint then
		// fails the same way, so the error surfaced stays meaningful.
	}
	const data = (await call('/api/embeddings', { model: EMBED_MODEL(), prompt: text }, EMBED_TIMEOUT_MS)) as {
		embedding?: number[];
	};
	if (!data.embedding?.length) throw new Error('Empty embedding');
	return data.embedding;
}

// --- Chat with tools (/api/chat) ---------------------------------------------
//
// The in-app assistant ($lib/server/assistant) talks to the same model through
// Ollama's chat endpoint: a message list instead of a single prompt, and
// function calling ("tools"). Same rules as generate(): thinking off, the
// shared num_ctx, a bounded wait. The answer is STREAMED (NDJSON from
// Ollama, one JSON object per line) so the first words reach the person while
// the rest is still being generated -- on a shared GPU the full answer can take
// a while.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export type ChatToolCall = { function: { name: string; arguments: Record<string, unknown> | string } };
export type ChatMessage = {
	role: ChatRole;
	content: string;
	images?: string[];
	tool_calls?: ChatToolCall[];
	// Which tool a role:"tool" message answers.
	tool_name?: string;
};
export type ChatTool = {
	type: 'function';
	function: { name: string; description: string; parameters: JsonSchema };
};

export type ChatOptions = {
	tools?: ChatTool[];
	temperature?: number;
	maxTokens?: number;
	model?: string;
	// Caller-side cancellation (the person pressed stop, or the overall
	// deadline): the signal's reason is rethrown as-is.
	signal?: AbortSignal;
	timeoutMs?: number;
	// Each piece of answer text as it is generated.
	onDelta?: (text: string) => void;
};

export type ChatResult = { content: string; toolCalls: ChatToolCall[]; doneReason?: string };

// The exact JSON body sent to /api/chat -- exported for the tests.
export function buildChatBody(messages: ChatMessage[], model: string, opts: ChatOptions) {
	const options: Record<string, number> = { num_ctx: numCtx() };
	if (opts.temperature != null) options.temperature = opts.temperature;
	if (opts.maxTokens != null) options.num_predict = opts.maxTokens;
	return {
		model,
		messages,
		...(opts.tools?.length ? { tools: opts.tools } : {}),
		stream: true,
		think: false,
		options
	};
}

type ChatChunk = {
	message?: { content?: string; tool_calls?: ChatToolCall[] };
	done?: boolean;
	done_reason?: string;
	error?: string;
};

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
	if (!aiConfigured()) throw new AiUnavailable();
	const timeoutMs = opts.timeoutMs ?? GENERATE_TIMEOUT_MS;
	const signals = [AbortSignal.timeout(timeoutMs), ...(opts.signal ? [opts.signal] : [])];
	const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
	const model = opts.model || CHAT_MODEL();

	// Maps a fetch/stream failure: the caller's own abort is passed through
	// untouched, the timeout and network errors become AiUnavailable.
	const fail = (e: unknown): never => {
		if (opts.signal?.aborted) throw opts.signal.reason ?? e;
		if ((e as Error)?.name === 'TimeoutError' || signal.aborted) {
			throw new AiTimeout(timeoutMs);
		}
		throw e instanceof AiUnavailable || e instanceof OllamaHttpError ? e : new AiUnavailable();
	};

	const post = (body: unknown) =>
		fetch(`${OLLAMA_URL()}/api/chat`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			signal
		});

	let res: Response;
	try {
		res = await post(buildChatBody(messages, model, opts));
		// A model without function calling answers 400 "does not support
		// tools": the conversation still works, only without the library.
		if (res.status === 400 && opts.tools?.length) {
			const detail = await res.text().catch(() => '');
			if (!/does not support tools/i.test(detail)) throw new OllamaHttpError(400, detail);
			res = await post(buildChatBody(messages, model, { ...opts, tools: undefined }));
		}
	} catch (e) {
		return fail(e);
	}
	if (!res.ok) throw new OllamaHttpError(res.status, await res.text().catch(() => ''));
	if (!res.body) throw new AiUnavailable('Empty response from the AI service.');

	let content = '';
	const toolCalls: ChatToolCall[] = [];
	let doneReason: string | undefined;
	const handle = (line: string) => {
		if (!line.trim()) return;
		let chunk: ChatChunk;
		try {
			chunk = JSON.parse(line);
		} catch {
			return; // a partial or foreign line: ignore rather than fail the answer
		}
		if (chunk.error) throw new OllamaHttpError(500, chunk.error);
		const piece = chunk.message?.content ?? '';
		if (piece) {
			content += piece;
			opts.onDelta?.(piece);
		}
		if (chunk.message?.tool_calls?.length) toolCalls.push(...chunk.message.tool_calls);
		if (chunk.done) doneReason = chunk.done_reason;
	};

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let nl: number;
			while ((nl = buffer.indexOf('\n')) !== -1) {
				handle(buffer.slice(0, nl));
				buffer = buffer.slice(nl + 1);
			}
		}
		handle(buffer + decoder.decode());
	} catch (e) {
		reader.cancel().catch(() => {});
		if (e instanceof OllamaHttpError) throw e;
		return fail(e);
	}
	return { content: stripReasoning(content), toolCalls, doneReason };
}
