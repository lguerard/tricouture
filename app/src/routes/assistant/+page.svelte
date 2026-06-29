<script lang="ts">
	import { CRAFTS, CRAFT_LABELS } from '$lib/labels';

	let tab = $state<'translate' | 'generate'>('translate');

	// Traduction
	let source = $state('');
	let translation = $state('');
	let tBusy = $state(false);
	let tErr = $state('');

	async function translate() {
		tBusy = true;
		tErr = '';
		translation = '';
		try {
			const res = await fetch('/api/ai/translate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: source })
			});
			const data = await res.json();
			if (!res.ok) tErr = data.error ?? 'Erreur';
			else translation = data.result;
		} catch {
			tErr = 'Erreur réseau';
		}
		tBusy = false;
	}

	// Génération de patron
	let desc = $state('');
	let craft = $state('tricot');
	let gauge = $state('');
	let size = $state('');
	let pattern = $state('');
	let gBusy = $state(false);
	let gErr = $state('');

	async function genPattern() {
		gBusy = true;
		gErr = '';
		pattern = '';
		try {
			const res = await fetch('/api/ai/generate-pattern', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ description: desc, craft, gauge, size })
			});
			const data = await res.json();
			if (!res.ok) gErr = data.error ?? 'Erreur';
			else pattern = data.result;
		} catch {
			gErr = 'Erreur réseau';
		}
		gBusy = false;
	}
</script>

<div class="container">
	<h1>Assistant IA</h1>
	<p class="muted">Fonctionne avec le serveur Ollama local (GPU). Voir la doc self-host pour l'activer.</p>

	<div class="tabs">
		<button class:active={tab === 'translate'} onclick={() => (tab = 'translate')}>🌍 Traduire un patron</button>
		<button class:active={tab === 'generate'} onclick={() => (tab = 'generate')}>✨ Générer un patron</button>
	</div>

	{#if tab === 'translate'}
		<div class="two">
			<div class="field">
				<label for="src">Patron source (anglais, japonais, allemand…)</label>
				<textarea id="src" rows="14" bind:value={source} placeholder="Colle ici le texte du patron…"></textarea>
				<button class="btn-primary" onclick={translate} disabled={tBusy || !source}>{tBusy ? 'Traduction…' : 'Traduire en français'}</button>
				{#if tErr}<p class="error">{tErr}</p>{/if}
			</div>
			<div class="field">
				<label for="out">Traduction française</label>
				<textarea id="out" rows="14" readonly value={translation}></textarea>
			</div>
		</div>
	{:else}
		<div class="two">
			<div class="form">
				<div class="field"><label for="d">Décris le vêtement / l'objet</label><textarea id="d" rows="4" bind:value={desc} placeholder="pull col roulé, manches raglan, ample…"></textarea></div>
				<div class="field">
					<label for="c">Type</label>
					<select id="c" bind:value={craft}>{#each CRAFTS as c}<option value={c}>{CRAFT_LABELS[c]}</option>{/each}</select>
				</div>
				<div class="field"><label for="g">Jauge (échantillon)</label><input id="g" bind:value={gauge} placeholder="22 m × 30 rgs / 10 cm" /></div>
				<div class="field"><label for="s">Taille / mensurations</label><input id="s" bind:value={size} placeholder="M, tour de poitrine 96 cm" /></div>
				<button class="btn-primary" onclick={genPattern} disabled={gBusy || !desc}>{gBusy ? 'Génération…' : 'Générer le patron'}</button>
				{#if gErr}<p class="error">{gErr}</p>{/if}
			</div>
			<div class="field">
				<label for="po">Patron généré</label>
				<textarea id="po" rows="20" readonly value={pattern}></textarea>
			</div>
		</div>
	{/if}
</div>

<style>
	.tabs { display: flex; gap: 0.5rem; margin: 1rem 0; }
	.tabs button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
	.form { display: flex; flex-direction: column; }
	textarea { font-family: ui-monospace, monospace; font-size: 0.85rem; }
	@media (max-width: 720px) { .two { grid-template-columns: 1fr; } }
</style>
