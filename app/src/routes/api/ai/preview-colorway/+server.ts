import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function sdUrl(): string {
	return (env.SD_URL ?? '').replace(/\/$/, '');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthenticated');

	const sdBase = sdUrl();
	if (!sdBase) error(503, 'SD service unavailable (SD_URL not configured)');

	const body = await request.json().catch(() => ({}));
	const prompt: string = typeof body.prompt === 'string' ? body.prompt.trim() : '';
	const colorHex: string = typeof body.colorHex === 'string' ? body.colorHex : '#888888';
	const imageBase64: string | undefined = typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined;
	const strength: number = typeof body.strength === 'number' ? body.strength : 0.65;
	const steps: number = typeof body.steps === 'number' ? Math.min(body.steps, 50) : 25;

	let res: Response;
	try {
		res = await fetch(`${sdBase}/preview`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				prompt,
				color_hex: colorHex,
				image_base64: imageBase64 ?? null,
				strength,
				steps
			}),
			signal: AbortSignal.timeout(120_000)
		});
	} catch {
		error(503, 'SD service unavailable or timed out (generation can take ~30–60 s)');
	}

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		error(502, `SD error: ${detail.slice(0, 200)}`);
	}

	const data = (await res.json()) as { image_base64: string; format: string; prompt: string };
	return json(data);
};
