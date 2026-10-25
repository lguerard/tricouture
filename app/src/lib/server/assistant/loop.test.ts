import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantEvent } from '$lib/assistant/events';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const { runAssistant, prepareConversation, MAX_ROUNDS } = await import('./loop');
const { TooLong } = await import('./budget');
const { AiTimeout, AiUnavailable } = await import('$lib/server/ai/ollama');
const T = await import('./testing');
const { mockOllama, says, calls } = await import('./ollamaMock');

const now = new Date('2026-10-25T10:00:00Z');

function run(messages: { role: 'user' | 'assistant'; content: string }[], extra: Record<string, unknown> = {}) {
	const events: AssistantEvent[] = [];
	const f = T.fakeData();
	const p = runAssistant({ uid: T.ALICE, messages, data: f.data, emit: (e) => events.push(e), now, ...extra });
	return { p, events, f };
}
const text = (events: AssistantEvent[]) => events.map((e) => (e.t === 'delta' ? e.text : '')).join('');

beforeEach(() => {
	for (const k of Object.keys(env)) delete env[k];
	env.OLLAMA_URL = 'http://ollama:11434';
});
afterEach(() => vi.unstubAllGlobals());

describe('assistant tool loop', () => {
	it('runs a tool, feeds the result back, then streams the answer', async () => {
		const { bodies } = mockOllama(
			calls({ name: 'projets_en_cours', arguments: {} }),
			says('Tu en es au rang 42 sur 120 de **Mon pull**.')
		);
		const { p, events } = run([{ role: 'user', content: 'Où en suis-je de mon pull ?' }]);
		await p;

		expect(text(events)).toBe('Tu en es au rang 42 sur 120 de **Mon pull**.');
		expect(events.filter((e) => e.t === 'delta').length).toBeGreaterThan(3); // streamed, not in one piece
		expect(events).toContainEqual({ t: 'tool', name: 'projets_en_cours' });
		expect(events).toContainEqual({ t: 'refs', items: [expect.objectContaining({ kind: 'project', title: 'Mon pull', href: `/projects/${T.ALICE_PROJECT}` })] });

		const [first, second] = bodies();
		expect(first).toMatchObject({ model: 'gemma4:12b', stream: true, think: false, options: { num_ctx: 8192 } });
		expect(first.tools.map((t: { function: { name: string } }) => t.function.name)).toContain('chercher_patrons');
		expect(first.messages[0].role).toBe('system');
		expect(first.messages[0].content).toContain('dimanche 25 octobre 2026');
		expect(first.messages.at(-1)).toEqual({ role: 'user', content: 'Où en suis-je de mon pull ?' });
		// Round 2 replays the call and its result.
		expect(second.messages.at(-2)).toMatchObject({ role: 'assistant', tool_calls: [{ function: { name: 'projets_en_cours' } }] });
		expect(second.messages.at(-1)).toMatchObject({ role: 'tool', tool_name: 'projets_en_cours' });
		expect(second.messages.at(-1).content).toContain('"rang":42');
	});

	it("sends tool errors back to the model -- someone else's pattern stays unreadable", async () => {
		const { bodies } = mockOllama(calls({ name: 'lire_patron', arguments: { id: T.BOB_PATTERN } }), says('Je ne trouve pas ce patron.'));
		const { p, events } = run([{ role: 'user', content: 'Lis le patron de Bob' }]);
		await p;
		const toolMsg = bodies()[1].messages.at(-1);
		expect(toolMsg.role).toBe('tool');
		expect(toolMsg.content).toContain('introuvable');
		expect(JSON.stringify(bodies())).not.toContain('texte privé de bob');
		expect(events.some((e) => e.t === 'refs')).toBe(false);
	});

	it('stops after MAX_ROUNDS model calls, the last one without tools', async () => {
		const { bodies, fetchMock } = mockOllama(
			calls({ name: 'chercher_laines', arguments: {} }),
			calls({ name: 'chercher_laines', arguments: {} }),
			calls({ name: 'chercher_laines', arguments: {} }),
			calls({ name: 'chercher_laines', arguments: {} }),
			says('Voilà.')
		);
		const { p, events } = run([{ role: 'user', content: 'Mes laines ?' }]);
		await p;
		expect(fetchMock).toHaveBeenCalledTimes(MAX_ROUNDS);
		expect(bodies().at(-1).tools).toBeUndefined();
		expect(bodies()[0].tools).toBeDefined();
		// The same yarn card is sent once.
		expect(events.filter((e) => e.t === 'refs')).toHaveLength(1);
		expect(text(events)).toBe('Voilà.');
	});

	it('puts the object open on screen in the system prompt', async () => {
		const { bodies } = mockOllama(says('Ce patron se tricote en 22 m.'));
		const { p } = run([{ role: 'user', content: 'Quelle jauge ?' }], { context: { kind: 'pattern', id: T.ALICE_PATTERN } });
		await p;
		expect(bodies()[0].messages[0].content).toContain("Patron ouvert à l'écran");
		expect(bodies()[0].messages[0].content).toContain('Pull Aran');
	});

	it('maps a timeout and an unreachable Ollama to AiUnavailable errors', async () => {
		mockOllama(() => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' })));
		await expect(run([{ role: 'user', content: 'x' }]).p).rejects.toBeInstanceOf(AiTimeout);
		mockOllama(() => Promise.reject(new TypeError('fetch failed')));
		await expect(run([{ role: 'user', content: 'x' }]).p).rejects.toBeInstanceOf(AiUnavailable);
		mockOllama(says('x'));
		await expect(run([{ role: 'user', content: 'x' }], { deadline: Date.now() - 1 }).p).rejects.toBeInstanceOf(AiTimeout);
	});

	it('passes a stop from the person through unchanged', async () => {
		const ctrl = new AbortController();
		const reason = new DOMException('stop', 'AbortError');
		mockOllama(() => {
			ctrl.abort(reason);
			return Promise.reject(reason);
		});
		await expect(run([{ role: 'user', content: 'x' }], { signal: ctrl.signal }).p).rejects.toBe(reason);
	});

	it('retries without tools when the model does not support them', async () => {
		const { bodies } = mockOllama(
			() => new Response('{"error":"gemma:2b does not support tools"}', { status: 400 }),
			says('Bonjour !')
		);
		const { p, events } = run([{ role: 'user', content: 'Salut' }]);
		await p;
		expect(bodies()[1].tools).toBeUndefined();
		expect(text(events)).toBe('Bonjour !');
	});
});

describe('prepareConversation', () => {
	it('trims old turns to the budget but keeps the question', async () => {
		const f = T.fakeData();
		const long = 'blabla '.repeat(400); // ~700 tokens each
		const messages = [];
		for (let i = 0; i < 20; i++) messages.push({ role: 'user' as const, content: `${i} ${long}` }, { role: 'assistant' as const, content: long });
		messages.push({ role: 'user' as const, content: 'Et maintenant ?' });
		const conv = await prepareConversation({ uid: T.ALICE, messages, data: f.data, emit: () => {}, now });
		expect(conv.length).toBeLessThan(messages.length);
		expect(conv.at(-1)).toEqual({ role: 'user', content: 'Et maintenant ?' });
		expect(conv[1].role).toBe('user');
		const chars = conv.reduce((n, m) => n + m.content.length, 0);
		expect(chars / 4).toBeLessThan(8192);
	});

	it('refuses a question that cannot fit (TooLong)', async () => {
		env.OLLAMA_NUM_CTX = '2048';
		const f = T.fakeData();
		await expect(
			prepareConversation({ uid: T.ALICE, messages: [{ role: 'user', content: 'x'.repeat(3_900) }], data: f.data, emit: () => {}, now })
		).rejects.toBeInstanceOf(TooLong);
	});
});
