import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const { generate, buildGenerateBody, AiUnavailable, GENERATE_TIMEOUT_MS } = await import('./ollama');

type FetchArgs = [string, RequestInit];
const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();

function reply(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sentBody(call = 0): Record<string, unknown> {
	return JSON.parse(String(fetchMock.mock.calls[call][1].body));
}

beforeEach(() => {
	for (const k of Object.keys(env)) delete env[k];
	env.OLLAMA_URL = 'http://ollama:11434/';
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('generate request shape', () => {
	it('turns thinking off, sends num_ctx and a timeout by default', async () => {
		const timeout = vi.spyOn(AbortSignal, 'timeout');
		fetchMock.mockResolvedValue(reply({ response: ' bonjour ' }));
		await expect(generate('salut', 'sys')).resolves.toBe('bonjour');

		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('http://ollama:11434/api/generate');
		expect(sentBody()).toEqual({
			model: 'gemma4:12b',
			prompt: 'salut',
			system: 'sys',
			stream: false,
			think: false,
			options: { num_ctx: 8192 }
		});
		expect(timeout).toHaveBeenCalledWith(GENERATE_TIMEOUT_MS);
		expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
		timeout.mockRestore();
	});

	it('honours OLLAMA_NUM_CTX / OLLAMA_CHAT_MODEL and per-call options', async () => {
		env.OLLAMA_NUM_CTX = '4096';
		env.OLLAMA_CHAT_MODEL = 'other:7b';
		const timeout = vi.spyOn(AbortSignal, 'timeout');
		fetchMock.mockResolvedValue(reply({ response: '{}' }));
		const schema = { type: 'object', properties: { a: { type: 'string' } } };
		await generate('p', undefined, undefined, { schema, temperature: 0, think: true, timeoutMs: 5000, maxTokens: 300 });
		expect(sentBody()).toEqual({
			model: 'other:7b',
			prompt: 'p',
			stream: false,
			think: true,
			format: schema,
			options: { num_ctx: 4096, temperature: 0, num_predict: 300 }
		});
		expect(timeout).toHaveBeenCalledWith(5000);
		timeout.mockRestore();
	});

	it('keeps plain JSON mode, and a schema wins over it', () => {
		expect(buildGenerateBody('p', undefined, 'm', { json: true }).format).toBe('json');
		expect(buildGenerateBody('p', undefined, 'm', { json: true, schema: { type: 'object' } }).format).toEqual({ type: 'object' });
	});

	it('falls back to the default num_ctx on a nonsense value', () => {
		env.OLLAMA_NUM_CTX = 'lots';
		expect(buildGenerateBody('p', undefined, 'm', {}).options.num_ctx).toBe(8192);
	});

	it('strips a leading reasoning block from the reply', async () => {
		fetchMock.mockResolvedValue(reply({ response: '<think>hmm</think>\nRang suivant' }));
		await expect(generate('p')).resolves.toBe('Rang suivant');
	});

	it('reports a timeout as AiUnavailable', async () => {
		fetchMock.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
		await expect(generate('p', undefined, undefined, { timeoutMs: 1000 })).rejects.toBeInstanceOf(AiUnavailable);
	});

	it('does not call Ollama when it is not configured', async () => {
		env.OLLAMA_URL = '';
		await expect(generate('p')).rejects.toBeInstanceOf(AiUnavailable);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('embed', () => {
	it('uses /api/embed with `input` and reads embeddings[0]', async () => {
		const { embed } = await import('./ollama');
		fetchMock.mockResolvedValue(reply({ embeddings: [[0.1, 0.2, 0.3]] }));
		await expect(embed('pull chaud')).resolves.toEqual([0.1, 0.2, 0.3]);
		expect(fetchMock.mock.calls[0][0]).toBe('http://ollama:11434/api/embed');
		expect(sentBody()).toEqual({ model: 'nomic-embed-text', input: 'pull chaud' });
	});

	it('falls back to the legacy /api/embeddings on a 404', async () => {
		const { embed } = await import('./ollama');
		fetchMock.mockResolvedValueOnce(reply({ error: 'not found' }, 404)).mockResolvedValueOnce(reply({ embedding: [1, 2] }));
		await expect(embed('x')).resolves.toEqual([1, 2]);
		expect(fetchMock.mock.calls[1][0]).toBe('http://ollama:11434/api/embeddings');
		expect(sentBody(1)).toEqual({ model: 'nomic-embed-text', prompt: 'x' });
	});

	it('does not retry on other errors', async () => {
		const { embed } = await import('./ollama');
		fetchMock.mockResolvedValue(reply({ error: 'boom' }, 500));
		await expect(embed('x')).rejects.toThrow('Ollama 500');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
