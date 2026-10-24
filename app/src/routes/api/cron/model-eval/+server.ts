import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { timingSafeEqual } from 'node:crypto';
import { aiConfigured } from '$lib/server/ai/ollama';
import { DEFAULT_MAX_CASES } from '$lib/server/ai/model-eval/cases';
import { harvestCases } from '$lib/server/ai/model-eval/harvest';
import { casesOnly, evaluateModel } from '$lib/server/ai/model-eval/evaluate';
import type { RequestHandler } from './$types';

// Machine-to-machine endpoint for the server's model watch
// (server_setup/model-watch), which runs it from inside this container with
// `docker exec`. Not a user-facing feature: the caller has no login of its
// own, so it authenticates with a shared secret (MODEL_WATCH_TOKEN) instead
// of a session cookie -- that's also why this path is listed in
// hooks.server.ts's PUBLIC_PREFIXES (it bypasses the cookie check, not auth
// itself). Disabled entirely (503) unless the token is configured.
//
// POST {model, maxCases?, dry?}: scores `model` on this app's own AI tasks
// (see $lib/server/ai/model-eval) and answers with the result. The model must
// already be in Ollama's store. `dry: true` only counts the cases. The
// request stays open for the whole evaluation (a few minutes per model).

const MAX_CASES_LIMIT = 50;

function authorized(request: Request, token: string): boolean {
	const given = Buffer.from(request.headers.get('authorization') ?? '');
	const wanted = Buffer.from(`Bearer ${token}`);
	return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export const POST: RequestHandler = async ({ request }) => {
	const token = env.MODEL_WATCH_TOKEN;
	if (!token) return json({ ok: false, error: 'MODEL_WATCH_TOKEN not configured' }, { status: 503 });
	if (!authorized(request, token)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const model = typeof body?.model === 'string' ? body.model.trim() : '';
	if (!model || model.length > 200) return json({ ok: false, error: 'model required' }, { status: 400 });
	const requested = parseInt(String(body?.maxCases ?? DEFAULT_MAX_CASES), 10);
	const maxCases = Math.min(MAX_CASES_LIMIT, Math.max(1, Number.isFinite(requested) ? requested : DEFAULT_MAX_CASES));
	const dry = body?.dry === true || body?.dry === 1 || body?.dry === '1';

	const { cases, warnings } = await harvestCases(maxCases);
	if (dry) return json(casesOnly(model, cases, warnings));
	if (!aiConfigured()) return json({ ok: false, error: 'OLLAMA_URL not configured' }, { status: 503 });
	return json(await evaluateModel(model, cases, warnings));
};
