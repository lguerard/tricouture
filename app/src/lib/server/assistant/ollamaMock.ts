// Test helper: a fetch stand-in for Ollama's streaming /api/chat. Each queued
// reply is a list of NDJSON chunks, sent in pieces to exercise line splitting.
import { vi } from 'vitest';

type Chunk = Record<string, unknown>;

export function ndjson(chunks: Chunk[], split = 9): Response {
	const text = chunks.map((c) => JSON.stringify(c)).join('\n') + '\n';
	const enc = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (let i = 0; i < text.length; i += split) controller.enqueue(enc.encode(text.slice(i, i + split)));
			controller.close();
		}
	});
	return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}

// Model reply streaming `text` word by word.
export const says = (text: string): Chunk[] => [
	...text.split(/(?<= )/).map((w) => ({ message: { role: 'assistant', content: w }, done: false })),
	{ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
];

// Model reply calling tools.
export const calls = (...c: { name: string; arguments: Record<string, unknown> }[]): Chunk[] => [
	{ message: { role: 'assistant', content: '', tool_calls: c.map((f) => ({ function: f })) }, done: false },
	{ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
];

export function mockOllama(...replies: (Chunk[] | (() => Response | Promise<Response>))[]) {
	const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
	let i = 0;
	fetchMock.mockImplementation(async () => {
		const r = replies[Math.min(i++, replies.length - 1)];
		return typeof r === 'function' ? r() : ndjson(r);
	});
	vi.stubGlobal('fetch', fetchMock);
	const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse(String(c[1].body)));
	return { fetchMock, bodies };
}
