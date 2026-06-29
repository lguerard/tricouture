<script lang="ts">
	import { CRAFT_LABELS, DIFFICULTY_LABELS } from '$lib/labels';
	let { data } = $props();
	const p = $derived(data.pattern);

	function isImage(mime: string) {
		return mime.startsWith('image/');
	}
	function isPdf(mime: string) {
		return mime === 'application/pdf';
	}

	// Copilote IA
	let question = $state('');
	let answer = $state('');
	let aiBusy = $state(false);
	let aiErr = $state('');
	async function askCopilot() {
		aiBusy = true;
		aiErr = '';
		answer = '';
		try {
			const res = await fetch('/api/ai/copilot', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ patternId: p.id, question })
			});
			const d = await res.json();
			if (!res.ok) aiErr = d.error ?? 'Erreur';
			else answer = d.result;
		} catch {
			aiErr = 'Erreur réseau';
		}
		aiBusy = false;
	}
</script>

<div class="container">
	<a href="/patterns" class="muted">← Patrons</a>

	<header class="head">
		<div>
			<h1>{p.title}</h1>
			<div>
				<span class="tag">{CRAFT_LABELS[p.craft]}</span>
				{#each p.tags ?? [] as t}<span class="tag">{t}</span>{/each}
			</div>
		</div>
		<form
			method="POST"
			action="?/delete"
			onsubmit={(e) => {
				if (!confirm('Supprimer ce patron et ses fichiers ?')) e.preventDefault();
			}}
		>
			<button type="submit">🗑 Supprimer</button>
		</form>
	</header>

	<div class="cols">
		<section class="meta card">
			<dl>
				{#if p.garmentType}<dt>Objet</dt><dd>{p.garmentType}</dd>{/if}
				{#if p.designer}<dt>Créateur·rice</dt><dd>{p.designer}</dd>{/if}
				{#if p.source}<dt>Source</dt><dd>{p.source}</dd>{/if}
				{#if p.difficulty}<dt>Difficulté</dt><dd>{DIFFICULTY_LABELS[p.difficulty]}</dd>{/if}
				{#if p.language}<dt>Langue</dt><dd>{p.language}</dd>{/if}
				{#if p.sizes}<dt>Tailles</dt><dd>{p.sizes}</dd>{/if}
				{#if p.gaugeStitches || p.gaugeRows}
					<dt>Jauge</dt><dd>{p.gaugeStitches ?? '?'} m × {p.gaugeRows ?? '?'} rgs / 10 cm</dd>
				{/if}
				{#if p.yardageRequired}<dt>Métrage</dt><dd>{p.yardageRequired} m</dd>{/if}
			</dl>
			{#if p.notes}<p class="notes">{p.notes}</p>{/if}
		</section>

		<section class="files">
			{#if data.files.length === 0}
				<p class="muted">Aucun fichier joint.</p>
			{:else}
				{#each data.files as f}
					<div class="file card">
						<div class="file-head">
							<strong>{f.filename}</strong>
							<a href={`/media/${f.storedPath}`} target="_blank" rel="noopener">Ouvrir</a>
						</div>
						{#if isImage(f.mimeType)}
							<img src={`/media/${f.storedPath}`} alt={f.filename} />
						{:else if isPdf(f.mimeType)}
							<iframe src={`/media/${f.storedPath}`} title={f.filename}></iframe>
						{/if}
					</div>
				{/each}
			{/if}
		</section>
	</div>

	<section class="card copilot">
		<h2>🤖 Copilote — pose une question sur ce patron</h2>
		<div class="ask">
			<input bind:value={question} placeholder="Que veut dire k2tog ? Adapte la taille M en L…" onkeydown={(e) => e.key === 'Enter' && question && askCopilot()} />
			<button class="btn-primary" onclick={askCopilot} disabled={aiBusy || !question}>{aiBusy ? '…' : 'Demander'}</button>
		</div>
		{#if aiErr}<p class="error">{aiErr}</p>{/if}
		{#if answer}<div class="answer">{answer}</div>{/if}
	</section>
</div>

<style>
	.copilot {
		margin-top: 1.2rem;
	}
	.ask {
		display: flex;
		gap: 0.5rem;
	}
	.ask input {
		flex: 1;
	}
	.answer {
		margin-top: 0.8rem;
		white-space: pre-wrap;
		background: var(--accent-soft);
		padding: 0.8rem;
		border-radius: var(--radius);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	.cols {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 1.2rem;
		margin-top: 1rem;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3rem 0.8rem;
		margin: 0;
	}
	dt {
		color: var(--muted);
		font-size: 0.85rem;
	}
	dd {
		margin: 0;
	}
	.notes {
		margin-top: 0.8rem;
		white-space: pre-wrap;
	}
	.files {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}
	.file-head {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.file img {
		max-width: 100%;
		border-radius: var(--radius);
	}
	.file iframe {
		width: 100%;
		height: 70vh;
		border: none;
		border-radius: var(--radius);
	}
	@media (max-width: 720px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
