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

// The chat model actually in use — read here rather than duplicated so the
// model-watch evaluation always compares against the real current setting.
export function currentChatModel(): string {
	return CHAT_MODEL();
}

export class AiUnavailable extends Error {
	constructor(msg = 'AI service unavailable (OLLAMA_URL not configured or offline).') {
		super(msg);
	}
}

class OllamaHttpError extends Error {
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
			throw new AiUnavailable(`AI service timed out after ${Math.round((timeoutMs ?? 0) / 1000)} s.`);
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
};

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
// configured chat model; the model-watch evaluation passes a candidate's tag
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
	)) as { response?: string };
	return stripReasoning(data.response ?? '').trim();
}

// Embedding vector (768 dims with nomic-embed-text → vector(768) column).
// Bounded: it runs inline when a pattern or yarn is saved, and a hung Ollama
// must not hang the save with it (callers treat a failure as "no vector").
export async function embed(text: string): Promise<number[]> {
	const data = (await call(
		'/api/embeddings',
		{
			model: EMBED_MODEL(),
			prompt: text
		},
		EMBED_TIMEOUT_MS
	)) as { embedding?: number[] };
	if (!data.embedding) throw new Error('Empty embedding');
	return data.embedding;
}

// Downloads a model into Ollama's local store if not already present
// (no-op otherwise). Pulls can take minutes for a multi-GB model, hence the
// generous timeout — used only by the monthly model-watch evaluation, never
// on a user-facing request path.
export async function pullModel(model: string): Promise<void> {
	await call('/api/pull', { name: model, stream: false }, 60 * 60 * 1000);
}

// Removes a model from Ollama's local store. Best-effort: failures are not
// fatal (the caller just ends up keeping a model on disk it meant to drop).
export async function deleteModel(model: string): Promise<void> {
	if (!aiConfigured()) return;
	try {
		await fetch(`${OLLAMA_URL()}/api/delete`, {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ model }),
			signal: AbortSignal.timeout(30_000)
		});
	} catch {
		/* non-fatal — see comment above */
	}
}
