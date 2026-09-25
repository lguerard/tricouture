<script lang="ts">
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
	import { undoableDelete } from '$lib/undo';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);
	let adding = $state(false);
</script>

<div class="container">
	<header class="head">
		<h1>{t(locale, 'recipients.title')}</h1>
		<button class="btn-primary" onclick={() => (adding = !adding)}>{adding ? t(locale, 'recipients.close') : t(locale, 'recipients.addPerson')}</button>
	</header>
	<p class="muted">{t(locale, 'recipients.subtitle')}</p>

	{#if adding}
		<form class="card add" method="POST" action="?/add" use:enhance={withFeedback({ success: 'toast.saved', inner: () => async ({ update }) => { await update({ reset: true }); adding = false; } })}>
			<div class="field"><label for="n">{t(locale, 'recipients.name')}</label><input id="n" name="name" required /></div>
			<div class="field"><label for="fc">{t(locale, 'recipients.favoriteColors')}</label><input id="fc" name="favoriteColors" placeholder={t(locale, 'recipients.favoriteColorsPlaceholder')} /></div>
			<div class="field"><label for="fa">{t(locale, 'recipients.fiberAllergies')}</label><input id="fa" name="fiberAllergies" placeholder={t(locale, 'recipients.fiberAllergiesPlaceholder')} /></div>
			<div class="field"><label for="no">{t(locale, 'recipients.notes')}</label><textarea id="no" name="notes" rows="2"></textarea></div>
			<button class="btn-primary" type="submit">{t(locale, 'recipients.add')}</button>
		</form>
	{/if}

	<div class="grid">
		{#each data.list as r}
			<div class="card" data-undo-item>
				<strong>{r.name}</strong>
				{#if r.favoriteColors?.length}<div>{#each r.favoriteColors as c}<span class="tag">{c}</span>{/each}</div>{/if}
				{#if r.fiberAllergies}<span class="muted small">⚠ {t(locale, 'recipients.allergyLabel')} {r.fiberAllergies}</span>{/if}
				{#if r.notes}<p class="small">{r.notes}</p>{/if}
				<form method="POST" action="?/delete" use:enhance={undoableDelete()}><input type="hidden" name="id" value={r.id} /><button class="del" type="submit">{t(locale, 'recipients.delete')}</button></form>
			</div>
		{/each}
	</div>
</div>

<style>
	.head { display: flex; justify-content: space-between; align-items: center; }
	.add { margin: 1rem 0; }
	.card { display: flex; flex-direction: column; gap: 0.3rem; }
	.del { color: var(--danger); align-self: flex-start; font-size: 0.8rem; margin-top: 0.3rem; }
	.small { font-size: 0.82rem; }
</style>
