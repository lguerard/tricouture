<script lang="ts">
	import { onMount } from 'svelte';
	import { tierLabel, TIER_COLOR, type Tier } from '$lib/achievements';
	import { t } from '$lib/i18n';
	let { data } = $props();

	const locale = $derived(data.locale);

	const completion = $derived(Math.round((data.unlockedCount / data.totalCount) * 100));

	// Breakdown by rarity.
	const tiers: Tier[] = ['bronze', 'argent', 'or', 'platine'];
	const byTier = $derived(
		tiers.map((t) => ({
			tier: t,
			unlocked: data.list.filter((a) => a.tier === t && a.unlocked).length,
			total: data.list.filter((a) => a.tier === t).length
		}))
	);

	// Grouped by category (locked ones shown with progress).
	const categories = $derived.by(() => {
		const map = new Map<string, typeof data.list>();
		for (const a of data.list) {
			if (!map.has(a.category)) map.set(a.category, []);
			map.get(a.category)!.push(a);
		}
		return [...map.entries()];
	});

	// Steam-style toast for freshly unlocked achievements.
	let toasts = $state<typeof data.newlyUnlocked>([]);
	onMount(() => {
		if (data.newlyUnlocked.length) {
			toasts = data.newlyUnlocked;
			setTimeout(() => (toasts = []), 6000);
		}
	});

	function fmtDate(d: string | Date | null) {
		if (!d) return '';
		return new Date(d).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<div class="container">
	<h1>{t(locale, 'achievements.title')}</h1>

	<!-- Gamerscore-style recap banner -->
	<div class="card hero">
		<div class="score">
			<span class="pts">{data.earnedPoints}</span>
			<span class="muted">/ {data.totalPoints} pts</span>
		</div>
		<div class="bigbar">
			<div class="bigfill" style={`width:${completion}%`}></div>
			<span class="biglabel"
				>{t(locale, 'achievements.progressLabel', {
					unlocked: data.unlockedCount,
					total: data.totalCount,
					completion
				})}</span
			>
		</div>
		<div class="tierline">
			{#each byTier as bt}
				<span class="tchip" style={`--c:${TIER_COLOR[bt.tier]}`}>
					<span class="dot"></span>{tierLabel(locale, bt.tier)} {bt.unlocked}/{bt.total}
				</span>
			{/each}
		</div>
	</div>

	{#each categories as [cat, items]}
		<h2 class="cat">{t(locale, `achv.cat.${cat}`)}</h2>
		<div class="grid ach-grid">
			{#each items as a}
				<div class="ach card" class:locked={!a.unlocked} style={`--c:${TIER_COLOR[a.tier]}`}>
					<div class="ico">{a.icon}</div>
					<div class="body">
						<div class="top">
							<strong>{t(locale, `achv.${a.code}.label`)}</strong>
							<span class="pill">{tierLabel(locale, a.tier)} · {a.points}</span>
						</div>
						<span class="muted small">{t(locale, `achv.${a.code}.description`)}</span>
						{#if a.unlocked}
							<span class="done"
								>{t(locale, 'achievements.unlockedOn', { date: fmtDate(a.unlockedAt) })}</span
							>
						{:else}
							<div class="pbar"><div class="pfill" style={`width:${Math.round((a.current / a.target) * 100)}%`}></div></div>
							<span class="muted small">{a.current} / {a.target}</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/each}
</div>

<!-- Toasts -->
<div class="toasts">
	{#each toasts as toast}
		<div class="toast" style={`--c:${TIER_COLOR[toast.tier]}`}>
			<div class="ticon">{toast.icon}</div>
			<div>
				<div class="muted small">
					{t(locale, 'achievements.toastUnlocked', { points: toast.points })}
				</div>
				<strong>{t(locale, `achv.${toast.code}.label`)}</strong>
			</div>
		</div>
	{/each}
</div>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		margin-bottom: 1.5rem;
	}
	.score {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.pts {
		font-size: 2.4rem;
		font-weight: 800;
		color: var(--accent);
	}
	.bigbar {
		position: relative;
		height: 22px;
		background: var(--accent-soft);
		border-radius: 999px;
		overflow: hidden;
	}
	.bigfill {
		height: 100%;
		background: linear-gradient(90deg, var(--accent), #b07cc6);
	}
	.biglabel {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 0.8rem;
		color: var(--text);
	}
	.tierline {
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.tchip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.82rem;
	}
	.tchip .dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: var(--c);
	}
	.cat {
		margin: 1.4rem 0 0.6rem;
	}
	.ach-grid {
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	}
	.ach {
		display: flex;
		gap: 0.8rem;
		border-left: 4px solid var(--c);
	}
	.ach.locked {
		opacity: 0.55;
		filter: grayscale(0.85);
	}
	.ico {
		font-size: 2.2rem;
		line-height: 1;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		flex: 1;
	}
	.top {
		display: flex;
		justify-content: space-between;
		gap: 0.4rem;
		align-items: center;
	}
	.pill {
		font-size: 0.72rem;
		background: var(--c);
		color: #fff;
		padding: 0.05rem 0.45rem;
		border-radius: 999px;
		white-space: nowrap;
	}
	.small {
		font-size: 0.8rem;
	}
	.done {
		font-size: 0.8rem;
		color: var(--ok);
		margin-top: 0.2rem;
	}
	.pbar {
		height: 6px;
		background: var(--accent-soft);
		border-radius: 999px;
		overflow: hidden;
		margin-top: 0.3rem;
	}
	.pfill {
		height: 100%;
		background: var(--c);
	}
	.toasts {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		z-index: 50;
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 5px solid var(--c);
		border-radius: var(--radius);
		padding: 0.7rem 1rem;
		box-shadow: 0 4px 16px rgba(43, 35, 48, 0.18);
		animation: slidein 0.3s ease;
		min-width: 230px;
	}
	.ticon {
		font-size: 1.8rem;
	}
	@keyframes slidein {
		from {
			transform: translateX(120%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
</style>
