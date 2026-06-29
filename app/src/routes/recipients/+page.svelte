<script lang="ts">
	import { enhance } from '$app/forms';
	let { data } = $props();
	let adding = $state(false);
</script>

<div class="container">
	<header class="head">
		<h1>Destinataires</h1>
		<button class="btn-primary" onclick={() => (adding = !adding)}>{adding ? 'Fermer' : '+ Personne'}</button>
	</header>
	<p class="muted">Préférences pour le tricot/couture cadeau : couleurs aimées, allergies de fibres.</p>

	{#if adding}
		<form class="card add" method="POST" action="?/add" use:enhance={() => async ({ update }) => { await update({ reset: true }); adding = false; }}>
			<div class="field"><label for="n">Nom *</label><input id="n" name="name" required /></div>
			<div class="field"><label for="fc">Couleurs préférées (virgules)</label><input id="fc" name="favoriteColors" placeholder="bleu, vert, moutarde" /></div>
			<div class="field"><label for="fa">Allergies de fibres</label><input id="fa" name="fiberAllergies" placeholder="laine, mohair…" /></div>
			<div class="field"><label for="no">Notes</label><textarea id="no" name="notes" rows="2"></textarea></div>
			<button class="btn-primary" type="submit">Ajouter</button>
		</form>
	{/if}

	<div class="grid">
		{#each data.list as r}
			<div class="card">
				<strong>{r.name}</strong>
				{#if r.favoriteColors?.length}<div>{#each r.favoriteColors as c}<span class="tag">{c}</span>{/each}</div>{/if}
				{#if r.fiberAllergies}<span class="muted small">⚠ Allergie : {r.fiberAllergies}</span>{/if}
				{#if r.notes}<p class="small">{r.notes}</p>{/if}
				<form method="POST" action="?/delete" use:enhance><input type="hidden" name="id" value={r.id} /><button class="del" type="submit">Supprimer</button></form>
			</div>
		{/each}
	</div>
</div>

<style>
	.head { display: flex; justify-content: space-between; align-items: center; }
	.add { margin: 1rem 0; }
	.card { display: flex; flex-direction: column; gap: 0.3rem; }
	.del { color: var(--danger); align-self: flex-start; font-size: 0.8rem; margin-top: 0.3rem; }
	.small { font-size: 0.82rem; }
</style>
