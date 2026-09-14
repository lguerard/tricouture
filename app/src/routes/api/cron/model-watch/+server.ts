import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { aiConfigured, currentChatModel } from '$lib/server/ai/ollama';
import { runModelWatch } from '$lib/server/ai/model-watch/evaluate';
import { getState, startRun } from '$lib/server/ai/model-watch/state';
import type { RequestHandler } from './$types';

// Machine-to-machine endpoint for the monthly model-watch cron job (see
// scripts/model-watch/ at the repo root). Not a user-facing admin feature:
// the caller is a host script with no login of its own, so it authenticates
// with a shared secret (MODEL_WATCH_TOKEN) instead of a session cookie --
// that's also why this path is listed in hooks.server.ts's PUBLIC_PREFIXES
// (it bypasses the cookie check, not auth itself). Disabled entirely (503)
// unless the token is configured, so it's inert by default.
//
// A full run can take well over an hour (pulling several multi-GB
// candidate models one at a time) -- far longer than any request should
// stay open -- so POST only starts it in the background and returns
// immediately; the host script polls GET for the result.

function authorized(request: Request): boolean {
	const token = env.MODEL_WATCH_TOKEN;
	if (!token) return false;
	return request.headers.get('authorization') === `Bearer ${token}`;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!env.MODEL_WATCH_TOKEN) return json({ ok: false, error: 'MODEL_WATCH_TOKEN not configured' }, { status: 503 });
	if (!authorized(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
	if (!aiConfigured()) return json({ ok: false, error: 'OLLAMA_URL not configured' }, { status: 503 });

	const body = await request.json().catch(() => ({}));
	const vramTotalGb = Number(body?.vramTotalGb);
	const vramBudgetGb = Number(body?.vramBudgetGb);
	if (!Number.isFinite(vramTotalGb) || !Number.isFinite(vramBudgetGb) || vramBudgetGb <= 0) {
		return json({ ok: false, error: 'vramTotalGb/vramBudgetGb required (positive numbers)' }, { status: 400 });
	}

	const maxCandidates = Math.max(1, parseInt(env.MODEL_WATCH_MAX_CANDIDATES ?? '3', 10) || 3);
	const minImprovement = parseFloat(env.MODEL_WATCH_MIN_IMPROVEMENT ?? '5') || 5;
	const baselineModel = currentChatModel();

	const started = startRun(() =>
		runModelWatch({ baselineModel, vramTotalGb, vramBudgetGb, maxCandidates, minImprovement })
	);
	return json({ ok: true, started, alreadyRunning: !started, baselineModel });
};

export const GET: RequestHandler = async ({ request }) => {
	if (!env.MODEL_WATCH_TOKEN) return json({ ok: false, error: 'MODEL_WATCH_TOKEN not configured' }, { status: 503 });
	if (!authorized(request)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
	return json(getState());
};
