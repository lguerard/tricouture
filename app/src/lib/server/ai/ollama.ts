import { env } from '$env/dynamic/private';

const OLLAMA_URL = () => env.OLLAMA_URL?.replace(/\/$/, '') || '';
// Modèles par défaut (surchargables via env). Choix tenant dans ~10 GB VRAM.
const CHAT_MODEL = () => env.OLLAMA_CHAT_MODEL || 'qwen2.5:7b';
const EMBED_MODEL = () => env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

export function aiConfigured(): boolean {
	return OLLAMA_URL().length > 0;
}

export class AiUnavailable extends Error {
	constructor(msg = "Service IA indisponible (OLLAMA_URL non configuré ou hors-ligne).") {
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

// Génération de texte (non-streaming pour rester simple).
export async function generate(prompt: string, system?: string): Promise<string> {
	const data = (await call('/api/generate', {
		model: CHAT_MODEL(),
		prompt,
		system,
		stream: false
	})) as { response?: string };
	return (data.response ?? '').trim();
}

// Vecteur d'embedding (768 dims avec nomic-embed-text → colonne vector(768)).
export async function embed(text: string): Promise<number[]> {
	const data = (await call('/api/embeddings', {
		model: EMBED_MODEL(),
		prompt: text
	})) as { embedding?: number[] };
	if (!data.embedding) throw new Error('Embedding vide');
	return data.embedding;
}
