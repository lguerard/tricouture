<script lang="ts">
	import { mediaUrl } from '$lib/media';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);
</script>

<div class="container">
	<h1>{t(locale, 'gallery.title')}</h1>
	{#if data.items.length === 0}
		<p class="muted">
			{t(locale, 'gallery.empty')}
		</p>
	{:else}
		<div class="grid">
			{#each data.items as fo}
				<div class="card">
					{#if fo.photoPath}<img src={mediaUrl(fo.photoPath, 800)} loading="lazy" alt={fo.title} />{/if}
					<strong>{fo.title}</strong>
					{#if fo.notes}<p class="muted small">{fo.notes}</p>{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	img {
		width: 100%;
		height: 180px;
		object-fit: cover;
		border-radius: var(--radius);
		margin-bottom: 0.4rem;
	}
	.small {
		font-size: 0.82rem;
	}
</style>
