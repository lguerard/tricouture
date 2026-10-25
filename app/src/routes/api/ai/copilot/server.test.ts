import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The single-question pattern copilot stays as it was (older app builds and
// open tabs still call it), next to the new assistant.
const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));
let rows: unknown[] = [];
const chain = { from: () => chain, where: () => chain, limit: async () => rows };
vi.mock('$lib/server/db', () => ({ db: { select: () => chain } }));

const { POST } = await import('./+server');

function call(body: unknown) {
	const request = new Request('http://localhost/api/ai/copilot', { method: 'POST', body: JSON.stringify(body) });
	return POST({ request, locals: { user: { id: 'u1' } } } as unknown as Parameters<typeof POST>[0]);
}

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
beforeEach(() => {
	env.OLLAMA_URL = 'http://ollama:11434';
	rows = [{ title: 'Pull Aran', notes: null, extractedText: 'k2tog tous les 4 rangs' }];
	fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ response: ' 2 mailles ensemble. ' })));
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/ai/copilot', () => {
	it('answers a question about a pattern in one JSON reply', async () => {
		const res = await call({ patternId: 'p1', question: 'Que veut dire k2tog ?' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ result: '2 mailles ensemble.' });
		const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
		expect(fetchMock.mock.calls[0][0]).toBe('http://ollama:11434/api/generate');
		expect(sent.prompt).toContain('k2tog tous les 4 rangs');
		expect(sent.prompt).toContain('Que veut dire k2tog ?');
	});

	it('keeps its errors: 400, 404, 503', async () => {
		expect((await call({ patternId: 'p1' })).status).toBe(400);
		rows = [];
		expect((await call({ patternId: 'p1', question: 'q' })).status).toBe(404);
		rows = [{ title: 't', notes: null, extractedText: null }];
		delete env.OLLAMA_URL;
		expect((await call({ patternId: 'p1', question: 'q' })).status).toBe(503);
	});
});
