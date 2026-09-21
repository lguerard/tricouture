<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import { tagStyle } from '$lib/tagColor';

	let { data, form } = $props();
	const locale = $derived(data.locale);

	// Which tag's swatch grid is currently open (one at a time).
	let openTag = $state<string | null>(null);
</script>

<div class="container narrow">
	<h1>{t(locale, 'patterns.tags.title')}</h1>
	<p class="muted">{t(locale, 'patterns.tags.subtitle')}</p>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	{#if data.allTags.length === 0}
		<p class="muted">{t(locale, 'patterns.tags.empty')}</p>
	{:else}
		<ul class="list">
			{#each data.allTags as tag}
				<li class="row card">
					<span class="tag" style={tagStyle(tag, data.colors)}>{tag}</span>
					<div class="actions">
						{#if data.overriddenTags.includes(tag)}
							<form method="POST" action="?/resetColor" use:enhance>
								<input type="hidden" name="tag" value={tag} />
								<button class="btn small" type="submit">{t(locale, 'patterns.tags.reset')}</button>
							</form>
						{/if}
						<button class="btn small" type="button" onclick={() => (openTag = openTag === tag ? null : tag)}>
							{t(locale, 'patterns.tags.changeColor')}
						</button>
					</div>

					{#if openTag === tag}
						<div class="swatches">
							{#each data.palette as color}
								<form
									method="POST"
									action="?/setColor"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											openTag = null;
										};
									}}
								>
									<input type="hidden" name="tag" value={tag} />
									<input type="hidden" name="bg" value={color.bg} />
									<input type="hidden" name="fg" value={color.fg} />
									<button
										class="swatch"
										type="submit"
										style={`background:${color.bg};color:${color.fg}`}
										aria-label={color.bg}
										title={color.bg}
									>A</button>
								</form>
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.narrow {
		max-width: 640px;
	}
	h1 {
		margin-bottom: 0.2rem;
	}
	.list {
		list-style: none;
		margin: 1.2rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		padding: 0.7rem 0.9rem;
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}
	.btn.small {
		padding: 0.3rem 0.6rem;
		font-size: 0.82rem;
	}
	.swatches {
		flex-basis: 100%;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
	}
	.swatch {
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		border-radius: 50%;
		border: 1px solid var(--border);
		font-size: 0;
	}
	.swatch:hover {
		border-color: var(--accent);
	}
</style>
