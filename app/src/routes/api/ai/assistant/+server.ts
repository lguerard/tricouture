import { json } from '@sveltejs/kit';
import { aiConfigured, AiTimeout, AiUnavailable, GENERATE_TIMEOUT_MS } from '$lib/server/ai/ollama';
import { dbData } from '$lib/server/assistant/data';
import { MAX_BODY_CHARS, parseBody, TooLong } from '$lib/server/assistant/budget';
import { tryLock } from '$lib/server/assistant/lock';
import { prepareConversation, runAssistant, type RunOptions } from '$lib/server/assistant/loop';
import { sseFrame, type AssistantEvent } from '$lib/assistant/events';
import type { RequestHandler } from './$types';

// While the request waits for the GPU (another AI job ahead of it), a comment
// line every few seconds keeps proxies and tunnels from closing an idle
// connection (Cloudflare gives up after 100 s without a byte).
const HEARTBEAT_MS = 15_000;

const ERRORS = {
	timeout:
		"L'assistant n'a pas répondu à temps (3 min). Le serveur IA est peut-être occupé par une autre tâche : réessaie dans un moment.",
	unavailable: "Le service IA est indisponible pour l'instant (Ollama injoignable).",
	failed: "L'assistant a rencontré une erreur. Réessaie, ou reformule la question."
} as const;

// The in-app assistant (chat panel). Body: { messages: [{role, content}...],
// context?: {kind, id, row?} }; the conversation is held by the client.
// Answers a stream of SSE frames (see $lib/assistant/events), or a JSON error
// before the stream starts: 400 bad body, 413 too long, 429 an answer already
// in progress for this account, 503 AI not configured.
export const POST: RequestHandler = async ({ request, locals }) => {
	const uid = locals.user!.id;
	if (!aiConfigured()) return json({ error: 'AI not configured' }, { status: 503 });

	const raw = await request.text().catch(() => '');
	if (raw.length > MAX_BODY_CHARS) return json({ error: 'request too large' }, { status: 413 });
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return json({ error: 'invalid JSON' }, { status: 400 });
	}
	const parsed = parseBody(body);
	if ('status' in parsed) return json({ error: parsed.error }, { status: parsed.status });

	const release = tryLock(uid);
	if (!release) return json({ error: 'busy' }, { status: 429 });

	const abort = new AbortController();
	const deadline = Date.now() + GENERATE_TIMEOUT_MS;
	const opts: RunOptions = {
		uid,
		messages: parsed.messages,
		context: parsed.context,
		data: dbData,
		emit: () => {},
		signal: abort.signal,
		deadline
	};

	let prepared;
	try {
		prepared = await prepareConversation(opts);
	} catch (e) {
		release();
		if (e instanceof TooLong) return json({ error: 'message too long' }, { status: 413 });
		throw e;
	}

	// The person closed the panel / pressed stop: stop generating for nobody.
	request.signal?.addEventListener('abort', () => abort.abort(new DOMException('client gone', 'AbortError')));

	const encoder = new TextEncoder();
	let closed = false;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const write = (s: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(s));
				} catch {
					closed = true;
				}
			};
			const emit = (e: AssistantEvent) => write(sseFrame(e));
			heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
			let timedOut = false;
			timer = setTimeout(() => {
				timedOut = true;
				abort.abort(new AiTimeout(GENERATE_TIMEOUT_MS));
			}, GENERATE_TIMEOUT_MS);

			runAssistant({ ...opts, emit }, prepared)
				.then(() => emit({ t: 'done' }))
				.catch((e) => {
					if (abort.signal.aborted && !timedOut) return; // stopped by the person
					const code = timedOut || e instanceof AiTimeout ? 'timeout' : e instanceof AiUnavailable ? 'unavailable' : 'failed';
					if (code === 'failed') console.error('assistant failed:', e);
					emit({ t: 'error', code, message: ERRORS[code] });
				})
				.finally(() => {
					clearInterval(heartbeat);
					clearTimeout(timer);
					release();
					if (!closed) {
						closed = true;
						try {
							controller.close();
						} catch {
							/* already closed by the client */
						}
					}
				});
		},
		cancel() {
			closed = true;
			abort.abort(new DOMException('client gone', 'AbortError'));
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			// nginx: do not buffer this response.
			'x-accel-buffering': 'no'
		}
	});
};
