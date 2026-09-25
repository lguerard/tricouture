import { env } from '$env/dynamic/private';

const OLLAMA_URL = () => env.OLLAMA_URL?.replace(/\/$/, '') || '';
// Default models (overridable via env). Chosen to fit within ~10 GB VRAM.
const CHAT_MODEL = () => env.OLLAMA_CHAT_MODEL || 'qwen2.5:7b';
const EMBED_MODEL = () => env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
// Generous enough for the embedding model's cold start on a busy GPU.
const EMBED_TIMEOUT_MS = 30_000;

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
	} catch {
		throw new AiUnavailable();
	}
	if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`);
	return res.json();
}

// Text generation (non-streaming for simplicity). `model` defaults to the
// configured chat model; the model-watch evaluation passes a candidate's tag
// instead, so it runs the exact same call production uses.
// `opts.json` turns on Ollama's JSON mode and `opts.temperature` overrides the
// model default (~0.8) — extraction wants 0: same text, same answer.
export async function generate(
	prompt: string,
	system?: string,
	model?: string,
	opts: { temperature?: number; json?: boolean } = {}
): Promise<string> {
	const data = (await call('/api/generate', {
		model: model || CHAT_MODEL(),
		prompt,
		system,
		stream: false,
		...(opts.json ? { format: 'json' } : {}),
		...(opts.temperature != null ? { options: { temperature: opts.temperature } } : {})
	})) as { response?: string };
	return (data.response ?? '').trim();
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
