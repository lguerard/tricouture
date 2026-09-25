<script lang="ts">
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
	import { statusLabel, craftLabel } from '$lib/labels';
	import { formatDeadline, daysFromToday } from '$lib/format';
	import { mediaUrl } from '$lib/media';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);
	const r = $derived(data.resume);
</script>

<div class="container">
	<h1>{t(locale, 'dash.hello', { name: data.user?.displayName ?? '' })}</h1>

	{#if r}
		<section class="card resume">
			{#if r.coverPath}
				<img src={mediaUrl(r.coverPath, 400)} alt="" />
			{:else}
				<div class="cover-ph">🧶</div>
			{/if}
			<div class="resume-body">
				<span class="muted small">{t(locale, 'dash.resume')}</span>
				<a class="resume-title" href={`/projects/${r.id}`}>{r.title}</a>
				<div class="bar"><div class="fill" style={`width:${r.progressPct}%`}></div></div>
				<span class="muted small">
					{r.totalRows
						? t(locale, 'dash.rowOf', { n: r.currentRow, total: r.totalRows })
						: t(locale, 'dash.row', { n: r.currentRow })} · {r.progressPct}%
				</span>
				<div class="resume-actions">
					<form method="POST" action={`/projects/${r.id}?/row`} use:enhance={withFeedback()}>
						<input type="hidden" name="delta" value="1" />
						<button type="submit" class="btn-primary">{t(locale, 'projects.detail.addRow')}</button>
					</form>
					<a class="btn" href={`/projects/${r.id}`}>{t(locale, 'dash.open')}</a>
				</div>
			</div>
		</section>
	{/if}

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

	{#if data.deadlines.length}
		<h2>{t(locale, 'dash.deadlines')}</h2>
		<ul class="card deadlines">
			{#each data.deadlines as d}
				<li class:late={daysFromToday(d.deadline!) < 0}>
					<a href={`/projects/${d.id}`}>{d.title}</a>
					<span class="muted small">{formatDeadline(locale, d.deadline)} · {d.progressPct}%</span>
				</li>
			{/each}
		</ul>
	{/if}

	<h2>{t(locale, 'dash.recent')}</h2>
	{#if data.recentProjects.length === 0 && !r}
		<p class="muted">{t(locale, 'dash.none')} <a href="/projects/board">{t(locale, 'dash.create')}</a></p>
	{:else}
		<div class="grid">
			{#each data.recentProjects as p}
				<a class="card proj" href={`/projects/${p.id}`}>
					<strong>{p.title}</strong>
					<span class="tag">{statusLabel(locale, p.status)}</span>
					<div class="bar"><div class="fill" style={`width:${p.progressPct}%`}></div></div>
					<span class="muted small">{p.progressPct}%{p.deadline ? ` · ${t(locale, 'dash.deadline')} ${formatDeadline(locale, p.deadline)}` : ''}</span>
				</a>
			{/each}
		</div>
	{/if}

	{#if data.recentPatterns.length}
		<div class="section-head">
			<h2>{t(locale, 'dash.recentPatterns')}</h2>
			<a href="/patterns">{t(locale, 'dash.allPatterns')} →</a>
		</div>
		<div class="patterns">
			{#each data.recentPatterns as p}
				<a class="card pat" href={`/patterns/${p.id}`}>
					{#if p.coverPath}
						<img src={mediaUrl(p.coverPath, 400)} alt="" loading="lazy" />
					{:else}
						<div class="cover-ph">📄</div>
					{/if}
					<strong>{p.title}</strong>
					<span class="muted small">{craftLabel(locale, p.craft)}</span>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.resume {
		display: flex;
		gap: 1rem;
		align-items: stretch;
		margin-bottom: 1.5rem;
	}
	.resume img,
	.resume .cover-ph {
		width: 120px;
		height: 120px;
		flex: none;
		object-fit: cover;
		border-radius: var(--radius);
	}
	.resume-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.resume-title {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--text);
	}
	.resume-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: auto;
	}
	.cover-ph {
		display: grid;
		place-items: center;
		font-size: 2.2rem;
		background: var(--accent-soft);
		border-radius: var(--radius);
	}
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
	.stat:hover,
	.proj:hover,
	.pat:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.num {
		font-size: 2rem;
		font-weight: 700;
		color: var(--accent);
	}
	.deadlines {
		list-style: none;
		margin: 0 0 1.5rem;
		padding: 0.4rem 1rem;
	}
	.deadlines li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--border);
	}
	.deadlines li:last-child {
		border-bottom: none;
	}
	.deadlines li.late span {
		color: var(--danger);
	}
	.proj {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		color: var(--text);
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
	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: 1.5rem;
	}
	.patterns {
		display: grid;
		gap: 0.8rem;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	}
	.pat {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.6rem;
		color: var(--text);
	}
	.pat img,
	.pat .cover-ph {
		width: 100%;
		aspect-ratio: 4 / 5;
		object-fit: cover;
		border-radius: var(--radius);
	}
	.pat strong {
		font-size: 0.88rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.small {
		font-size: 0.8rem;
	}
	@media (max-width: 560px) {
		.resume img,
		.resume .cover-ph {
			width: 84px;
			height: 84px;
		}
		.deadlines li {
			flex-direction: column;
			gap: 0.1rem;
		}
	}
</style>
