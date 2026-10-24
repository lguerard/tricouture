import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));
const harvest = vi.fn();
vi.mock('$lib/server/ai/model-eval/harvest', () => ({ harvestCases: harvest }));
const evaluate = vi.fn();
vi.mock('$lib/server/ai/model-eval/evaluate', async (orig) => ({
	...(await orig<typeof import('$lib/server/ai/model-eval/evaluate')>()),
	evaluateModel: evaluate
}));

const { POST } = await import('./+server');
const { BUNDLED } = await import('$lib/server/ai/model-eval/cases');

function call(body: unknown, auth?: string) {
	const request = new Request('http://localhost/api/cron/model-eval', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
		body: JSON.stringify(body)
	});
	return POST({ request } as Parameters<typeof POST>[0]);
}

beforeEach(() => {
	for (const k of Object.keys(env)) delete env[k];
	env.MODEL_WATCH_TOKEN = 'secret';
	env.OLLAMA_URL = 'http://ollama:11434';
	harvest.mockReset().mockResolvedValue({ cases: BUNDLED, warnings: [] });
	evaluate.mockReset().mockResolvedValue({ app: 'tricouture', model: 'm', tasks: {}, eval_tokens_per_s: null, cases_hash: 'x' });
});

describe('POST /api/cron/model-eval', () => {
	it('is disabled (503) without MODEL_WATCH_TOKEN', async () => {
		delete env.MODEL_WATCH_TOKEN;
		expect((await call({ model: 'm' }, 'Bearer secret')).status).toBe(503);
	});

	it('rejects a missing or wrong token', async () => {
		expect((await call({ model: 'm' })).status).toBe(401);
		expect((await call({ model: 'm' }, 'Bearer nope')).status).toBe(401);
		expect(harvest).not.toHaveBeenCalled();
	});

	it('requires a model', async () => {
		expect((await call({}, 'Bearer secret')).status).toBe(400);
	});

	it('counts the cases only when dry', async () => {
		const res = await call({ model: 'm', dry: true, maxCases: 5 }, 'Bearer secret');
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.cases_only).toBe(true);
		expect(body.tasks.pieces.n).toBe(3);
		expect(harvest).toHaveBeenCalledWith(5);
		expect(evaluate).not.toHaveBeenCalled();
	});

	it('evaluates the given model, with a bounded case count', async () => {
		const res = await call({ model: ' qwen3.5:9b ', maxCases: 999 }, 'Bearer secret');
		expect(res.status).toBe(200);
		expect(harvest).toHaveBeenCalledWith(50);
		expect(evaluate).toHaveBeenCalledWith('qwen3.5:9b', BUNDLED, []);
	});

	it('answers 503 when Ollama is not configured', async () => {
		delete env.OLLAMA_URL;
		expect((await call({ model: 'm' }, 'Bearer secret')).status).toBe(503);
	});
});
