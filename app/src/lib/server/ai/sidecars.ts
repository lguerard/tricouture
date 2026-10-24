import { env } from '$env/dynamic/private';

export const whisperUrl = () => env.WHISPER_URL?.replace(/\/$/, '') || '';

// VISION_URL pointed at the former EasyOCR/CLIP sidecar; label scanning and
// photo analysis now go through Ollama (ai/vision.ts) and the palette code.
// A leftover value is harmless -- ignored, said once in the logs.
let visionUrlWarned = false;
export function warnIfVisionUrlSet(): void {
	if (visionUrlWarned || !env.VISION_URL) return;
	visionUrlWarned = true;
	console.warn('VISION_URL is set but no longer used (label scan now uses OLLAMA_CHAT_MODEL) — ignoring it.');
}

// Proxies a file (image/audio) to a FastAPI sidecar and returns its JSON
// response. Bounded: the whisper sidecar loads (and the very first time,
// downloads) its model on demand, which can take a while, but never forever.
export async function proxyFile(
	base: string,
	path: string,
	file: File,
	timeoutMs = 180_000
): Promise<{ status: number; body: unknown }> {
	if (!base) return { status: 503, body: { error: 'Service not configured' } };
	const fd = new FormData();
	fd.append('file', file, file.name || 'upload');
	try {
		const res = await fetch(`${base}${path}`, { method: 'POST', body: fd, signal: AbortSignal.timeout(timeoutMs) });
		return { status: res.status, body: await res.json().catch(() => ({})) };
	} catch {
		return { status: 503, body: { error: 'Service unreachable' } };
	}
}
