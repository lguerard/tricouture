<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	let { data } = $props();
	let adding = $state(false);
	const locale = $derived(data.locale);
</script>

<div class="container">
	<header class="head">
		<h1>{t(locale, 'bins.title')}</h1>
		<button class="btn-primary" onclick={() => (adding = !adding)}>{adding ? t(locale, 'bins.close') : t(locale, 'bins.addBtn')}</button>
	</header>
	<p class="muted">{t(locale, 'bins.subtitle')}</p>

	{#if adding}
		<form class="card add" method="POST" action="?/add" use:enhance={() => async ({ update }) => { await update({ reset: true }); adding = false; }}>
			<div class="row">
				<div class="field"><label for="l">{t(locale, 'bins.labelName')}</label><input id="l" name="label" required placeholder={t(locale, 'bins.placeholderName')} /></div>
				<div class="field"><label for="loc">{t(locale, 'bins.labelLocation')}</label><input id="loc" name="location" placeholder={t(locale, 'bins.placeholderLocation')} /></div>
			</div>
			<button class="btn-primary" type="submit">{t(locale, 'bins.create')}</button>
		</form>
	{/if}

	<div class="grid">
		{#each data.bins as b}
			<div class="card bin">
				<img src={b.qrDataUrl} alt={t(locale, 'bins.qrAlt', { label: b.label })} />
				<strong>{b.label}</strong>
				{#if b.location}<span class="muted small">{b.location}</span>{/if}
				<span class="small">{t(locale, b.itemCount > 1 ? 'bins.itemsMany' : 'bins.itemsOne', { n: b.itemCount })}</span>
				<div class="actions">
					<button onclick={() => window.print()}>🖨 {t(locale, 'bins.print')}</button>
					<form method="POST" action="?/delete" use:enhance><input type="hidden" name="id" value={b.id} /><button class="del" type="submit">🗑</button></form>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.head { display: flex; justify-content: space-between; align-items: center; }
	.add { margin: 1rem 0; }
	.row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
	.bin { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; text-align: center; }
	.bin img { width: 150px; height: 150px; }
	.actions { display: flex; gap: 0.4rem; margin-top: 0.4rem; }
	.del { color: var(--danger); }
	.small { font-size: 0.8rem; }
	@media (max-width: 560px) { .row { grid-template-columns: 1fr; } }
</style>
