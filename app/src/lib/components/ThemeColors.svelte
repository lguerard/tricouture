<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type Locale } from '$lib/i18n';
	import { THEME_SWATCHES } from '$lib/palette';
	import { theme, type ThemeColors } from '$lib/theme.svelte';

	let { locale }: { locale: Locale } = $props();

	onMount(() => theme.init());

	// Material You n'existe que dans l'app Android (12 et plus) : dans un
	// navigateur, le choix n'apparaît pas ; dans l'app, il est grisé avec la
	// raison (app à mettre à jour, Android trop ancien).
	const options = $derived(
		[
			{ value: 'default' as ThemeColors, key: 'theme.colors.default' },
			...(theme.systemMissing === 'web' ? [] : [{ value: 'system' as ThemeColors, key: 'theme.colors.system' }]),
			{ value: 'custom' as ThemeColors, key: 'theme.colors.custom' }
		]
	);
	// Material You choisi ailleurs (sur le téléphone) : ici, c'est le violet.
	const current = $derived(theme.colors === 'system' && !theme.systemAccent ? 'default' : theme.colors);
	const hint = $derived(
		theme.systemMissing === 'app'
			? 'theme.colors.needApp'
			: theme.systemMissing === 'android'
				? 'theme.colors.needAndroid'
				: current === 'system'
					? 'theme.colors.systemHint'
					: current === 'custom'
						? 'theme.colors.customHint'
						: 'theme.colors.defaultHint'
	);
</script>

<div class="themecolors">
	<div class="choices" role="radiogroup" aria-label={t(locale, 'theme.colors.label')}>
		{#each options as o}
			<button
				type="button"
				role="radio"
				class:on={current === o.value}
				aria-checked={current === o.value}
				disabled={o.value === 'system' && !theme.systemAccent}
				onclick={() => theme.setColors(o.value)}
			>
				{#if o.value === 'default'}
					<span class="dot" style:background="#7c4d8b"></span>
				{:else if o.value === 'system' && theme.systemAccent}
					<span class="dot" style:background={theme.systemAccent}></span>
				{:else if o.value === 'custom'}
					<span class="dot" style:background={theme.custom}></span>
				{/if}
				{t(locale, o.key)}
			</button>
		{/each}
	</div>
	<small class="muted">{t(locale, hint)}</small>

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
		gap: 0.4rem;
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.choices button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.75rem;
	}
	.choices button.on {
		background: var(--accent);
		color: var(--on-accent);
		border-color: var(--accent);
	}
	.choices button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.dot {
		display: inline-block;
		flex: none;
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		box-shadow: 0 0 0 2px var(--surface);
	}
	small {
		font-size: 0.8rem;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-top: 0.2rem;
	}
	.swatch {
		width: 2.25rem;
		height: 2.25rem;
		min-width: 0;
		min-height: 0;
		margin: 0;
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
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
</style>
