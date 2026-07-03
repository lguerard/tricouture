<script lang="ts">
	import { t } from '$lib/i18n';

	let { data } = $props();
	const s = $derived(data.stats);
	const locale = $derived(data.locale);
</script>

<div class="container">
	<h1>{t(locale, 'stats.title', { year: s.year })}</h1>

	<div class="hero grid">
		<div class="card stat"><span class="num">{s.finishedThisYear}</span><span>{t(locale, 'stats.finishedThisYear')}</span></div>
		<div class="card stat"><span class="num">{s.metersThisYear}</span><span>{t(locale, 'stats.metersThisYear')}</span></div>
		<div class="card stat"><span class="num">{s.hoursThisYear}</span><span>{t(locale, 'stats.hoursThisYear')}</span></div>
		<div class="card stat green"><span class="num">{s.savingsThisYearEur} €</span><span>{t(locale, 'stats.savingsThisYear')}</span></div>
	</div>

	<h2>{t(locale, 'stats.lifetimeCounters')}</h2>
	<div class="grid">
		<div class="card mini"><strong>{s.finishedLifetime}</strong> {t(locale, 'stats.finishedLifetime')}</div>
		<div class="card mini"><strong>{s.patternCount}</strong> {t(locale, 'dash.patterns')}</div>
		<div class="card mini"><strong>{s.yarnCount}</strong> {t(locale, 'dash.yarns')}</div>
		<div class="card mini"><strong>{s.activeWip}</strong> {t(locale, 'dash.wip')}</div>
	</div>

	<h2>{t(locale, 'nav.achievements')}</h2>
	<a class="card ach-summary" href="/achievements">
		<div class="ach-score">
			<span class="num">{data.ach.earnedPoints}</span>
			<span class="muted">/ {data.ach.totalPoints} pts</span>
		</div>
		<div class="ach-bar">
			<div class="ach-fill" style={`width:${Math.round((data.ach.unlockedCount / data.ach.totalCount) * 100)}%`}></div>
		</div>
		<span class="muted small"
			>{t(locale, 'stats.achUnlockedLine', { unlocked: data.ach.unlockedCount, total: data.ach.totalCount })}</span
		>
	</a>
</div>

<style>
	.hero {
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		margin-bottom: 1.5rem;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		text-align: center;
	}
	.num {
		font-size: 2.2rem;
		font-weight: 700;
		color: var(--accent);
	}
	.green .num {
		color: var(--ok);
	}
	.mini {
		text-align: center;
	}
	.mini strong {
		font-size: 1.4rem;
		color: var(--accent);
	}
	.ach-summary {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		color: var(--text);
		max-width: 420px;
	}
	.ach-summary:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.ach-score {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}
	.ach-score .num {
		font-size: 1.8rem;
		font-weight: 800;
		color: var(--accent);
	}
	.ach-bar {
		height: 14px;
		background: var(--accent-soft);
		border-radius: 999px;
		overflow: hidden;
	}
	.ach-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--accent), #b07cc6);
	}
	.small {
		font-size: 0.75rem;
	}
</style>
