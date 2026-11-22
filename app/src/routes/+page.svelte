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
	const today = $derived(
		new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
	);

	// Bouton +1 festonné (« cookie ») : contour calculé une fois.
	const cookie = (() => {
		const pts: string[] = [];
		for (let i = 0; i <= 120; i++) {
			const a = (i / 120) * Math.PI * 2;
			const rr = 46 * (1 + 0.075 * Math.cos(9 * a));
			pts.push(`${(50 + rr * Math.cos(a)).toFixed(2)} ${(50 + rr * Math.sin(a)).toFixed(2)}`);
		}
		return `M${pts.join(' L')} Z`;
	})();
</script>

<div class="container">
	<header class="head">
		<p class="muted date">{today}</p>
		<h1>{t(locale, 'dash.hello', { name: data.user?.displayName ?? '' })}</h1>
	</header>

	<div class="bento">
		{#if r}
			<section class="hero" aria-label={t(locale, 'dash.resume')}>
				{#if r.coverPath}
					<img class="hero-cover" src={mediaUrl(r.coverPath, 400)} alt="" />
				{/if}
				<span class="pill">{t(locale, 'dash.resume')}</span>
				<a class="hero-title" href={`/projects/${r.id}`}>{r.title}</a>
				<div class="hero-bar" aria-hidden="true"><div class="hero-fill" style={`width:${r.progressPct}%`}></div></div>
				<div class="hero-row">
					<div class="hero-count">
						<span class="big">{r.currentRow}</span>
						<span class="hero-muted">
							{r.totalRows
								? t(locale, 'dash.rowOf', { n: r.currentRow, total: r.totalRows })
								: t(locale, 'dash.row', { n: r.currentRow })} · {r.progressPct}%
						</span>
					</div>
					<form method="POST" action={`/projects/${r.id}?/row`} use:enhance={withFeedback()}>
						<input type="hidden" name="delta" value="1" />
						<button type="submit" class="plus" aria-label={t(locale, 'projects.detail.addRow')}>
							<svg viewBox="0 0 100 100" aria-hidden="true"><path d={cookie} /></svg>
							<span>+1</span>
						</button>
					</form>
				</div>
				<a class="hero-link" href={`/projects/${r.id}`}>{t(locale, 'dash.open')} →</a>
			</section>
		{:else}
			<section class="hero">
				<h2 class="hero-title">{t(locale, 'dash.none')}</h2>
				<div class="hero-actions">
					<a class="hero-btn" href="/projects/board">{t(locale, 'dash.create')}</a>
					<a class="hero-link" href="/patterns">{t(locale, 'dash.allPatterns')} →</a>
				</div>
			</section>
		{/if}

		<section class="tile deadlines" aria-label={t(locale, 'dash.deadlines')}>
			<h2>{t(locale, 'dash.deadlines')}</h2>
			{#if data.deadlines.length}
				<ul>
					{#each data.deadlines as d}
						<li class:late={daysFromToday(d.deadline!) < 0}>
							<a href={`/projects/${d.id}`}>{d.title}</a>
							<span class="when">{formatDeadline(locale, d.deadline)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">{t(locale, 'dash.noDeadlines')}</p>
			{/if}
		</section>

		<a class="tile stat t-patterns" href="/patterns">
			<span class="num">{data.patternCount}</span>
			<span>{t(locale, 'dash.patterns')}</span>
		</a>
		<a class="tile stat t-wip" href="/projects/board">
			<span class="num">{data.wip}</span>
			<span>{t(locale, 'dash.wip')}</span>
		</a>
		<a class="tile stat t-stash" href="/stash">
			<span class="num">{data.yarnCount}</span>
			<span>{t(locale, 'dash.yarns')}</span>
		</a>
	</div>

	<div class="section-head">
		<h2>{t(locale, 'dash.recent')}</h2>
		<a href="/projects/board">{t(locale, 'nav.projects')} →</a>
	</div>
	{#if data.recentProjects.length === 0 && !r}
		<p class="muted">{t(locale, 'dash.none')} <a href="/projects/board">{t(locale, 'dash.create')}</a></p>
	{:else}
		<div class="covers">
			{#each data.recentProjects as p}
				<a class="cover-card" href={`/projects/${p.id}`}>
					{#if p.coverPath}
						<img src={mediaUrl(p.coverPath, 400)} alt="" loading="lazy" />
					{:else}
						<div class="cover-ph">🧶</div>
					{/if}
					<strong>{p.title}</strong>
					<span class="muted small">
						{statusLabel(locale, p.status)} · {p.progressPct}%{p.deadline
							? ` · ${t(locale, 'dash.deadline')} ${formatDeadline(locale, p.deadline)}`
							: ''}
					</span>
				</a>
			{/each}
		</div>
	{/if}

	{#if data.recentPatterns.length}
		<div class="section-head">
			<h2>{t(locale, 'dash.recentPatterns')}</h2>
			<a href="/patterns">{t(locale, 'dash.allPatterns')} →</a>
		</div>
		<div class="covers">
			{#each data.recentPatterns as p}
				<a class="cover-card" href={`/patterns/${p.id}`}>
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
	/* Bloc du projet en cours : un ton très foncé de la couleur du thème
	   (Material You compris), clair en dessus. */
	.bento {
		--hero: color-mix(in srgb, var(--accent) 30%, #0e0911);
		--hero-accent: color-mix(in srgb, var(--accent) 35%, #fff);
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}
	.head {
		margin-bottom: 1.2rem;
	}
	.date {
		margin: 0;
		font-weight: 600;
	}
	.date::first-letter {
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.9rem, 4.5vw, 2.8rem);
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.hero {
		grid-column: span 7;
		grid-row: span 2;
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 1.6rem 1.8rem;
		border-radius: 32px;
		background: var(--hero);
		color: #fff;
		min-height: 300px;
	}
	.hero-cover {
		position: absolute;
		right: -40px;
		top: -40px;
		width: 190px;
		height: 190px;
		border-radius: 50%;
		object-fit: cover;
		border: 14px solid color-mix(in srgb, #fff 12%, transparent);
	}
	.pill {
		align-self: flex-start;
		position: relative;
		padding: 0.3rem 0.8rem;
		border-radius: 999px;
		background: var(--hero-accent);
		color: var(--hero);
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.hero-title {
		position: relative;
		margin: 0;
		padding-right: 140px;
		color: #fff;
		font-size: clamp(1.6rem, 3.2vw, 2.4rem);
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.02em;
	}
	.hero-bar {
		height: 10px;
		border-radius: 999px;
		background: color-mix(in srgb, #fff 14%, transparent);
		overflow: hidden;
	}
	.hero-fill {
		height: 100%;
		border-radius: 999px;
		background: var(--hero-accent);
	}
	.hero-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-top: auto;
	}
	.hero-count {
		display: flex;
		flex-direction: column;
	}
	.big {
		font-size: clamp(4rem, 9vw, 6.5rem);
		font-weight: 900;
		line-height: 0.9;
		letter-spacing: -0.05em;
		font-variant-numeric: tabular-nums;
	}
	.hero-muted {
		color: color-mix(in srgb, #fff 80%, transparent);
		font-weight: 600;
		margin-top: 0.4rem;
	}
	.plus {
		position: relative;
		width: 112px;
		height: 112px;
		padding: 0;
		border: none;
		background: none;
		display: grid;
		place-items: center;
		cursor: pointer;
		color: var(--hero);
	}
	.plus svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		fill: var(--hero-accent);
		transition: transform 0.15s;
	}
	.plus:hover svg {
		transform: rotate(20deg) scale(1.04);
	}
	.plus:active svg {
		transform: scale(0.94);
	}
	.plus span {
		position: relative;
		font-size: 1.7rem;
		font-weight: 900;
	}
	.hero-link {
		color: #fff;
		font-weight: 700;
		align-self: flex-start;
	}
	.hero-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: auto;
	}
	.hero-btn {
		padding: 0.8rem 1.4rem;
		border-radius: 999px;
		background: var(--hero-accent);
		color: var(--hero);
		font-weight: 800;
	}
	.tile {
		border-radius: 28px;
		padding: 1.3rem 1.5rem;
		color: var(--text);
	}
	.tile h2 {
		margin: 0 0 0.6rem;
		font-size: 1.05rem;
	}
	.deadlines {
		grid-column: span 5;
		grid-row: span 2;
		background: var(--info-soft);
	}
	.deadlines ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.deadlines li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
		min-height: 2.6rem;
		padding: 0 0.9rem;
		border-radius: 14px;
		background: var(--surface);
	}
	.deadlines li a {
		color: var(--text);
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.when {
		flex: none;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	.deadlines li.late .when {
		color: var(--danger);
	}
	.stat {
		grid-column: span 4;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-weight: 600;
	}
	.stat:hover {
		text-decoration: none;
		filter: brightness(0.97);
	}
	.num {
		font-size: 2.4rem;
		font-weight: 900;
		line-height: 1;
		letter-spacing: -0.03em;
	}
	.t-patterns {
		background: var(--accent-soft);
		border-radius: 28px 28px 28px 8px;
	}
	.t-wip {
		background: var(--warn-soft);
	}
	.t-stash {
		background: var(--ok-soft);
		border-radius: 28px 8px 28px 28px;
	}
	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: 1.5rem;
	}
	.section-head h2 {
		font-size: 1.35rem;
		font-weight: 800;
	}
	.covers {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	}
	.cover-card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		color: var(--text);
	}
	.cover-card:hover {
		text-decoration: none;
	}
	.cover-card:hover strong {
		color: var(--accent);
	}
	.cover-card img,
	.cover-card .cover-ph {
		width: 100%;
		aspect-ratio: 1 / 1.1;
		object-fit: cover;
		border-radius: 22px;
	}
	.cover-card strong {
		font-size: 0.95rem;
		font-weight: 800;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cover-ph {
		display: grid;
		place-items: center;
		font-size: 2.4rem;
		background: var(--accent-soft);
	}
	.small {
		font-size: 0.8rem;
	}
	@media (max-width: 860px) {
		.hero,
		.deadlines {
			grid-column: 1 / -1;
			grid-row: auto;
		}
		.stat {
			grid-column: span 4;
			padding: 1rem;
		}
		.num {
			font-size: 1.9rem;
		}
	}
	@media (max-width: 560px) {
		.hero {
			padding: 1.3rem 1.3rem 1.4rem;
		}
		.hero-cover {
			width: 120px;
			height: 120px;
			right: -30px;
			top: -30px;
			border-width: 10px;
		}
		.hero-title {
			padding-right: 80px;
		}
		.plus {
			width: 96px;
			height: 96px;
		}
		.stat span:not(.num) {
			font-size: 0.82rem;
		}
	}
</style>
