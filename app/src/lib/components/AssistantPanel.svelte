<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { t, type Locale } from '$lib/i18n';
	import { mediaUrl } from '$lib/media';
	import { renderMarkdown } from '$lib/assistant/markdown';
	import { createSseParser, type AssistantEvent, type AssistantRef, type RefKind } from '$lib/assistant/events';
	import { assistantUi, loadConversation, saveConversation, type ChatEntry } from '$lib/assistant/store.svelte';

	let { locale, userId }: { locale: Locale; userId: string } = $props();

	let entries = $state<ChatEntry[]>([]);
	let busy = $state(false);
	let slow = $state(false);
	let controller: AbortController | null = null;
	let listEl = $state<HTMLDivElement>();
	let inputEl = $state<HTMLTextAreaElement>();
	let loaded = false;

	onMount(() => {
		const saved = loadConversation(userId);
		entries = saved.entries;
		if (!assistantUi.context && saved.context) assistantUi.context = saved.context;
		loaded = true;
	});

	// Saved whenever the conversation settles (not on every streamed word).
	$effect(() => {
		const snapshot = JSON.stringify(entries);
		const ctx = assistantUi.context;
		if (loaded && !busy) saveConversation(userId, JSON.parse(snapshot), ctx ? { ...ctx } : null);
	});

	$effect(() => {
		if (assistantUi.open) tick().then(() => inputEl?.focus({ preventScroll: true }));
	});

	// A card or link followed from the panel on a phone: the panel covers the
	// page, so get out of the way.
	afterNavigate(({ from }) => {
		if (from && assistantUi.open && window.matchMedia('(max-width: 720px)').matches) assistantUi.open = false;
	});

	const ICONS: Record<RefKind, string> = { pattern: '📄', project: '🧶', yarn: '🧵' };

	const suggestions = $derived.by(() => {
		const kind = assistantUi.context?.kind;
		const list: { key: string; send: boolean }[] = [];
		if (kind === 'project') list.push({ key: 'chat.suggest.thisProject', send: true });
		if (kind === 'yarn') list.push({ key: 'chat.suggest.patternForYarn', send: true });
		list.push(
			{ key: 'chat.suggest.yarnForPattern', send: kind === 'pattern' },
			{ key: 'chat.suggest.explainStitch', send: false },
			{ key: 'chat.suggest.whereAmI', send: true }
		);
		return list;
	});

	async function scrollDown(force = false) {
		await tick();
		if (!listEl) return;
		const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120;
		if (force || nearBottom) listEl.scrollTop = listEl.scrollHeight;
	}

	function useSuggestion(s: { key: string; send: boolean }) {
		const text = t(locale, s.key);
		if (s.send) return send(text);
		assistantUi.draft = text;
		inputEl?.focus();
	}

	function newConversation() {
		stop();
		entries = [];
		assistantUi.context = null;
		assistantUi.draft = '';
	}

	let stoppedAt = 0;
	function stop() {
		if (controller) stoppedAt = Date.now();
		controller?.abort();
	}

	function retry() {
		const lastUser = entries.findLastIndex((e) => e.role === 'user');
		if (lastUser === -1) return;
		const question = entries[lastUser].content;
		entries = entries.slice(0, lastUser);
		send(question);
	}

	const ERROR_BY_STATUS: Record<number, string> = {
		401: 'chat.error.unauthenticated',
		413: 'chat.error.tooLong',
		429: 'chat.error.busy',
		503: 'chat.error.unavailable'
	};

	async function send(text = assistantUi.draft) {
		const question = text.trim();
		if (!question || busy) return;
		const context = assistantUi.context ? { ...assistantUi.context } : undefined;
		const history = entries
			.filter((e) => e.content.trim() && !e.error)
			.map((e) => ({ role: e.role, content: e.content }));
		entries.push({ role: 'user', content: question, context });
		entries.push({ role: 'assistant', content: '' });
		const answer = entries[entries.length - 1];
		assistantUi.draft = '';
		busy = true;
		slow = false;
		const slowTimer = setTimeout(() => (slow = true), 8000);
		scrollDown(true);

		controller = new AbortController();
		try {
			const request = () =>
				fetch('/api/ai/assistant', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ messages: [...history, { role: 'user', content: question }], context }),
					signal: controller!.signal
				});
			let res = await request();
			// Asked again right after "stop": the server may not have noticed the
			// previous answer is gone yet. One short wait, then retry.
			if (res.status === 429 && Date.now() - stoppedAt < 3000) {
				await new Promise((r) => setTimeout(r, 800));
				res = await request();
			}
			if (!res.ok || !res.body) {
				answer.error = ERROR_BY_STATUS[res.status] ?? 'chat.error.failed';
				return;
			}
			const onEvent = (e: AssistantEvent) => {
				if (e.t === 'delta') {
					answer.content += e.text;
					answer.tool = undefined;
					slow = false;
				} else if (e.t === 'tool') answer.tool = e.name;
				else if (e.t === 'refs') {
					const known = new Set((answer.refs ?? []).map((r) => `${r.kind}:${r.id}`));
					answer.refs = [...(answer.refs ?? []), ...e.items.filter((r) => !known.has(`${r.kind}:${r.id}`))];
				} else if (e.t === 'action') answer.actions = [...(answer.actions ?? []), e.action];
				else if (e.t === 'error') answer.error = `chat.error.${e.code}`;
				scrollDown();
			};
			const push = createSseParser(onEvent);
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				push(decoder.decode(value, { stream: true }));
			}
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') answer.stopped = true;
			else answer.error = 'chat.error.network';
		} finally {
			clearTimeout(slowTimer);
			answer.tool = undefined;
			busy = false;
			slow = false;
			controller = null;
			scrollDown();
		}
	}

	function onKey(e: KeyboardEvent) {
		// Enter sends on a keyboard; on a touch screen it is a new line (the
		// send button is right there).
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !window.matchMedia('(pointer: coarse)').matches) {
			e.preventDefault();
			send();
		}
	}

	function refImage(r: AssistantRef) {
		return r.image ? mediaUrl(r.image, 200) : null;
	}
