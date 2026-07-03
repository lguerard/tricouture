<script lang="ts">
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { goto } from '$app/navigation';
	import { statusLabel } from '$lib/labels';
	import { t } from '$lib/i18n';
	import type { ProjectStatus } from '$lib/server/db/schema';

	let { data } = $props();
	const locale = $derived(data.locale);

	type Card = (typeof data.columns)['idee'][number];
	// svelte-ignore state_referenced_locally
	let cols = $state<Record<ProjectStatus, Card[]>>(structuredClone(data.columns));
	// Resync local board state when server data changes (navigation, invalidate).
	$effect(() => {
		cols = structuredClone(data.columns);
	});
	const flipMs = 150;

	function consider(status: ProjectStatus, e: CustomEvent<DndEvent<Card>>) {
		cols[status] = e.detail.items;
	}

	async function finalize(status: ProjectStatus, e: CustomEvent<DndEvent<Card>>) {
		cols[status] = e.detail.items;
		await fetch('/api/projects/reorder', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status, ids: cols[status].map((c) => c.id) })
		});
	}

	function daysLeft(deadline: string | null): number | null {
		if (!deadline) return null;
		const d = new Date(deadline + 'T00:00:00');
		return Math.ceil((d.getTime() - Date.now()) / 86400000);
	}
</script>

<div class="container wide">
	<header class="head">
		<h1>{t(locale, 'projects.board.title')}</h1>
		<a class="btn btn-primary" href="/projects/new">{t(locale, 'projects.board.newProject')}</a>
	</header>

	<div class="board">
		{#each data.order as status}
			<section class="column">
				<h2>{statusLabel(locale, status)} <span class="count">{cols[status].length}</span></h2>
				<div
					class="dropzone"
					use:dndzone={{ items: cols[status], flipDurationMs: flipMs, dropTargetStyle: {} }}
					onconsider={(e) => consider(status, e)}
					onfinalize={(e) => finalize(status, e)}
				>
					{#each cols[status] as card (card.id)}
						{@const dl = daysLeft(card.deadline)}
						<div class="kcard" animate:flip={{ duration: flipMs }}>
							<button class="open" onclick={() => goto(`/projects/${card.id}`)}>
								<strong>{card.title}</strong>
							</button>
							<div class="bar"><div class="fill" style={`width:${card.progressPct}%`}></div></div>
							<div class="meta">
								<span class="muted small">
									{card.progressPct}%{card.totalRows
										? ` · ${t(locale, 'projects.board.rowsShort', { current: card.currentRow, total: card.totalRows })}`
										: ''}
								</span>
								{#if dl !== null}
									<span class="badge" class:late={dl < 0} class:soon={dl >= 0 && dl <= 7}>
										{dl < 0
											? t(locale, 'projects.board.lateDays', { n: -dl })
											: t(locale, 'projects.board.dueIn', { n: dl })}
									</span>
								{/if}
							</div>
						</div>
					{/each}
					{#if cols[status].length === 0}
						<p class="empty muted small">{t(locale, 'projects.board.emptyColumn')}</p>
					{/if}
				</div>
			</section>
		{/each}
	</div>
</div>

<style>
	.wide {
		max-width: 1300px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.board {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin-top: 1rem;
		align-items: start;
	}
	.column h2 {
		font-size: 0.95rem;
		margin: 0 0 0.6rem;
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.count {
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 999px;
		padding: 0 0.5rem;
		font-size: 0.78rem;
	}
	.dropzone {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-height: 120px;
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 0.6rem;
	}
	.kcard {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem;
		box-shadow: var(--shadow);
		cursor: grab;
	}
	.open {
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		width: 100%;
		color: var(--text);
	}
	.open:hover {
		color: var(--accent);
		background: none;
	}
	.bar {
		height: 5px;
		background: var(--accent-soft);
		border-radius: 999px;
		overflow: hidden;
		margin: 0.4rem 0;
	}
	.fill {
		height: 100%;
		background: var(--accent);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.small {
		font-size: 0.78rem;
	}
	.badge {
		font-size: 0.72rem;
		padding: 0.05rem 0.45rem;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.badge.soon {
		background: #fceccb;
		color: var(--warn);
	}
	.badge.late {
		background: #f6d6d3;
		color: var(--danger);
	}
	.empty {
		text-align: center;
		padding: 0.8rem 0;
	}
	@media (max-width: 900px) {
		.board {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 560px) {
		.board {
			grid-template-columns: 1fr;
		}
	}
</style>
