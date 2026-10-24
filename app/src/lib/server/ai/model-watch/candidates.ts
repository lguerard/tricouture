// Discover Ollama models worth trying, and filter them to what fits the GPU.
//
// There's no API that says "here are the best new LLMs" — this combines two
// sources instead:
//
//   - a small curated list of model families worth re-checking every month
//     (kept even if the discovery below breaks, so the watch never goes
//     completely blind to new tags/versions published under a known family);
//   - a best-effort scrape of ollama.com's library sorted by newest, which is
//     how genuinely new model families get noticed at all. Ollama doesn't
//     publish a stable API for this, so this is fragile by nature: any
//     failure here is caught and logged, never fatal to the run.
//
// VRAM fitting uses the REAL manifest size from Ollama's registry (the same
// one `ollama pull` reads), not a guess from the parameter count in the
// model's name — quantization changes the on-disk size a lot for the same
// parameter count.

const REGISTRY_BASE = 'https://registry.ollama.ai';
const LIBRARY_URL = 'https://ollama.com/library';

// Families worth re-checking even if the scrape-based discovery below fails.
// General-purpose/instruct models commonly cited as good at strict
// instruction-following (structured JSON extraction), this app's actual task.
export const CURATED_FAMILIES = [
	'qwen2.5',
	'qwen3',
	'qwen3.5',
	'llama3.1',
	'llama3.2',
	'llama3.3',
	'mistral',
	'mistral-nemo',
	'gemma2',
	'gemma3',
	'gemma4',
	'phi3.5',
	'phi4',
	'deepseek-r1',
	'command-r'
];

// Tags to try per family, smallest to largest: stop at the first that exists
// for each size listed here rather than trying every quantization variant
// Ollama lists for a given size. "e4b" is Gemma's "effective 4B" naming; the
// real footprint always comes from the manifest, not from the tag.
export const CANDIDATE_SIZE_TAGS = ['e4b', '4b', '7b', '8b', '9b', '12b', '13b', '14b', '27b', '32b'];

// VRAM a model needs once loaded, from its on-disk (manifest) size: the
// weights themselves (loaded as-is, quantization included), plus the KV
// cache for the context window the app requests -- roughly 6% of the weights
// per 8192 tokens with the q8_0 KV cache the GPU overlay configures -- plus
// ~0.3 GB of CUDA context/compute buffers. An ~8 GB model at 8192 tokens
// comes to ~8.8 GB: it fits a 10 GB card when the budget is set to the VRAM
// actually free for it, which is the point (the old "x1.15 + 0.5 GB"
// estimate rejected it outright).
export function estimateVramGb(diskSizeGb: number, numCtx = 8192): number {
	const kvCacheGb = diskSizeGb * 0.06 * (numCtx / 8192);
	return diskSizeGb + kvCacheGb + 0.3;
}

export type Candidate = { model: string; diskSizeGb: number };

// A descriptive UA: this is a low-frequency (monthly), self-identifying
// automated check, and a default/no UA is more likely to be blocked outright.
const USER_AGENT = 'tricouture-model-watch/1.0 (+https://github.com/lguerard/tricouture)';

async function fetchText(url: string, timeoutMs: number): Promise<string> {
	const res = await fetch(url, {
		signal: AbortSignal.timeout(timeoutMs),
		headers: { 'user-agent': USER_AGENT }
	});
	if (!res.ok) throw new Error(`${url} -> ${res.status}`);
	return res.text();
}

// This month's families to consider: the curated list + whatever's new on
// the site. Never throws — a scrape failure just falls back to curated-only.
export async function discoverCandidateNames(
	maxNew = 15,
	warnings: string[] = []
): Promise<string[]> {
	const names = [...CURATED_FAMILIES];
	try {
		const html = await fetchText(`${LIBRARY_URL}?sort=newest`, 15_000);
		const found = [...html.matchAll(/\/library\/([a-zA-Z0-9][a-zA-Z0-9._-]*)"/g)].map((m) => m[1]);
		const seen = [...new Set(found)].slice(0, maxNew);
		if (seen.length === 0) {
			warnings.push(`Scraping de ${LIBRARY_URL} n'a trouvé aucun modèle (page changée ?) — liste curée seule.`);
		}
		for (const name of seen) if (!names.includes(name)) names.push(name);
	} catch (e) {
		warnings.push(`Découverte de nouveaux modèles échouée (${(e as Error).message}) — liste curée seule.`);
	}
	return names;
}

async function manifestSizeBytes(name: string, tag: string): Promise<number | null> {
	try {
		const res = await fetch(`${REGISTRY_BASE}/v2/library/${name}/manifests/${tag}`, {
			signal: AbortSignal.timeout(15_000),
			headers: { 'user-agent': USER_AGENT }
		});
		if (res.status === 404) return null;
		if (!res.ok) return null;
		const manifest = (await res.json()) as { layers?: { size?: number }[] };
		return (manifest.layers ?? []).reduce((sum, layer) => sum + (layer.size ?? 0), 0);
	} catch {
		return null;
	}
}

// The largest known tag of `name` that fits the VRAM budget, or null.
export async function findBestFittingTag(
	name: string,
	vramBudgetGb: number,
	numCtx?: number
): Promise<Candidate | null> {
	let best: Candidate | null = null;
	for (const sizeTag of CANDIDATE_SIZE_TAGS) {
		for (const tag of [sizeTag, `${sizeTag}-instruct`, `${sizeTag}-instruct-q4_K_M`]) {
			const sizeBytes = await manifestSizeBytes(name, tag);
			if (sizeBytes == null) continue;
			const sizeGb = sizeBytes / 1024 ** 3;
			const estimatedVramGb = estimateVramGb(sizeGb, numCtx);
			if (estimatedVramGb <= vramBudgetGb && (!best || sizeGb > best.diskSizeGb)) {
				best = { model: `${name}:${tag}`, diskSizeGb: Math.round(sizeGb * 100) / 100 };
			}
			break; // a tag of this size exists — no need for the other variants
		}
	}
	return best;
}

// [{model: "qwen2.5:14b", diskSizeGb: 9.0}, ...], largest first.
export async function buildCandidateList(
	vramBudgetGb: number,
	maxCandidates: number,
	warnings: string[] = [],
	numCtx?: number
): Promise<Candidate[]> {
	const candidates: Candidate[] = [];
	for (const name of await discoverCandidateNames(15, warnings)) {
		const result = await findBestFittingTag(name, vramBudgetGb, numCtx);
		if (result) candidates.push(result);
	}
	candidates.sort((a, b) => b.diskSizeGb - a.diskSizeGb);
	return candidates.slice(0, maxCandidates);
}
