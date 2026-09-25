<script lang="ts">
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
	import { undoableDelete } from '$lib/undo';
	import { mediaUrl } from '$lib/media';
	import { toasts } from '$lib/toast.svelte';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);

	// The board's overall palette: each item's two strongest colours, deduped.
	const boardPalette = $derived([...new Set(data.items.flatMap((i) => i.palette.slice(0, 2)))].slice(0, 12));

	async function copy(hex: string) {
		try {
			await navigator.clipboard.writeText(hex);
			toasts.push({ kind: 'success', message: t(locale, 'moodboards.copied', { hex }) }, 2500);
		} catch {
			/* clipboard unavailable (http, permissions) — the hex is in the tooltip */
		}
	}

	let renaming = $state(false);
</script>

<div class="container">
	<p class="back"><a href="/moodboards">← {t(locale, 'moodboards.title')}</a></p>

	<header class="head">
		{#if renaming}
			<form
				class="rename"
				method="POST"
				action="?/rename"
				use:enhance={withFeedback({ inner: () => async ({ update }) => { await update(); renaming = false; } })}
			>
				<input name="title" value={data.board.title} maxlength="200" required />
				<button class="btn-primary" type="submit">{t(locale, 'moodboards.save')}</button>
				<button type="button" onclick={() => (renaming = false)}>{t(locale, 'moodboards.cancel')}</button>
			</form>
		{:else}
			<h1>{data.board.title}</h1>
			<button type="button" onclick={() => (renaming = true)}>✏️ {t(locale, 'moodboards.rename')}</button>
		{/if}
	</header>

	{#if boardPalette.length}
		<div class="board-palette" aria-label={t(locale, 'moodboards.palette')}>
			{#each boardPalette as hex}
				<button type="button" class="chip" style={`background:${hex}`} title={hex} aria-label={hex} onclick={() => copy(hex)}></button>
			{/each}
		</div>
	{/if}

	<form
		class="card add"
		method="POST"
		action="?/addItem"
		enctype="multipart/form-data"
		use:enhance={withFeedback({
			success: 'moodboards.added',
			inner: () => async ({ update }) => update({ reset: true })
		})}
	>
		<h2>{t(locale, 'moodboards.addTitle')}</h2>
		<div class="add-grid">
			<div class="field">
				<label for="images">{t(locale, 'moodboards.images')}</label>
				<input id="images" name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple />
			</div>
			<div class="field">
				<label for="sourceUrl">{t(locale, 'moodboards.link')}</label>
				<input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://…" />
			</div>
		</div>
		<div class="field">
			<label for="note">{t(locale, 'moodboards.note')}</label>
			<textarea id="note" name="note" rows="2" maxlength="2000" placeholder={t(locale, 'moodboards.notePlaceholder')}></textarea>
		</div>
		<button class="btn-primary" type="submit">{t(locale, 'moodboards.add')}</button>
	</form>

	{#if data.items.length === 0}
		<p class="muted">{t(locale, 'moodboards.emptyBoard')}</p>
	{:else}
		<div class="items">
			{#each data.items as item (item.id)}
				<div class="card item" data-undo-item>
					{#if item.imagePath}
						<a href={mediaUrl(item.imagePath)} target="_blank" rel="noopener">
							<img src={mediaUrl(item.imagePath, 400)} alt={item.note ?? ''} loading="lazy" />
						</a>
					{/if}
					{#if item.palette.length}
						<div class="swatches">
							{#each item.palette as hex}
								<button type="button" class="chip small-chip" style={`background:${hex}`} title={hex} aria-label={hex} onclick={() => copy(hex)}></button>
							{/each}
						</div>
					{/if}
					<div class="caption">
						{#if item.note}<p>{item.note}</p>{/if}
						{#if item.sourceUrl}
							<a class="source" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
								🔗 {new URL(item.sourceUrl).hostname}
							</a>
						{/if}
					</div>
					<form method="POST" action="?/deleteItem" use:enhance={undoableDelete()}>
						<input type="hidden" name="itemId" value={item.id} />
						<button type="submit" class="del" aria-label={t(locale, 'moodboards.deleteItem')}>✕</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.back {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.head h1 {
		margin: 0;
	}
	.rename {
		display: flex;
		gap: 0.5rem;
		flex: 1;
	}
	.board-palette {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 1rem 0 0;
	}
	.chip {
		width: 2rem;
		height: 2rem;
		padding: 0;
		border-radius: 50%;
		border: 2px solid var(--surface);
		box-shadow: 0 0 0 1px var(--border);
	}
	.small-chip {
		width: 1.3rem;
		height: 1.3rem;
		border-width: 1px;
	}
	.add {
		margin: 1.2rem 0;
	}
	.add h2 {
		margin: 0 0 0.6rem;
		font-size: 1.05rem;
	}
	.add-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
	}
	.items {
		columns: 3 240px;
		column-gap: 1rem;
	}
	.item {
		position: relative;
		break-inside: avoid;
		margin: 0 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.item img {
		width: 100%;
		display: block;
		border-radius: var(--radius);
	}
	.swatches {
		display: flex;
		gap: 0.25rem;
	}
	.caption p {
		margin: 0;
		white-space: pre-line;
	}
	.source {
		font-size: 0.85rem;
		word-break: break-all;
	}
	.item form {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
	}
	.del {
		padding: 0.1rem 0.45rem;
		font-size: 0.8rem;
		opacity: 0.85;
	}
	@media (max-width: 560px) {
		.add-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
