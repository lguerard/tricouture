<script lang="ts">
	import { CRAFTS, craftLabel } from '$lib/labels';
	import { t } from '$lib/i18n';

	let { data } = $props();
	const locale = $derived(data.locale);

	let tab = $state<'translate' | 'generate'>('translate');

	// Traduction
	let source = $state('');
	let translation = $state('');
	let tBusy = $state(false);
	let tErr = $state('');

	async function translate() {
		tBusy = true;
		tErr = '';
		translation = '';
		try {
			const res = await fetch('/api/ai/translate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: source })
			});
			const resData = await res.json();
			if (!res.ok) tErr = resData.error ?? t(locale, 'assistant.error');
			else translation = resData.result;
		} catch {
			tErr = t(locale, 'assistant.networkError');
		}
		tBusy = false;
	}

	// Pattern generation
	let desc = $state('');
	let craft = $state('tricot');
	let gauge = $state('');
	let size = $state('');
	let pattern = $state('');
	let gBusy = $state(false);
	let gErr = $state('');

	async function genPattern() {
		gBusy = true;
		gErr = '';
		pattern = '';
		try {
			const res = await fetch('/api/ai/generate-pattern', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ description: desc, craft, gauge, size })
			});
			const resData = await res.json();
			if (!res.ok) gErr = resData.error ?? t(locale, 'assistant.error');
			else pattern = resData.result;
		} catch {
			gErr = t(locale, 'assistant.networkError');
		}
		gBusy = false;
	}
</script>

<div class="container">
	<h1>{t(locale, 'assistant.title')}</h1>
	<p class="muted">{t(locale, 'assistant.subtitle')}</p>

	<div class="tabs">
		<button class:active={tab === 'translate'} onclick={() => (tab = 'translate')}
			>🌍 {t(locale, 'assistant.tabTranslate')}</button
		>
		<button class:active={tab === 'generate'} onclick={() => (tab = 'generate')}
			>✨ {t(locale, 'assistant.tabGenerate')}</button
		>
	</div>

	{#if tab === 'translate'}
		<div class="two">
			<div class="field">
				<label for="src">{t(locale, 'assistant.sourceLabel')}</label>
				<textarea
					id="src"
					rows="14"
					bind:value={source}
					placeholder={t(locale, 'assistant.sourcePlaceholder')}
				></textarea>
				<button class="btn-primary" onclick={translate} disabled={tBusy || !source}
					>{tBusy ? t(locale, 'assistant.translating') : t(locale, 'assistant.translateBtn')}</button
				>
				{#if tErr}<p class="error">{tErr}</p>{/if}
			</div>
			<div class="field">
				<label for="out">{t(locale, 'assistant.translationLabel')}</label>
				<textarea id="out" rows="14" readonly value={translation}></textarea>
			</div>
		</div>
	{:else}
		<div class="two">
			<div class="form">
				<div class="field">
					<label for="d">{t(locale, 'assistant.descLabel')}</label>
					<textarea
						id="d"
						rows="4"
						bind:value={desc}
						placeholder={t(locale, 'assistant.descPlaceholder')}
					></textarea>
				</div>
				<div class="field">
					<label for="c">{t(locale, 'assistant.typeLabel')}</label>
					<select id="c" bind:value={craft}
						>{#each CRAFTS as c}<option value={c}>{craftLabel(locale, c)}</option>{/each}</select
					>
				</div>
				<div class="field">
					<label for="g">{t(locale, 'assistant.gaugeLabel')}</label>
					<input id="g" bind:value={gauge} placeholder={t(locale, 'assistant.gaugePlaceholder')} />
				</div>
				<div class="field">
					<label for="s">{t(locale, 'assistant.sizeLabel')}</label>
					<input id="s" bind:value={size} placeholder={t(locale, 'assistant.sizePlaceholder')} />
				</div>
				<button class="btn-primary" onclick={genPattern} disabled={gBusy || !desc}
					>{gBusy ? t(locale, 'assistant.generating') : t(locale, 'assistant.generateBtn')}</button
				>
				{#if gErr}<p class="error">{gErr}</p>{/if}
			</div>
			<div class="field">
				<label for="po">{t(locale, 'assistant.generatedLabel')}</label>
				<textarea id="po" rows="20" readonly value={pattern}></textarea>
			</div>
		</div>
	{/if}
</div>

<style>
	.tabs { display: flex; gap: 0.5rem; margin: 1rem 0; }
	.tabs button.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
	.form { display: flex; flex-direction: column; }
	textarea { font-family: ui-monospace, monospace; font-size: 0.85rem; }
	@media (max-width: 720px) { .two { grid-template-columns: 1fr; } }
</style>
