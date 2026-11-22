<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type Locale } from '$lib/i18n';
	import { THEME_SWATCHES } from '$lib/palette';
	import { theme, type ThemeColors } from '$lib/theme.svelte';

	let { locale }: { locale: Locale } = $props();

	onMount(() => theme.init());

	// Material You n'existe que dans l'app Android (12 et plus).
	const options = $derived(
		[
			{ value: 'default' as ThemeColors, key: 'theme.colors.default', hint: null },
			...(theme.systemAccent
				? [{ value: 'system' as ThemeColors, key: 'theme.colors.system', hint: 'theme.colors.systemHint' }]
				: []),
			{ value: 'custom' as ThemeColors, key: 'theme.colors.custom', hint: 'theme.colors.customHint' }
		]
	);
	// Material You choisi ailleurs (sur le téléphone) : ici, c'est le violet.
	const current = $derived(theme.colors === 'system' && !theme.systemAccent ? 'default' : theme.colors);
</script>

<div class="themecolors" role="radiogroup" aria-label={t(locale, 'theme.colors.label')}>
	{#each options as o}
		<label class="option">
			<input
				type="radio"
				name="theme-colors"
				checked={current === o.value}
				onchange={() => theme.setColors(o.value)}
			/>
			<span>
				{t(locale, o.key)}
				{#if o.value === 'system' && theme.systemAccent}
					<span class="dot" style:background={theme.systemAccent}></span>
				{/if}
				{#if o.hint}<small class="muted">{t(locale, o.hint)}</small>{/if}
			</span>
		</label>
	{/each}

	{#if current === 'custom'}
		<div class="swatches">
			{#each THEME_SWATCHES as swatch}
				<button
					type="button"
					class="swatch"
					class:on={theme.custom.toLowerCase() === swatch}
					style:background={swatch}
					aria-label={swatch}
					aria-pressed={theme.custom.toLowerCase() === swatch}
					onclick={() => theme.setColors('custom', swatch)}
				></button>
			{/each}
			<label class="swatch other" title={t(locale, 'theme.colors.other')}>
				<input
					type="color"
					value={theme.custom}
					onchange={(e) => theme.setColors('custom', e.currentTarget.value)}
					aria-label={t(locale, 'theme.colors.other')}
				/>
			</label>
		</div>
	{/if}
</div>

<style>
	.themecolors {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.option {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		cursor: pointer;
	}
	.option input {
		margin-top: 0.25rem;
		accent-color: var(--accent);
	}
	.option small {
		display: block;
		font-size: 0.8rem;
	}
	.dot {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		vertical-align: middle;
		margin-left: 0.3rem;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.3rem 0 0.2rem 1.6rem;
	}
	.swatch {
		width: 2.25rem;
		height: 2.25rem;
		min-width: 0;
		padding: 0;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
	}
	.swatch.on {
		border-color: var(--text);
		box-shadow: 0 0 0 2px var(--surface) inset;
	}
	.other {
		position: relative;
		overflow: hidden;
		background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
	}
	.other input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
</style>
