// One assistant turn: system prompt + trimmed history + the new question, then
// Ollama's tool-calling loop. Each model call is streamed; its text goes to
// the person as it comes (`emit`), its tool calls are run (tools.ts, scoped to
// the account) and their results fed back, up to MAX_ROUNDS model calls --
// the last one without tools, so the turn always ends with an answer.
import { chat, numCtx, GENERATE_TIMEOUT_MS, AiTimeout, type ChatMessage } from '$lib/server/ai/ollama';
import type { AssistantContext, AssistantEvent, AssistantRef, WireMessage } from '$lib/assistant/events';
import type { AssistantData } from './data';
import { TOOLS, describeContext, runTool, type ToolEnv } from './tools';
import { assistantSystem } from './prompt';
import { ANSWER_RESERVE_TOKENS, conversationTokens, estimateTokens, fitConversation, trimHistory, TooLong } from './budget';

export const MAX_ROUNDS = 5;
export const MAX_CALLS_PER_ROUND = 4;
// Lower than the model default: tool arguments and figures want precision.
const TEMPERATURE = 0.4;

export type RunOptions = {
	uid: string;
	messages: WireMessage[];
	context?: AssistantContext;
	data: AssistantData;
	emit: (e: AssistantEvent) => void;
	signal?: AbortSignal;
	now?: Date;
	// Epoch ms by which the whole turn must be over (default: now + 180 s).
	deadline?: number;
};

// Builds the opening of the conversation; throws TooLong when the question
// cannot fit next to the system prompt and the tools. Exported for the route,
// which checks this BEFORE starting the stream (to answer a plain 413).
export async function prepareConversation(o: RunOptions): Promise<ChatMessage[]> {
	const env: ToolEnv = { uid: o.uid, data: o.data, now: o.now ?? new Date() };
	const ctx = o.context ? await describeContext(o.context, env) : null;
	const system = assistantSystem(env.now, ctx?.text);
	const fixed = estimateTokens(system) + conversationTokens([], TOOLS) + 4;
	const budget = numCtx() - ANSWER_RESERVE_TOKENS - fixed;
	if (budget <= 0) throw new TooLong('no room left for the question');
	const history = trimHistory(o.messages, budget);
	return [{ role: 'system', content: system }, ...history.map((m) => ({ role: m.role, content: m.content }))];
}

export async function runAssistant(o: RunOptions, prepared?: ChatMessage[]): Promise<void> {
	const env: ToolEnv = { uid: o.uid, data: o.data, now: o.now ?? new Date() };
	const deadline = o.deadline ?? Date.now() + GENERATE_TIMEOUT_MS;
	const conv = prepared ?? (await prepareConversation(o));
	const currentStart = conv.length - 1; // index of the new question
	const limit = numCtx() - ANSWER_RESERVE_TOKENS;
	const seen = new Set<string>();
	let answered = false;

	for (let round = 0; round < MAX_ROUNDS; round++) {
		const tools = round < MAX_ROUNDS - 1 ? TOOLS : undefined;
		fitConversation(conv, limit, currentStart, tools);
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new AiTimeout(GENERATE_TIMEOUT_MS);

		let roundText = false;
		const res = await chat(conv, {
			tools,
			temperature: TEMPERATURE,
			signal: o.signal,
			timeoutMs: remaining,
			onDelta: (text) => {
				answered = roundText = true;
				o.emit({ t: 'delta', text });
			}
		});
		if (!res.toolCalls.length) break;
		// A sentence before the tool calls ("Je regarde ton stock…"): keep the
		// answer that follows in its own paragraph.
		if (roundText) o.emit({ t: 'delta', text: '\n\n' });

		conv.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls });
		for (const [i, call] of res.toolCalls.entries()) {
			const name = call.function?.name ?? '?';
			if (i >= MAX_CALLS_PER_ROUND) {
				conv.push({ role: 'tool', tool_name: name, content: '{"erreur":"trop d\'appels d\'outils à la fois, refais-le au tour suivant"}' });
				continue;
			}
			o.emit({ t: 'tool', name });
			const out = await runTool(call, env);
			conv.push({ role: 'tool', tool_name: name, content: out.content });
			const fresh = (out.refs ?? []).filter((r: AssistantRef) => {
				const key = `${r.kind}:${r.id}`;
				return !seen.has(key) && seen.add(key);
			});
			if (fresh.length) o.emit({ t: 'refs', items: fresh });
			if (out.action) o.emit({ t: 'action', action: out.action });
		}
	}
	if (!answered) o.emit({ t: 'delta', text: "Désolé, je n'ai pas réussi à formuler de réponse. Peux-tu reformuler ?" });
}
