<script lang="ts">
	import { STATUS_LABELS } from '$lib/labels';
	let { data } = $props();
</script>

<div class="container">
	<h1>Bonjour {data.user?.displayName} 👋</h1>

	<div class="grid stats">
		<a class="card stat" href="/patterns">
			<span class="num">{data.patternCount}</span>
			<span class="muted">patrons</span>
		</a>
		<a class="card stat" href="/projects/board">
			<span class="num">{data.wip}</span>
			<span class="muted">projets en cours</span>
		</a>
		<a class="card stat" href="/stash">
			<span class="num">{data.yarnCount}</span>
			<span class="muted">laines en stock</span>
		</a>
	</div>

	<h2>Projets récents</h2>
	{#if data.recentProjects.length === 0}
		<p class="muted">Aucun projet pour l'instant. <a href="/projects/board">Créer un projet</a></p>
	{:else}
		<div class="grid">
			{#each data.recentProjects as p}
				<a class="card proj" href={`/projects/${p.id}`}>
					<strong>{p.title}</strong>
					<span class="tag">{STATUS_LABELS[p.status]}</span>
					<div class="bar"><div class="fill" style={`width:${p.progressPct}%`}></div></div>
					<span class="muted small">{p.progressPct}%{p.deadline ? ` · échéance ${p.deadline}` : ''}</span>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.stats {
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		margin-bottom: 1.5rem;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		color: var(--text);
	}
	.stat:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.num {
		font-size: 2rem;
		font-weight: 700;
		color: var(--accent);
	}
	.proj {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		color: var(--text);
	}
	.proj:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.bar {
		height: 6px;
		background: var(--accent-soft);
		border-radius: 999px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--accent);
	}
	.small {
		font-size: 0.8rem;
	}
</style>
