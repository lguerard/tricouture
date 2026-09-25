<script lang="ts">
	import { mediaUrl } from '$lib/media';
	import { formatDate } from '$lib/format';
	import { craftLabel } from '$lib/labels';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);
</script>

<div class="container">
	<h1>{t(locale, 'gallery.title')}</h1>
	{#if data.items.length === 0}
		<p class="muted">{t(locale, 'gallery.empty')}</p>
	{:else}
		<p class="muted">{t(locale, 'gallery.count', { n: data.items.length })}</p>
		<div class="grid">
			{#each data.items as fo (fo.id)}
				<a class="card item" href={`/projects/${fo.id}`}>
					{#if fo.image}
						<img src={mediaUrl(fo.image, 800)} loading="lazy" alt={fo.title} />
					{:else}
						<div class="placeholder" aria-hidden="true">🧶</div>
					{/if}
					<strong>{fo.title}</strong>
					<span class="muted small">
						{[fo.craft ? craftLabel(locale, fo.craft) : null, fo.finishedAt ? formatDate(locale, fo.finishedAt) : null]
							.filter(Boolean)
							.join(' · ')}
					</span>
					{#if fo.photoCount > 1}
						<span class="muted small">{t(locale, 'gallery.photos', { n: fo.photoCount })}</span>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.item {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		color: var(--text);
	}
	.item:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	img,
	.placeholder {
		width: 100%;
		height: 200px;
		object-fit: cover;
		border-radius: var(--radius);
		margin-bottom: 0.4rem;
	}
	.placeholder {
		display: grid;
		place-items: center;
		font-size: 2.5rem;
		background: var(--accent-soft);
	}
	.small {
		font-size: 0.82rem;
	}
</style>
