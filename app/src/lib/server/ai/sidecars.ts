import { env } from '$env/dynamic/private';

export const visionUrl = () => env.VISION_URL?.replace(/\/$/, '') || '';
export const whisperUrl = () => env.WHISPER_URL?.replace(/\/$/, '') || '';

// Relaie un fichier (image/audio) vers un sidecar FastAPI et renvoie sa réponse JSON.
export async function proxyFile(
	base: string,
	path: string,
	file: File
): Promise<{ status: number; body: unknown }> {
	if (!base) return { status: 503, body: { error: 'Service non configuré' } };
	const fd = new FormData();
	fd.append('file', file, file.name || 'upload');
	try {
		const res = await fetch(`${base}${path}`, { method: 'POST', body: fd });
		return { status: res.status, body: await res.json().catch(() => ({})) };
	} catch {
		return { status: 503, body: { error: 'Service injoignable' } };
	}
}
