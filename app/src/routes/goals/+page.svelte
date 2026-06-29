<script lang="ts">
	import { enhance } from '$app/forms';
	let { data } = $props();
	let adding = $state(false);

	const KINDS: Record<string, string> = {
		projets_an: 'Projets dans l’année',
		stash_busting: 'Vider le stock',
		defi_mensuel: 'Défi mensuel',
		autre: 'Autre'
	};
	function pct(c: number, t: number) {
		return Math.min(100, Math.round((c / Math.max(1, t)) * 100));
	}
</script>

<div class="container">
	<header class="head">
		<h1>Objectifs & défis</h1>
		<button class="btn-primary" onclick={() => (adding = !adding)}>{adding ? 'Fermer' : '+ Objectif'}</button>
	</header>

	{#if adding}
		<form class="card add" method="POST" action="?/add" use:enhance={() => async ({ update }) => { await update({ reset: true }); adding = false; }}>
			<div class="row">
				<div class="field"><label for="t">Titre *</label><input id="t" name="title" required /></div>
				<div class="field">
					<label for="k">Type</label>
					<select id="k" name="kind">{#each Object.entries(KINDS) as [v, l]}<option value={v}>{l}</option>{/each}</select>
				</div>
				<div class="field"><label for="tv">Cible</label><input id="tv" name="targetValue" type="number" min="1" value="1" /></div>
			</div>
			<div class="row">
				<div class="field"><label for="ps">Début</label><input id="ps" name="periodStart" type="date" /></div>
				<div class="field"><label for="pe">Fin</label><input id="pe" name="periodEnd" type="date" /></div>
			</div>
			<button class="btn-primary" type="submit">Créer</button>
		</form>
	{/if}

	{#if data.list.length === 0}
		<p class="muted">Aucun objectif. Fixe-toi un défi 💪</p>
	{:else}
		<div class="grid">
			{#each data.list as g}
				<div class="card goal">
					<div class="ghead">
						<strong>{g.title}</strong>
						<span class="tag">{KINDS[g.kind] ?? g.kind}</span>
					</div>
					<div class="bar"><div class="fill" style={`width:${pct(g.currentValue, g.targetValue)}%`}></div></div>
					<span class="muted small">{g.currentValue} / {g.targetValue}</span>
					<div class="actions">
						<form method="POST" action="?/step" use:enhance><input type="hidden" name="id" value={g.id} /><input type="hidden" name="delta" value="1" /><button type="submit">+1</button></form>
						<form method="POST" action="?/step" use:enhance><input type="hidden" name="id" value={g.id} /><input type="hidden" name="delta" value="-1" /><button type="submit">−1</button></form>
						<form method="POST" action="?/delete" use:enhance><input type="hidden" name="id" value={g.id} /><button class="del" type="submit">🗑</button></form>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.head { display: flex; justify-content: space-between; align-items: center; }
	.add { margin: 1rem 0; }
	.row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.7rem; }
	.goal { display: flex; flex-direction: column; gap: 0.35rem; }
	.ghead { display: flex; justify-content: space-between; gap: 0.5rem; }
	.bar { height: 8px; background: var(--accent-soft); border-radius: 999px; overflow: hidden; }
	.fill { height: 100%; background: var(--accent); }
	.actions { display: flex; gap: 0.4rem; margin-top: 0.3rem; }
	.del { color: var(--danger); }
	.small { font-size: 0.8rem; }
	@media (max-width: 560px) { .row { grid-template-columns: 1fr; } }
</style>
