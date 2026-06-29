<script lang="ts">
	import { enhance } from '$app/forms';
	import { CRAFT_LABELS, CRAFTS, DIFFICULTY_LABELS } from '$lib/labels';
	let { form } = $props();
	let submitting = $state(false);
</script>

<div class="container narrow">
	<a href="/patterns" class="muted">← Patrons</a>
	<h1>Nouveau patron</h1>

	<form
		method="POST"
		enctype="multipart/form-data"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<div class="field">
			<label for="title">Titre *</label>
			<input id="title" name="title" required />
		</div>

		<div class="two">
			<div class="field">
				<label for="craft">Type *</label>
				<select id="craft" name="craft" required>
					{#each CRAFTS as c}<option value={c}>{CRAFT_LABELS[c]}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="garmentType">Vêtement / objet</label>
				<input id="garmentType" name="garmentType" placeholder="pull, chaussette, robe…" />
			</div>
		</div>

		<div class="two">
			<div class="field">
				<label for="designer">Créateur·rice</label>
				<input id="designer" name="designer" />
			</div>
			<div class="field">
				<label for="source">Source</label>
				<input id="source" name="source" placeholder="Ravelry, magazine, URL…" />
			</div>
		</div>

		<div class="two">
			<div class="field">
				<label for="difficulty">Difficulté</label>
				<select id="difficulty" name="difficulty">
					<option value="">—</option>
					{#each Object.entries(DIFFICULTY_LABELS) as [v, l]}<option value={v}>{l}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="language">Langue</label>
				<input id="language" name="language" placeholder="fr, en, ja…" />
			</div>
		</div>

		<div class="two">
			<div class="field">
				<label for="sizes">Tailles</label>
				<input id="sizes" name="sizes" placeholder="XS–XXL, 36–46…" />
			</div>
			<div class="field">
				<label for="yardageRequired">Métrage requis (m)</label>
				<input id="yardageRequired" name="yardageRequired" type="number" min="0" />
			</div>
		</div>

		<div class="two">
			<div class="field">
				<label for="gaugeStitches">Jauge — mailles / 10 cm</label>
				<input id="gaugeStitches" name="gaugeStitches" type="number" min="0" />
			</div>
			<div class="field">
				<label for="gaugeRows">Jauge — rangs / 10 cm</label>
				<input id="gaugeRows" name="gaugeRows" type="number" min="0" />
			</div>
		</div>

		<div class="field">
			<label for="tags">Tags (séparés par des virgules)</label>
			<input id="tags" name="tags" placeholder="été, dentelle, cadeau" />
		</div>

		<div class="field">
			<label for="notes">Notes</label>
			<textarea id="notes" name="notes" rows="3"></textarea>
		</div>

		<div class="field">
			<label for="files">Fichiers (PDF, images)</label>
			<input id="files" name="files" type="file" multiple accept=".pdf,image/*" />
			<span class="muted small">Le texte des PDF est indexé pour la recherche.</span>
		</div>

		{#if form?.error}<p class="error">{form.error}</p>{/if}

		<button class="btn-primary" type="submit" disabled={submitting}>
			{submitting ? 'Enregistrement…' : 'Enregistrer le patron'}
		</button>
	</form>
</div>

<style>
	.narrow {
		max-width: 680px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
	}
	.small {
		font-size: 0.8rem;
	}
	@media (max-width: 560px) {
		.two {
			grid-template-columns: 1fr;
		}
	}
</style>
