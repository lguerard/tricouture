<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { t, LOCALES, type Locale } from '$lib/i18n';

	let { data, children } = $props();

	const locale = $derived(data.locale);
	const nav = $derived([
		{ href: '/', key: 'nav.dashboard', icon: '🏠' },
		{ href: '/patterns', key: 'nav.patterns', icon: '📄' },
		{ href: '/projects/board', key: 'nav.projects', icon: '🧶' },
		{ href: '/stash', key: 'nav.stash', icon: '🧵' },
		{ href: '/calendar', key: 'nav.calendar', icon: '📅' },
		{ href: '/goals', key: 'nav.goals', icon: '🎯' },
		{ href: '/stats', key: 'nav.stats', icon: '📊' },
		{ href: '/achievements', key: 'nav.achievements', icon: '🏅' },
		{ href: '/bins', key: 'nav.bins', icon: '📦' },
		{ href: '/recipients', key: 'nav.recipients', icon: '🎁' },
		{ href: '/assistant', key: 'nav.assistant', icon: '🤖' },
		{ href: '/gallery', key: 'nav.gallery', icon: '🖼️' }
	]);

	const current = $derived($page.url.pathname);
	function active(href: string): boolean {
		return href === '/' ? current === '/' : current.startsWith(href);
	}

	async function setLocale(code: Locale) {
		if (code === locale) return;
		await fetch('/api/locale', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ locale: code })
		});
		await invalidateAll();
	}
</script>

{#if data.user}
	<div class="shell">
		<aside class="sidebar">
			<div class="brand">🪡 Tricouture</div>
			<nav>
				{#each nav as item}
					<a class="nav-item" class:active={active(item.href)} href={item.href}>
						<span class="ico">{item.icon}</span>{t(locale, item.key)}
					</a>
				{/each}
			</nav>
			<div class="spacer"></div>
			<div class="langswitch">
				{#each LOCALES as l}
					<button class:on={locale === l.code} onclick={() => setLocale(l.code)}>{l.label}</button>
				{/each}
			</div>
			<div class="user">
				<span class="muted">{data.user.displayName}</span>
				<form method="POST" action="/logout">
					<button class="link" type="submit">{t(locale, 'nav.logout')}</button>
				</form>
			</div>
		</aside>
		<main class="content">
			{@render children()}
		</main>
	</div>
{:else}
	<main class="auth-wrap">
		<div class="langswitch corner">
			{#each LOCALES as l}
				<button class:on={locale === l.code} onclick={() => setLocale(l.code)}>{l.label}</button>
			{/each}
		</div>
		{@render children()}
	</main>
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: 240px 1fr;
		min-height: 100vh;
	}
	.sidebar {
		background: var(--surface);
		border-right: 1px solid var(--border);
		padding: 1.2rem 0.8rem;
		display: flex;
		flex-direction: column;
		position: sticky;
		top: 0;
		height: 100vh;
	}
	.brand {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--accent);
		padding: 0 0.5rem 1rem;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.7rem;
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.95rem;
	}
	.nav-item:hover {
		background: var(--accent-soft);
		text-decoration: none;
	}
	.nav-item.active {
		background: var(--accent);
		color: #fff;
	}
	.ico {
		width: 1.3rem;
		text-align: center;
	}
	.spacer {
		flex: 1;
	}
	.user {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.5rem;
		border-top: 1px solid var(--border);
	}
	.link {
		background: none;
		border: none;
		color: var(--accent);
		padding: 0;
		text-align: left;
	}
	.content {
		min-width: 0;
	}
	.auth-wrap {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		position: relative;
	}
	.langswitch {
		display: flex;
		gap: 0.3rem;
		padding: 0.4rem 0.5rem;
	}
	.langswitch.corner {
		position: absolute;
		top: 1rem;
		right: 1rem;
	}
	.langswitch button {
		padding: 0.2rem 0.5rem;
		font-size: 0.8rem;
		border-radius: 6px;
	}
	.langswitch button.on {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	@media (max-width: 720px) {
		.shell {
			grid-template-columns: 1fr;
		}
		.sidebar {
			position: static;
			height: auto;
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
		}
		.sidebar nav {
			flex-direction: row;
			flex-wrap: wrap;
		}
		.spacer {
			display: none;
		}
	}
</style>
