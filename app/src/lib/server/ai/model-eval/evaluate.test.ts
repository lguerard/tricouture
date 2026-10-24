import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const { evaluateModel, casesOnly } = await import('./evaluate');
const { BUNDLED, TASKS } = await import('./cases');

type Body = { model: string; system?: string; prompt: string; format?: unknown; images?: string[]; think: boolean; options: Record<string, number> };
const bodies: Body[] = [];

function reply(response: string): Response {
	return new Response(JSON.stringify({ response, eval_count: 50, eval_duration: 1_000_000_000 }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

// A perfect model: answers each bundled case with its expected values.
function perfect(body: Body): string {
	if (body.system?.includes('étiquettes de pelotes')) {
		const merinos = BUNDLED.label[0].expected;
		return JSON.stringify({ ...merinos, metersPerSkein: merinos.yardsPerSkein, yardsPerSkein: undefined });
	}
	if (body.system?.includes('PIÈCES')) return JSON.stringify({ pieces: [{ name: 'Dos', rows: 84 }] });
	if (body.system?.includes('lecture de patrons')) return JSON.stringify({ garmentType: 'Pull', language: 'fr' });
	return 'Monter 96 m. Tricoter 12 tours en côtes, puis rabattre les mailles.';
}

beforeEach(() => {
	for (const k of Object.keys(env)) delete env[k];
	env.OLLAMA_URL = 'http://ollama:11434';
	bodies.length = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(String(init.body)) as Body;
			bodies.push(body);
			return reply(perfect(body));
		})
	);
});
afterEach(() => vi.unstubAllGlobals());

describe('evaluateModel', () => {
	it('returns the shared JSON shape, one summary per task', async () => {
		const out = await evaluateModel('candidate:9b', BUNDLED);
		expect(out.app).toBe('tricouture');
		expect(out.model).toBe('candidate:9b');
		expect(Object.keys(out.tasks).sort()).toEqual([...TASKS].sort());
		for (const t of Object.values(out.tasks)) {
			expect(Object.keys(t!).sort()).toEqual(['avg_seconds', 'failed', 'n', 'notes', 'score']);
			expect(t!.n).toBe(3);
			expect(t!.score).toBeGreaterThanOrEqual(0);
			expect(t!.score).toBeLessThanOrEqual(100);
		}
		expect(out.tasks.label!.score).toBeGreaterThan(30);
		expect(out.eval_tokens_per_s).toBe(50);
		expect(out.cases_hash).toMatch(/^[0-9a-f]{16}$/);
	});

	it('sends the production request shape with the given model', async () => {
		await evaluateModel('candidate:9b', BUNDLED);
		expect(bodies).toHaveLength(12);
		for (const b of bodies) {
			expect(b.model).toBe('candidate:9b');
			expect(b.think).toBe(false);
			expect(b.options.num_ctx).toBe(8192);
			expect(b.options.temperature).toBe(0);
		}
		expect(bodies.filter((b) => b.images?.length)).toHaveLength(3);
		expect(bodies.filter((b) => b.format)).toHaveLength(9);
	});

	it('scores unreadable JSON 0 and counts it as failed', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => reply('pas du json')));
		const out = await evaluateModel('m', BUNDLED);
		expect(out.tasks.label).toMatchObject({ score: 0, failed: 3 });
		expect(out.tasks.pattern_info).toMatchObject({ score: 0, failed: 3 });
	});

	it('reports an unreachable Ollama per case instead of throwing', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
		const out = await evaluateModel('m', BUNDLED);
		expect(out.tasks.pieces).toMatchObject({ score: 0, failed: 3, n: 3 });
		expect(out.tasks.pieces!.notes[1]).toContain('erreur');
		expect(out.eval_tokens_per_s).toBeNull();
	});
});

describe('casesOnly', () => {
	it('counts the cases without calling Ollama', () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const out = casesOnly('m', BUNDLED, ['note']);
		expect(out.tasks.label).toEqual({ n: 3, source: '3 cas fournis (pas assez de données en base)' });
		expect(out.cases_only).toBe(true);
		expect(out.warnings).toEqual(['note']);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
