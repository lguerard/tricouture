<script lang="ts">
	import { STATUS_LABELS, STATUS_ORDER } from '$lib/labels';
	let { data, form } = $props();
</script>

<div class="container narrow">
	<a href="/projects/board" class="muted">← Projets</a>
	<h1>Nouveau projet</h1>

	<form method="POST">
		<div class="field">
			<label for="title">Titre *</label>
			<input id="title" name="title" required />
		</div>
		<div class="field">
			<label for="patternId">Patron lié</label>
			<select id="patternId" name="patternId">
				<option value="">— Aucun —</option>
				{#each data.patternOptions as p}
					<option value={p.id} selected={data.presetPattern === p.id}>{p.title}</option>
				{/each}
			</select>
		</div>
		<div class="two">
			<div class="field">
				<label for="status">Colonne</label>
				<select id="status" name="status">
					{#each STATUS_ORDER as s}<option value={s}>{STATUS_LABELS[s]}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="totalRows">Nombre de rangs total</label>
				<input id="totalRows" name="totalRows" type="number" min="0" />
			</div>
		</div>
		<div class="field">
			<label for="deadline">Échéance (cadeau ?)</label>
			<input id="deadline" name="deadline" type="date" />
		</div>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button class="btn-primary" type="submit">Créer le projet</button>
	</form>
</div>

<style>
	.narrow {
		max-width: 560px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
	}
</style>
