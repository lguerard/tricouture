<script lang="ts">
	import { statusLabel } from '$lib/labels';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);
</script>

<div class="container">
	<h1>{t(locale, 'dash.hello', { name: data.user?.displayName ?? '' })}</h1>

	<div class="grid stats">
		<a class="card stat" href="/patterns">
			<span class="num">{data.patternCount}</span>
			<span class="muted">{t(locale, 'dash.patterns')}</span>
		</a>
		<a class="card stat" href="/projects/board">
			<span class="num">{data.wip}</span>
			<span class="muted">{t(locale, 'dash.wip')}</span>
		</a>
		<a class="card stat" href="/stash">
			<span class="num">{data.yarnCount}</span>
			<span class="muted">{t(locale, 'dash.yarns')}</span>
		</a>
	</div>

	<h2>{t(locale, 'dash.recent')}</h2>
	{#if data.recentProjects.length === 0}
		<p class="muted">{t(locale, 'dash.none')} <a href="/projects/board">{t(locale, 'dash.create')}</a></p>
	{:else}
		<div class="grid">
			{#each data.recentProjects as p}
				<a class="card proj" href={`/projects/${p.id}`}>
					<strong>{p.title}</strong>
					<span class="tag">{statusLabel(locale, p.status)}</span>
					<div class="bar"><div class="fill" style={`width:${p.progressPct}%`}></div></div>
					<span class="muted small">{p.progressPct}%{p.deadline ? ` · ${t(locale, 'dash.deadline')} ${p.deadline}` : ''}</span>
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
