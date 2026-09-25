<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type Locale } from '$lib/i18n';

	let { locale }: { locale: Locale } = $props();

	type Theme = 'auto' | 'light' | 'dark';
	const OPTIONS: { value: Theme; icon: string; key: string }[] = [
		{ value: 'auto', icon: '🖥️', key: 'theme.auto' },
		{ value: 'light', icon: '☀️', key: 'theme.light' },
		{ value: 'dark', icon: '🌙', key: 'theme.dark' }
	];
	let theme = $state<Theme>('auto');

	onMount(() => {
		const saved = document.documentElement.dataset.theme;
		theme = saved === 'dark' || saved === 'light' ? saved : 'auto';
	});

	function choose(value: Theme) {
		theme = value;
		const root = document.documentElement;
		try {
			if (value === 'auto') {
				delete root.dataset.theme;
				localStorage.removeItem('theme');
			} else {
				root.dataset.theme = value;
				localStorage.setItem('theme', value);
			}
		} catch {
			// storage blocked (private mode): the choice still applies for this visit
		}
	}
</script>

<div class="themeswitch" role="group" aria-label={t(locale, 'theme.label')}>
	{#each OPTIONS as o}
		<button
			type="button"
			class:on={theme === o.value}
			aria-pressed={theme === o.value}
			title={t(locale, o.key)}
			onclick={() => choose(o.value)}>{o.icon}</button
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