</script>

{#if !assistantUi.open}
	<button type="button" class="fab" onclick={() => assistantUi.show()} aria-label={t(locale, 'chat.open')} title={t(locale, 'chat.open')}>
		<span aria-hidden="true">💬</span>
	</button>
{:else}
	<div class="panel" role="dialog" aria-label={t(locale, 'chat.title')}>
		<header>
			<strong>🤖 {t(locale, 'chat.title')}</strong>
			<div class="head-actions">
				<button type="button" class="btn-ghost small" onclick={newConversation} disabled={!entries.length && !assistantUi.context}>
					{t(locale, 'chat.new')}
				</button>
				<button type="button" class="icon" onclick={() => (assistantUi.open = false)} aria-label={t(locale, 'chat.close')}>✕</button>
			</div>
		</header>

		<div class="messages" bind:this={listEl} aria-live="polite">
			{#if !entries.length}
				<div class="intro">
					<p>{t(locale, 'chat.intro')}</p>
					<div class="suggestions">
						{#each suggestions as s}
							<button type="button" class="suggestion" onclick={() => useSuggestion(s)}>{t(locale, s.key)}</button>
						{/each}
					</div>
				</div>
			{/if}
			{#each entries as entry, i}
				{#if entry.role === 'user'}
					<div class="msg user">
						{#if entry.context}
							<span class="ctx-mini">{ICONS[entry.context.kind]} {entry.context.title ?? t(locale, `chat.context.${entry.context.kind}`)}</span>
						{/if}
						<div class="bubble">{entry.content}</div>
					</div>
				{:else}
					<div class="msg bot">
						{#if entry.content}
							<!-- renderMarkdown escapes everything before adding its own tags -->
							<div class="bubble md">{@html renderMarkdown(entry.content)}</div>
						{:else if busy && i === entries.length - 1 && !entry.error}
							<div class="bubble pending">
								<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
								{entry.tool ? t(locale, `chat.tool.${entry.tool}`) : t(locale, 'chat.thinking')}
							</div>
						{/if}
						{#if entry.tool && entry.content}
							<div class="chip tool">⏳ {t(locale, `chat.tool.${entry.tool}`)}</div>
						{/if}
						{#if busy && slow && i === entries.length - 1 && !entry.content}
							<p class="muted small">{t(locale, 'chat.slow')}</p>
						{/if}
						{#each entry.actions ?? [] as a}
							<a class="chip action" href={a.href}>📝 {t(locale, 'chat.action.noteAdded', { title: a.title })}</a>
						{/each}
						{#if entry.refs?.length}
							<div class="refs">
								{#each entry.refs as r (`${r.kind}:${r.id}`)}
									<a class="ref" href={r.href}>
										{#if refImage(r)}
											<img src={refImage(r)} alt="" loading="lazy" />
										{:else}
											<span class="ref-ico" aria-hidden="true">{ICONS[r.kind]}</span>
										{/if}
										<span class="ref-text">
											<span class="ref-title">{r.title}</span>
											{#if r.subtitle}<span class="muted small">{r.subtitle}</span>{/if}
										</span>
									</a>
								{/each}
							</div>
						{/if}
						{#if entry.stopped}<p class="muted small">{t(locale, 'chat.stopped')}</p>{/if}
						{#if entry.error}
							<div class="error-box">
								<span>{t(locale, entry.error)}</span>
								{#if i === entries.length - 1 && !busy}
									<button type="button" class="btn-ghost small" onclick={retry}>{t(locale, 'chat.retry')}</button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>

		<footer>
			{#if assistantUi.context}
				<div class="ctx">
					<span>{ICONS[assistantUi.context.kind]} {t(locale, `chat.context.${assistantUi.context.kind}`)} :
						<strong>{assistantUi.context.title ?? '…'}</strong></span>
					<button type="button" class="icon" onclick={() => (assistantUi.context = null)} aria-label={t(locale, 'chat.removeContext')}>✕</button>
				</div>
			{/if}
			<form
				class="composer"
				onsubmit={(e) => {
					e.preventDefault();
					send();
				}}
			>
				<textarea
					bind:this={inputEl}
					bind:value={assistantUi.draft}
					onkeydown={onKey}
					rows="1"
					maxlength="4000"
					placeholder={t(locale, 'chat.placeholder')}
					aria-label={t(locale, 'chat.placeholder')}
				></textarea>
				{#if busy}
					<button type="button" class="send stop" onclick={stop} aria-label={t(locale, 'chat.stop')} title={t(locale, 'chat.stop')}>■</button>
				{:else}
					<button type="submit" class="send" disabled={!assistantUi.draft.trim()} aria-label={t(locale, 'chat.send')} title={t(locale, 'chat.send')}>➤</button>
				{/if}
			</form>
			<p class="disclaimer muted">{t(locale, 'chat.disclaimer')}</p>
		</footer>
	</div>
{/if}

<style>
	.fab {
		position: fixed;
		right: 16px;
		bottom: calc(var(--tabbar-height) + 16px);
		z-index: 950;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 1.5rem;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
		display: grid;
		place-items: center;
		padding: 0;
	}
	.fab:hover {
		background: var(--accent-hover);
	}
	.panel {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 1050;
		width: min(420px, calc(100vw - 32px));
		height: min(680px, calc(100dvh - 32px));
		display: flex;
		flex-direction: column;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.6rem 0.8rem;
		border-bottom: 1px solid var(--border);
	}
	.head-actions {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.icon {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 1rem;
		padding: 0.3rem 0.5rem;
		min-width: 36px;
		min-height: 36px;
	}
	.small {
		font-size: 0.82rem;
	}
	.messages {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.intro p {
		margin: 0 0 0.7rem;
		color: var(--muted);
		font-size: 0.92rem;
	}
	.suggestions {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.suggestion {
		text-align: left;
		background: var(--accent-soft);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.55rem 0.75rem;
		color: var(--text);
		font-size: 0.9rem;
	}
	.msg {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 100%;
	}
	.msg.user {
		align-items: flex-end;
	}
	.bubble {
		padding: 0.55rem 0.8rem;
		border-radius: 14px;
		font-size: 0.93rem;
		line-height: 1.45;
		overflow-wrap: anywhere;
		max-width: 88%;
	}
	.user .bubble {
		background: var(--accent);
		color: var(--on-accent);
		border-bottom-right-radius: 4px;
		white-space: pre-wrap;
	}
	.bot .bubble {
		background: var(--bg);
		border: 1px solid var(--border);
		border-bottom-left-radius: 4px;
		align-self: flex-start;
	}
	.md :global(p) {
		margin: 0 0 0.5rem;
	}
	.md :global(p:last-child),
	.md :global(ul:last-child),
	.md :global(ol:last-child) {
		margin-bottom: 0;
	}
	.md :global(ul),
	.md :global(ol) {
		margin: 0 0 0.5rem;
		padding-left: 1.2rem;
	}
	.md :global(h3),
	.md :global(h4),
	.md :global(h5),
	.md :global(h6) {
		margin: 0.4rem 0 0.3rem;
		font-size: 0.98rem;
	}
	.md :global(code) {
		font-size: 0.85em;
		background: var(--accent-soft);
		padding: 0 0.25rem;
		border-radius: 4px;
	}
	.md :global(pre) {
		overflow-x: auto;
		background: var(--accent-soft);
		padding: 0.5rem;
		border-radius: 6px;
		margin: 0 0 0.5rem;
	}
	.md :global(pre code) {
		background: none;
		padding: 0;
	}
	.ctx-mini {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.pending {
		color: var(--muted);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.dots {
		display: inline-flex;
		gap: 3px;
	}
	.dots i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--muted);
		animation: blink 1.2s infinite ease-in-out;
	}
	.dots i:nth-child(2) {
		animation-delay: 0.2s;
	}
	.dots i:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes blink {
		0%,
		80%,
		100% {
			opacity: 0.25;
		}
		40% {
			opacity: 1;
		}
	}
	.chip {
		align-self: flex-start;
		font-size: 0.8rem;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--muted);
	}
	.chip.action {
		background: var(--ok-soft);
		color: var(--text);
		border-color: var(--ok);
	}
	.refs {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding-bottom: 0.2rem;
		max-width: 100%;
	}
	.ref {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 210px;
		padding: 0.4rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
	}
	.ref:hover {
		border-color: var(--accent);
		text-decoration: none;
	}
	.ref img,
	.ref-ico {
		width: 44px;
		height: 44px;
		border-radius: 8px;
		object-fit: cover;
		flex: 0 0 auto;
	}
	.ref-ico {
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		font-size: 1.3rem;
	}
	.ref-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.ref-title,
	.ref-text .small {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ref-title {
		font-weight: 600;
		font-size: 0.88rem;
	}
	.error-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		background: var(--danger-soft);
		color: var(--text);
		border-radius: 10px;
		padding: 0.5rem 0.7rem;
		font-size: 0.88rem;
	}
	footer {
		border-top: 1px solid var(--border);
		padding: 0.5rem 0.6rem calc(0.4rem + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.ctx {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		font-size: 0.82rem;
		background: var(--accent-soft);
		border-radius: 8px;
		padding: 0.1rem 0.1rem 0.1rem 0.6rem;
	}
	.ctx span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.composer {
		display: flex;
		align-items: flex-end;
		gap: 0.4rem;
	}
	textarea {
		flex: 1;
		resize: none;
		min-height: 42px;
		max-height: 140px;
		field-sizing: content;
		font-size: 16px; /* below 16px, mobile browsers zoom into the field */
		border-radius: 12px;
		padding: 0.55rem 0.7rem;
	}
	.send {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 1.05rem;
		padding: 0;
		flex: 0 0 auto;
	}
	.send:disabled {
		opacity: 0.45;
	}
	.send.stop {
		background: var(--danger);
		color: #fff;
	}
	.disclaimer {
		margin: 0;
		font-size: 0.72rem;
		text-align: center;
	}
	/* Phone: the panel takes the whole screen (the keyboard pushes the footer up). */
	@media (max-width: 720px) {
		.panel {
			inset: 0;
			width: 100%;
			height: 100%;
			height: 100dvh;
			border-radius: 0;
			border: none;
			padding-top: env(safe-area-inset-top);
		}
	}
</style>
