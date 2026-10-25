// Context budget of the assistant. Every model call runs with the shared
// num_ctx (8192 by default, ollama.ts) which must hold the system prompt, the
// tool definitions, the conversation, the tool results AND the answer. Token
// counts are estimated at ~4 characters per token (no tokenizer on this side):
// rough, hence the generous answer reserve.
import type { ChatMessage, ChatTool } from '$lib/server/ai/ollama';
import type { AssistantContext, WireMessage } from '$lib/assistant/events';
import { isUuid } from '$lib/uuid';

export const CHARS_PER_TOKEN = 4;
// Room left for the answer itself (and the estimate's error).
export const ANSWER_RESERVE_TOKENS = 1_536;
// One question: ~1 000 tokens. Longer is refused with a 413 (paste a pattern
// excerpt, not a whole pattern -- the tools read the stored text).
export const MAX_USER_CHARS = 4_000;
// Older messages are cut to this when replayed (an assistant answer can be long).
export const MAX_HISTORY_MESSAGE_CHARS = 3_000;
export const MAX_MESSAGES = 60;
export const MAX_BODY_CHARS = 200_000;

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function messageTokens(m: ChatMessage): number {
	return estimateTokens(m.content) + (m.tool_calls ? estimateTokens(JSON.stringify(m.tool_calls)) : 0) + 4;
}

export function conversationTokens(messages: ChatMessage[], tools?: ChatTool[]): number {
	return messages.reduce((n, m) => n + messageTokens(m), 0) + (tools?.length ? estimateTokens(JSON.stringify(tools)) : 0);
}

export class TooLong extends Error {}

export type ParsedBody = { messages: WireMessage[]; context?: AssistantContext };
export type BodyProblem = { status: 400 | 413; error: string };

// Checks the request body: client-held conversation (user/assistant text
// only -- the client never sends system or tool messages), ending with the
// new question, plus an optional on-screen context.
export function parseBody(raw: unknown): ParsedBody | BodyProblem {
	const b = raw as { messages?: unknown; context?: unknown } | null;
	if (!b || !Array.isArray(b.messages) || b.messages.length === 0) return { status: 400, error: 'messages required' };
	const messages: WireMessage[] = [];
	for (const m of b.messages.slice(-MAX_MESSAGES)) {
		const role = (m as WireMessage)?.role;
		const content = (m as WireMessage)?.content;
		if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
			return { status: 400, error: 'each message needs role "user" or "assistant" and a text content' };
		}
		if (content.trim()) messages.push({ role, content });
	}
	const last = messages.at(-1);
	if (!last || last.role !== 'user') return { status: 400, error: 'the last message must be the question' };
	if (last.content.length > MAX_USER_CHARS) return { status: 413, error: `message too long (max ${MAX_USER_CHARS} characters)` };
	for (const m of messages.slice(0, -1)) {
		if (m.content.length > MAX_HISTORY_MESSAGE_CHARS) m.content = `${m.content.slice(0, MAX_HISTORY_MESSAGE_CHARS)}…`;
	}

	let context: AssistantContext | undefined;
	const c = b.context as Partial<AssistantContext> | null | undefined;
	if (c != null) {
		if (!c || !['pattern', 'project', 'yarn'].includes(c.kind as string) || !isUuid(c.id)) {
			return { status: 400, error: 'invalid context' };
		}
		const row = typeof c.row === 'number' && Number.isInteger(c.row) && c.row >= 0 && c.row < 1_000_000 ? c.row : undefined;
		context = { kind: c.kind!, id: c.id!, ...(row != null ? { row } : {}) };
	}
	return { messages, context };
}

// Keeps the most recent turns that fit `budget` tokens, oldest dropped first;
// the replayed history always starts with a question. Throws TooLong when even
// the last question alone does not fit.
export function trimHistory(messages: WireMessage[], budget: number): WireMessage[] {
	const kept: WireMessage[] = [];
	let used = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		const cost = messageTokens(messages[i]);
		if (used + cost > budget) break;
		kept.unshift(messages[i]);
		used += cost;
	}
	if (!kept.length) throw new TooLong('question too long for the context');
	while (kept.length > 1 && kept[0].role !== 'user') kept.shift();
	return kept;
}

const DROPPED_RESULT = '{"note":"résultat retiré pour tenir dans le contexte"}';

// Inside one turn, between two tool rounds: when the conversation outgrows
// `limit`, older tool results are replaced by a stub first, then replayed
// history before the current question (`currentStart`) is dropped. Mutates
// and returns `conv`; conv[0] is the system prompt, always kept.
export function fitConversation(conv: ChatMessage[], limit: number, currentStart: number, tools?: ChatTool[]): ChatMessage[] {
	const over = () => conversationTokens(conv, tools) > limit;
	// The newest tool results are what the next answer needs: stub from the oldest.
	const toolIdx = conv.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
	for (const i of toolIdx.slice(0, -1)) {
		if (!over()) return conv;
		conv[i] = { ...conv[i], content: DROPPED_RESULT };
	}
	let start = currentStart;
	while (over() && start > 1) {
		conv.splice(1, 1);
		start--;
	}
	// Last resort: the newest result itself, cut.
	const lastTool = toolIdx.length ? conv.findLastIndex((m) => m.role === 'tool') : -1;
	if (over() && lastTool > 0) {
		const excess = (conversationTokens(conv, tools) - limit) * CHARS_PER_TOKEN;
		const c = conv[lastTool].content;
		conv[lastTool] = { ...conv[lastTool], content: `${c.slice(0, Math.max(200, c.length - excess - 40))}… [tronqué]` };
	}
	return conv;
}
