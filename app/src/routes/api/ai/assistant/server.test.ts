import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSseParser, type AssistantEvent } from '$lib/assistant/events';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));
// Short overall deadline so the timeout case runs in milliseconds.
vi.mock('$lib/server/ai/ollama', async (orig) => ({
	...(await orig<typeof import('$lib/server/ai/ollama')>()),
	GENERATE_TIMEOUT_MS: 300
}));
const T = await import('$lib/server/assistant/testing');
let fake = T.fakeData();
vi.mock('$lib/server/assistant/data', async (orig) => ({
	...(await orig<typeof import('$lib/server/assistant/data')>()),
	get dbData() {
		return fake.data;
	}
}));

const { POST } = await import('./+server');
const { isLocked, tryLock } = await import('$lib/server/assistant/lock');
const { mockOllama, says, calls } = await import('$lib/server/assistant/ollamaMock');

function post(body: unknown, uid = T.ALICE) {
	const request = new Request('http://localhost/api/ai/assistant', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
	return POST({ request, locals: { user: { id: uid } } } as unknown as Parameters<typeof POST>[0]);
}

async function readEvents(res: Response): Promise<AssistantEvent[]> {
	const events: AssistantEvent[] = [];
	const push = createSseParser((e) => events.push(e));
	const reader = res.body!.getReader();
	const dec = new TextDecoder();
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		push(dec.decode(value, { stream: true }));
	}
	return events;
}

const ask = (content: string, extra: Record<string, unknown> = {}) => ({ messages: [{ role: 'user', content }], ...extra });

beforeEach(() => {
	for (const k of Object.keys(env)) delete env[k];
	env.OLLAMA_URL = 'http://ollama:11434';
	fake = T.fakeData();
});
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/ai/assistant', () => {
	it('streams the answer as SSE frames, with tool cards, then done', async () => {
		mockOllama(calls({ name: 'chercher_laines', arguments: { couleur: 'bleu' } }), says('Ta **Merino** bleu nuit irait bien.'));
		const res = await post(ask('Quelle laine bleue ?'));
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/event-stream');
		const events = await readEvents(res);
		expect(events[0]).toEqual({ t: 'tool', name: 'chercher_laines' });
		expect(events).toContainEqual({ t: 'refs', items: [expect.objectContaining({ kind: 'yarn', id: T.ALICE_YARN })] });
		expect(events.filter((e) => e.t === 'delta').map((e) => (e as { text: string }).text).join('')).toBe('Ta **Merino** bleu nuit irait bien.');
		expect(events.at(-1)).toEqual({ t: 'done' });
		expect(isLocked(T.ALICE)).toBe(false);
	});

	it('reports a note added to a project as an action', async () => {
		mockOllama(calls({ name: 'ajouter_note_projet', arguments: { id: T.ALICE_PROJECT, texte: 'rang 42 : diminutions' } }), says('Note ajoutée.'));
		const events = await readEvents(await post(ask('Note dans mon pull : rang 42 diminutions')));
		expect(events).toContainEqual({ t: 'action', action: { kind: 'note_added', title: 'Mon pull', href: `/projects/${T.ALICE_PROJECT}` } });
		expect(fake.notes).toHaveLength(1);
	});

	it('answers 400 / 413 / 503 before streaming', async () => {
		expect((await post('{nope')).status).toBe(400);
		expect((await post({ messages: [{ role: 'system', content: 'x' }] })).status).toBe(400);
		expect((await post(ask('x'.repeat(4_001)))).status).toBe(413);
		expect((await post('x'.repeat(200_001))).status).toBe(413);
		env.OLLAMA_NUM_CTX = '1024';
		expect((await post(ask('x'.repeat(3_000)))).status).toBe(413);
		delete env.OLLAMA_URL;
		expect((await post(ask('hello'))).status).toBe(503);
		expect(isLocked(T.ALICE)).toBe(false);
	});

	it('allows one answer at a time per account (429)', async () => {
		const release = tryLock(T.ALICE)!;
		mockOllama(says('ok'));
		expect((await post(ask('encore ?'))).status).toBe(429);
		// Another account is not blocked.
		expect((await post(ask('moi ?'), T.BOB)).status).toBe(200);
		release();
		expect((await post(ask('et là ?'))).status).toBe(200);
	});

	it('streams a French timeout error when Ollama does not answer in time', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))))
		);
		const events = await readEvents(await post(ask('Explique-moi ce point')));
		expect(events.at(-1)).toMatchObject({ t: 'error', code: 'timeout' });
		expect((events.at(-1) as { message: string }).message).toMatch(/pas répondu à temps/);
		expect(isLocked(T.ALICE)).toBe(false);
	});

	it('streams an "unavailable" error when Ollama is down', async () => {
		vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fetch failed'))));
		const events = await readEvents(await post(ask('hello')));
		expect(events.at(-1)).toMatchObject({ t: 'error', code: 'unavailable' });
	});

	it('stops generating and frees the account when the client goes away', async () => {
		let aborted = false;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_u: string, init: RequestInit) =>
					new Promise((_r, reject) =>
						init.signal!.addEventListener('abort', () => {
							aborted = true;
							reject(init.signal!.reason);
						})
					)
			)
		);
		const res = await post(ask('long'));
		await new Promise((r) => setTimeout(r, 10));
		await res.body!.cancel();
		await new Promise((r) => setTimeout(r, 10));
		expect(aborted).toBe(true);
		expect(isLocked(T.ALICE)).toBe(false);
	});
});
