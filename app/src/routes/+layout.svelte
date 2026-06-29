<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let { data, children } = $props();

	const nav = [
		{ href: '/', label: 'Tableau de bord', icon: '🏠' },
		{ href: '/patterns', label: 'Patrons', icon: '📄' },
		{ href: '/projects/board', label: 'Projets', icon: '🧶' },
		{ href: '/stash', label: 'Stock', icon: '🧵' },
		{ href: '/calendar', label: 'Calendrier', icon: '📅' },
		{ href: '/goals', label: 'Objectifs', icon: '🎯' },
		{ href: '/stats', label: 'Mon année', icon: '📊' },
		{ href: '/achievements', label: 'Succès', icon: '🏅' },
		{ href: '/bins', label: 'Rangement', icon: '📦' },
		{ href: '/recipients', label: 'Destinataires', icon: '🎁' },
		{ href: '/assistant', label: 'Assistant IA', icon: '🤖' },
		{ href: '/gallery', label: 'Galerie', icon: '🖼️' }
	];

	const current = $derived($page.url.pathname);
	function active(href: string): boolean {
		return href === '/' ? current === '/' : current.startsWith(href);
	}
</script>

{#if data.user}
	<div class="shell">
		<aside class="sidebar">
			<div class="brand">🪡 Tricouture</div>
			<nav>
				{#each nav as item}
					<a class="nav-item" class:active={active(item.href)} href={item.href}>
						<span class="ico">{item.icon}</span>{item.label}
					</a>
				{/each}
			</nav>
			<div class="spacer"></div>
			<div class="user">
				<span class="muted">{data.user.displayName}</span>
				<form method="POST" action="/logout">
					<button class="link" type="submit">Déconnexion</button>
				</form>
			</div>
		</aside>
		<main class="content">
			{@render children()}
		</main>
	</div>
{:else}
	<main class="auth-wrap">
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
