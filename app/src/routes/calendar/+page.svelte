<script lang="ts">
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);

	function daysLeft(d: string): number {
		return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000);
	}
	function monthLabel(d: string, loc: string): string {
		return new Date(d + 'T00:00:00').toLocaleDateString(loc === 'en' ? 'en-US' : 'fr-FR', {
			month: 'long',
			year: 'numeric'
		});
	}

	const groups = $derived.by(() => {
		const map = new Map<string, typeof data.rows>();
		for (const r of data.rows) {
			if (!r.deadline) continue;
			const key = monthLabel(r.deadline, locale);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(r);
		}
		return [...map.entries()];
	});
</script>

<div class="container">
	<h1>{t(locale, 'calendar.title')}</h1>
	{#if data.rows.length === 0}
		<p class="muted">{t(locale, 'calendar.empty')}</p>
	{:else}
		{#each groups as [month, items]}
			<h2 class="month">{month}</h2>
			<div class="list">
				{#each items as r}
					{@const dd = r.deadline ?? ''}
					{@const dl = daysLeft(dd)}
					<a class="card row" href={`/projects/${r.id}`}>
						<div class="date">{new Date(dd + 'T00:00:00').getDate()}</div>
						<div class="info">
							<strong>{r.title}</strong>
							<div class="bar"><div class="fill" style={`width:${r.progressPct}%`}></div></div>
						</div>
						<span class="badge" class:late={dl < 0} class:soon={dl >= 0 && dl <= 7}>
							{dl < 0 ? t(locale, 'calendar.daysLate', { n: -dl }) : t(locale, 'calendar.daysLeft', { n: dl })}
						</span>
					</a>
				{/each}
			</div>
		{/each}
	{/if}
</div>

<style>
	.month { text-transform: capitalize; margin-top: 1.4rem; }
	.list { display: flex; flex-direction: column; gap: 0.5rem; }
	.row { display: flex; align-items: center; gap: 1rem; color: var(--text); }
	.row:hover { text-decoration: none; border-color: var(--accent); }
	.date { font-size: 1.6rem; font-weight: 700; color: var(--accent); width: 2.2rem; text-align: center; }
	.info { flex: 1; }
	.bar { height: 6px; background: var(--accent-soft); border-radius: 999px; overflow: hidden; margin-top: 0.3rem; }
	.fill { height: 100%; background: var(--accent); }
	.badge { font-size: 0.78rem; padding: 0.15rem 0.55rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent); white-space: nowrap; }
	.badge.soon { background: var(--warn-soft); color: var(--warn); }
	.badge.late { background: var(--danger-soft); color: var(--danger); }
</style>
