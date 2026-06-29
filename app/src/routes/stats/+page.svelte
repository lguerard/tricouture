<script lang="ts">
	let { data } = $props();
	const s = $derived(data.stats);
</script>

<div class="container">
	<h1>Mon année en mailles — {s.year}</h1>

	<div class="hero grid">
		<div class="card stat"><span class="num">{s.finishedThisYear}</span><span>projets terminés</span></div>
		<div class="card stat"><span class="num">{s.metersThisYear}</span><span>mètres tricotés</span></div>
		<div class="card stat"><span class="num">{s.hoursThisYear}</span><span>heures de craft</span></div>
		<div class="card stat green"><span class="num">{s.savingsThisYearEur} €</span><span>économisés</span></div>
	</div>

	<h2>Compteurs à vie</h2>
	<div class="grid">
		<div class="card mini"><strong>{s.finishedLifetime}</strong> projets finis au total</div>
		<div class="card mini"><strong>{s.patternCount}</strong> patrons</div>
		<div class="card mini"><strong>{s.yarnCount}</strong> laines en stock</div>
		<div class="card mini"><strong>{s.activeWip}</strong> projets en cours</div>
	</div>

	<h2>Succès</h2>
	<a class="card ach-summary" href="/achievements">
		<div class="ach-score">
			<span class="num">{data.ach.earnedPoints}</span>
			<span class="muted">/ {data.ach.totalPoints} pts</span>
		</div>
		<div class="ach-bar">
			<div class="ach-fill" style={`width:${Math.round((data.ach.unlockedCount / data.ach.totalCount) * 100)}%`}></div>
		</div>
		<span class="muted small">{data.ach.unlockedCount} / {data.ach.totalCount} succès débloqués · voir tout →</span>
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
