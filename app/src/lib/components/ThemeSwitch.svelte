<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type Locale } from '$lib/i18n';
	import { theme, type Theme } from '$lib/theme.svelte';

	let { locale }: { locale: Locale } = $props();

	const OPTIONS: { value: Theme; icon: string; key: string }[] = [
		{ value: 'auto', icon: '🖥️', key: 'theme.auto' },
		{ value: 'light', icon: '☀️', key: 'theme.light' },
		{ value: 'dark', icon: '🌙', key: 'theme.dark' }
	];

	onMount(() => theme.init());
</script>

<div class="themeswitch" role="group" aria-label={t(locale, 'theme.label')}>
	{#each OPTIONS as o}
		<button
			type="button"
			class:on={theme.value === o.value}
			aria-pressed={theme.value === o.value}
			title={t(locale, o.key)}
			onclick={() => theme.set(o.value)}>{o.icon}</button
		>
	{/each}
</div>

<style>
	.themeswitch {
		display: flex;
		gap: 0.3rem;
		padding: 0.4rem 0.5rem;
	}
	button {
		padding: 0.2rem 0.5rem;
		font-size: 0.85rem;
		border-radius: 6px;
	}
	button.on {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
</style>
