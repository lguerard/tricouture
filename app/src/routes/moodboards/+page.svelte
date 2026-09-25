<script lang="ts">
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
	import { undoableDelete } from '$lib/undo';
	import { mediaUrl } from '$lib/media';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);
</script>

<div class="container">
	<h1>{t(locale, 'moodboards.title')}</h1>
	<p class="muted">{t(locale, 'moodboards.subtitle')}</p>

	<form class="card create" method="POST" action="?/create" use:enhance={withFeedback()}>
		<input name="title" maxlength="200" required placeholder={t(locale, 'moodboards.newPlaceholder')} />
		<button class="btn-primary" type="submit">{t(locale, 'moodboards.create')}</button>
	</form>

	{#if data.boards.length === 0}
		<p class="muted">{t(locale, 'moodboards.empty')}</p>
	{:else}
		<div class="grid">
			{#each data.boards as b (b.id)}
				<div class="card board" data-undo-item>
					<a class="mosaic" href={`/moodboards/${b.id}`} aria-label={b.title}>
						{#each b.previews as p}
							<img src={mediaUrl(p, 200)} alt="" loading="lazy" />
						{:else}
							<span class="empty-mosaic" aria-hidden="true">🎨</span>
						{/each}
					</a>
					<div class="board-foot">
						<a href={`/moodboards/${b.id}`}><strong>{b.title}</strong></a>
						<form
							method="POST"
							action="?/delete"
							use:enhance={undoableDelete()}
						>
							<input type="hidden" name="id" value={b.id} />
							<button type="submit" class="del" aria-label={t(locale, 'moodboards.delete')}>🗑</button>
						</form>
					</div>
					<span class="muted small">{t(locale, 'moodboards.itemCount', { n: b.itemCount })}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.create {
		display: flex;
		gap: 0.5rem;
		margin: 1rem 0 1.5rem;
	}
	.create button {
		flex: none;
	}
	.board {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.mosaic {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		aspect-ratio: 4 / 3;
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--accent-soft);
	}
	.mosaic img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.mosaic img:only-child {
		grid-column: span 2;
		grid-row: span 2;
	}
	.empty-mosaic {
		grid-column: span 2;
		display: grid;
		place-items: center;
		font-size: 2.2rem;
	}
	.board-foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	.board-foot a {
		color: var(--text);
	}
	.del {
		padding: 0.2rem 0.45rem;
		color: var(--danger);
	}
	.small {
		font-size: 0.82rem;
	}
</style>
