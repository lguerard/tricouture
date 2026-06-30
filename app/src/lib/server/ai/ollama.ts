import { env } from '$env/dynamic/private';

const OLLAMA_URL = () => env.OLLAMA_URL?.replace(/\/$/, '') || '';
// Default models (overridable via env). Chosen to fit within ~10 GB VRAM.
const CHAT_MODEL = () => env.OLLAMA_CHAT_MODEL || 'qwen2.5:7b';
const EMBED_MODEL = () => env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

export function aiConfigured(): boolean {
	return OLLAMA_URL().length > 0;
}

export class AiUnavailable extends Error {
	constructor(msg = 'AI service unavailable (OLLAMA_URL not configured or offline).') {
		super(msg);
	}
}

async function call(path: string, body: unknown): Promise<unknown> {
	if (!aiConfigured()) throw new AiUnavailable();
	let res: Response;
	try {
		res = await fetch(`${OLLAMA_URL()}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		throw new AiUnavailable();
	}
	if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`);
	return res.json();
}

// Text generation (non-streaming for simplicity).
export async function generate(prompt: string, system?: string): Promise<string> {
	const data = (await call('/api/generate', {
		model: CHAT_MODEL(),
		prompt,
		system,
		stream: false
	})) as { response?: string };
	return (data.response ?? '').trim();
}

// Embedding vector (768 dims with nomic-embed-text → vector(768) column).
export async function embed(text: string): Promise<number[]> {
	const data = (await call('/api/embeddings', {
		model: EMBED_MODEL(),
		prompt: text
	})) as { embedding?: number[] };
	if (!data.embedding) throw new Error('Empty embedding');
	return data.embedding;
}
