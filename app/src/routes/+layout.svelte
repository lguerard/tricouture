<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { afterNavigate, beforeNavigate, invalidateAll } from '$app/navigation';
	import { t, LOCALES, type Locale } from '$lib/i18n';
	import { craftLabel, CRAFTS } from '$lib/labels';
	import type { Craft } from '$lib/server/db/schema';
	import Toaster from '$lib/components/Toaster.svelte';
	import ThemeSwitch from '$lib/components/ThemeSwitch.svelte';
	import SearchPalette from '$lib/components/SearchPalette.svelte';
	import { flushPendingDeletes } from '$lib/undo';

	let { data, children } = $props();

	beforeNavigate(flushPendingDeletes);

	// Tab title: "<pattern/project> · <section> · Tricouture". Most specific
	// prefix first; "/" only matches exactly.
	const SECTION_TITLES: [string, string][] = [
		['/patterns/new', 'patterns.new.title'],
		['/patterns/import', 'patterns.import.title'],
		['/patterns/tags', 'patterns.tags.title'],
		['/projects/new', 'projects.new.title'],
		['/admin', 'admin.title'],
		['/forgot-password', 'forgot.title'],
		['/reset-password', 'reset.title'],
		['/login', 'auth.signin'],
		['/register', 'auth.register.title'],
		['/patterns', 'nav.patterns'],
		['/projects', 'nav.projects'],
		['/stash', 'nav.stash'],
		['/calendar', 'nav.calendar'],
		['/goals', 'nav.goals'],
		['/stats', 'nav.stats'],
		['/achievements', 'nav.achievements'],
		['/bins', 'nav.bins'],
		['/recipients', 'nav.recipients'],
		['/assistant', 'nav.assistant'],
		['/gallery', 'nav.gallery'],
		['/moodboards', 'nav.moodboards'],
		['/account', 'nav.account']
	];
	const pageTitle = $derived.by(() => {
		if ($page.error) return `${t(locale, $page.status === 404 ? 'error.notFound' : 'error.generic')} · Tricouture`;
		const path = $page.url.pathname;
		const key = path === '/' ? 'nav.dashboard' : SECTION_TITLES.find(([p]) => path.startsWith(p))?.[1];
		let section = key ? t(locale, key) : '';
		if (path === '/patterns' && CRAFTS.includes(craftParam as Craft)) {
			section += ` — ${craftLabel(locale, craftParam as Craft)}`;
		}
		const entity: string | undefined = $page.data.project?.title ?? $page.data.pattern?.title ?? $page.data.board?.title;
		return [entity, section, 'Tricouture'].filter(Boolean).join(' · ');
	});

	const CRAFT_ICONS: Record<Craft, string> = { couture: '✂️', tricot: '🧶', crochet: '🪝' };
	const craftParam = $derived($page.url.searchParams.get('craft'));
	// Patterns submenu: open on any /patterns page unless the user collapsed it.
	let patternsToggle = $state<boolean | null>(null);
	const patternsOpen = $derived(patternsToggle ?? $page.url.pathname.startsWith('/patterns'));

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
		{ href: '/gallery', key: 'nav.gallery', icon: '🖼️' },
		{ href: '/moodboards', key: 'nav.moodboards', icon: '🎨' },
		{ href: '/account', key: 'nav.account', icon: '👤' },
		// Reset links and roles: administrators only.
		...(data.user?.isAdmin ? [{ href: '/admin/users', key: 'nav.users', icon: '🔐' }] : [])
	]);

	const current = $derived($page.url.pathname);
	function active(href: string): boolean {
		return href === '/' ? current === '/' : current.startsWith(href);
	}

	// Mobile: the sidebar becomes a drawer opened from the tab bar's "More".
	let drawerOpen = $state(false);
	let searchOpen = $state(false);
	afterNavigate(() => (drawerOpen = false));
	const TABS = [
		{ href: '/', key: 'nav.home', icon: '🏠', match: '/' },
		{ href: '/patterns', key: 'nav.patterns', icon: '📄', match: '/patterns' },
		{ href: '/projects/board', key: 'nav.projects', icon: '🧶', match: '/projects' },
		{ href: '/stash', key: 'nav.stash', icon: '🧵', match: '/stash' }
	];

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
		{#if drawerOpen}
			<button class="backdrop" aria-label={t(locale, 'nav.close')} onclick={() => (drawerOpen = false)}></button>
		{/if}
		<aside class="sidebar" class:open={drawerOpen}>
			<div class="brand">🪡 Tricouture</div>
			<button type="button" class="search-btn" onclick={() => (searchOpen = true)}>
				🔍 {t(locale, 'search.open')}<kbd>Ctrl K</kbd>
			</button>
			<nav>
				{#each nav as item}
					{#if item.href === '/patterns'}
						<div class="nav-row">
							<a class="nav-item grow" class:active={active(item.href) && !craftParam} href={item.href}>
								<span class="ico">{item.icon}</span>{t(locale, item.key)}
							</a>
							<button
								class="caret"
								class:open={patternsOpen}
								aria-expanded={patternsOpen}
								aria-label={t(locale, item.key)}
								onclick={() => (patternsToggle = !patternsOpen)}>▾</button
							>
						</div>
						{#if patternsOpen}
							<div class="subnav">
								{#each CRAFTS as c}
									<a
										class="nav-item sub"
										class:active={active('/patterns') && craftParam === c}
										href={`/patterns?craft=${c}`}
									>
										<span class="ico">{CRAFT_ICONS[c]}</span>{craftLabel(locale, c)}
									</a>
								{/each}
							</div>
						{/if}
					{:else}
						<a class="nav-item" class:active={active(item.href)} href={item.href}>
							<span class="ico">{item.icon}</span>{t(locale, item.key)}
						</a>
					{/if}
				{/each}
			</nav>
			<div class="spacer"></div>
			<div class="prefs">
				<ThemeSwitch {locale} />
				<div class="langswitch" role="group" aria-label={t(locale, 'common.language')}>
					{#each LOCALES as l}
						<button class:on={locale === l.code} aria-pressed={locale === l.code} onclick={() => setLocale(l.code)}
							>{l.label}</button
						>
					{/each}
				</div>
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
		<nav class="tabbar" aria-label={t(locale, 'nav.main')}>
			{#each TABS as tab}
				<a href={tab.href} class:active={active(tab.match) && !drawerOpen} aria-current={active(tab.match) ? 'page' : undefined}>
					<span class="tab-ico">{tab.icon}</span>{t(locale, tab.key)}
				</a>
			{/each}
			<button type="button" class:active={drawerOpen} aria-expanded={drawerOpen} onclick={() => (drawerOpen = !drawerOpen)}>
				<span class="tab-ico">☰</span>{t(locale, 'nav.more')}
			</button>
		</nav>
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

<svelte:head><title>{pageTitle}</title></svelte:head>

<Toaster {locale} />
{#if data.user}<SearchPalette {locale} ai={data.ai} bind:open={searchOpen} />{/if}
<svelte:window onpagehide={flushPendingDeletes} onkeydown={(e) => e.key === 'Escape' && (drawerOpen = false)} />

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
		height: 100dvh;
		/* A short window (laptop, phone in landscape) must still reach the
		   theme, language and logout controls at the bottom. */
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.brand {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--accent);
		padding: 0 0.5rem 1rem;
	}
	.sidebar nav {
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
		color: var(--on-accent);
	}
	.ico {
		width: 1.3rem;
		text-align: center;
	}
	.nav-row {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}
	.grow {
		flex: 1;
	}
	.caret {
		background: none;
		border: none;
		padding: 0.3rem 0.5rem;
		color: var(--muted);
		transform: rotate(-90deg);
		transition: transform 0.15s;
	}
	.caret.open {
		transform: none;
	}
	.subnav {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding-left: 1.2rem;
	}
	.nav-item.sub {
		padding: 0.4rem 0.7rem;
		font-size: 0.88rem;
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
		/* Safety net: one over-wide element must never widen the whole page --
		   on a phone that zooms everything out and pushes the tab bar's "More"
		   off screen. Wide content (tables) scrolls in its own container. */
		overflow-x: clip;
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
		color: var(--on-accent);
		border-color: var(--accent);
	}
	.search-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0 0 0.8rem;
		color: var(--muted);
		font-size: 0.88rem;
		text-align: left;
	}
	.search-btn kbd {
		margin-left: auto;
		font-size: 0.7rem;
		font-family: inherit;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 0.3rem;
	}
	.tabbar,
	.backdrop {
		display: none;
	}
	:global(:root) {
		--tabbar-height: 0px;
	}
	/* Phone layout: narrow screens, and short ones too -- a phone held in
	   landscape is wide enough for the sidebar but far too short for it. */
	@media (max-width: 720px), (max-height: 520px) {
		:global(:root) {
			--tabbar-height: calc(60px + env(safe-area-inset-bottom));
		}
		.shell {
			grid-template-columns: 1fr;
		}
		.content {
			padding-bottom: var(--tabbar-height);
		}
		/* Full sidebar content, as a drawer sliding in from the left. */
		.sidebar {
			position: fixed;
			inset: 0 auto var(--tabbar-height) 0;
			width: min(290px, 85vw);
			height: auto;
			overflow-y: auto;
			z-index: 900;
			transform: translateX(-100%);
			/* Hidden (not just off-screen) while closed: its shadow no longer
			   bleeds onto the page edge and its links leave the tab order. */
			visibility: hidden;
			transition:
				transform 0.2s ease-out,
				visibility 0.2s;
			box-shadow: 4px 0 24px rgba(0, 0, 0, 0.15);
		}
		.sidebar.open {
			transform: none;
			visibility: visible;
		}
		/* Theme and language first in the drawer, where a thumb finds them,
		   instead of below fifteen menu entries. */
		.brand {
			order: -2;
		}
		.prefs {
			order: -1;
			display: flex;
			flex-wrap: wrap;
			justify-content: space-between;
			margin-bottom: 0.4rem;
			border-bottom: 1px solid var(--border);
		}
		.prefs :global(button) {
			min-width: 2.75rem;
			min-height: 2.75rem;
			font-size: 1rem;
		}
		.backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 850;
			border: none;
			border-radius: 0;
			padding: 0;
			background: rgba(0, 0, 0, 0.35);
		}
		.tabbar {
			display: flex;
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 950;
			height: var(--tabbar-height);
			padding-bottom: env(safe-area-inset-bottom);
			background: var(--surface);
			border-top: 1px solid var(--border);
		}
		.tabbar a,
		.tabbar button {
			flex: 1;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 0.1rem;
			min-width: 0;
			font-size: 0.7rem;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			color: var(--muted);
			background: none;
			border: none;
			border-radius: 0;
			padding: 0.3rem 0.15rem;
		}
		.tabbar a:hover {
			text-decoration: none;
		}
		.tabbar .active {
			color: var(--accent);
			font-weight: 600;
		}
		.tab-ico {
			font-size: 1.25rem;
			line-height: 1;
		}
	}
</style>
