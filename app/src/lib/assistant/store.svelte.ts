import type { AssistantAction, AssistantContext, AssistantRef } from './events';

// One entry of the conversation as the panel shows it. Only role + content
// are sent back to the server (the rest is display).
export type ChatEntry = {
	role: 'user' | 'assistant';
	content: string;
	context?: AssistantContext; // user entries: what was open when asked
	refs?: AssistantRef[];
	actions?: AssistantAction[];
	tool?: string; // assistant entries: the tool running right now
	error?: string; // assistant entries: an i18n key
	stopped?: boolean;
};

const STORAGE_PREFIX = 'tricouture.assistant.v1.';
const MAX_STORED = 40;

// Shared open/close state, so any page can open the panel on its own object
// ("Demander à l'assistant" on a pattern, a project, a yarn).
class AssistantUi {
	open = $state(false);
	context = $state<AssistantContext | null>(null);
	draft = $state('');

	show(context?: AssistantContext | null, draft?: string) {
		if (context !== undefined) this.context = context;
		if (draft !== undefined) this.draft = draft;
		this.open = true;
	}
}

export const assistantUi = new AssistantUi();

export function openAssistant(context?: AssistantContext | null, draft?: string) {
	assistantUi.show(context, draft);
}

// The conversation lives in this browser only (no server-side history in v1),
// per account, and never survives a logout. Storage may be unavailable
// (private mode, blocked site data): the chat then simply starts empty.
export function loadConversation(uid: string): { entries: ChatEntry[]; context: AssistantContext | null } {
	try {
		const raw = localStorage.getItem(STORAGE_PREFIX + uid);
		if (!raw) return { entries: [], context: null };
		const saved = JSON.parse(raw);
		const entries = Array.isArray(saved?.entries) ? (saved.entries as ChatEntry[]) : [];
		return {
			entries: entries.filter((e) => (e?.role === 'user' || e?.role === 'assistant') && typeof e.content === 'string').map((e) => ({ ...e, tool: undefined })),
			context: saved?.context && typeof saved.context.id === 'string' ? saved.context : null
		};
	} catch {
		return { entries: [], context: null };
	}
}

export function saveConversation(uid: string, entries: ChatEntry[], context: AssistantContext | null) {
	try {
		if (!entries.length && !context) localStorage.removeItem(STORAGE_PREFIX + uid);
		else localStorage.setItem(STORAGE_PREFIX + uid, JSON.stringify({ entries: entries.slice(-MAX_STORED), context }));
	} catch {
		// full or blocked storage: the conversation just is not kept
	}
}

// On logout: every account's conversation on this device.
export function clearConversations() {
	try {
		for (let i = localStorage.length - 1; i >= 0; i--) {
			const k = localStorage.key(i);
			if (k?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k);
		}
	} catch {
		/* storage blocked: nothing was stored either */
	}
}
