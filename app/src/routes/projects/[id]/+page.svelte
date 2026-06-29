<script lang="ts">
	import { enhance } from '$app/forms';
	import { STATUS_LABELS, STATUS_ORDER } from '$lib/labels';
	let { data } = $props();
	const p = $derived(data.project);

	const savings = $derived(
		p.retailPriceCents != null ? (p.retailPriceCents - p.costCents) / 100 : null
	);

	function fmtHours(h: number | null): string {
		if (h == null) return '—';
		if (h < 1) return `${Math.round(h * 60)} min`;
		return `${h.toFixed(1)} h`;
	}

	// Commande vocale mains-libres : enregistre ~3 s, transcrit, +1 si mot-clé reconnu.
	let listening = $state(false);
	let voiceMsg = $state('');
	let incForm = $state<HTMLFormElement | null>(null);

	async function voiceCount() {
		voiceMsg = '';
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			voiceMsg = 'Micro refusé';
			return;
		}
		const rec = new MediaRecorder(stream);
		const chunks: Blob[] = [];
		rec.ondataavailable = (e) => chunks.push(e.data);
		rec.onstop = async () => {
			stream.getTracks().forEach((t) => t.stop());
			const blob = new Blob(chunks, { type: 'audio/webm' });
			const fd = new FormData();
			fd.append('file', blob, 'cmd.webm');
			try {
				const res = await fetch('/api/ai/transcribe', { method: 'POST', body: fd });
				const data = await res.json();
				if (!res.ok) {
					voiceMsg = data.error ?? 'Transcription indisponible';
					return;
				}
				const t = (data.text ?? '').toLowerCase();
				voiceMsg = t ? `« ${t} »` : 'rien entendu';
				if (/suivant|plus un|rang|incr|\bun\b|\+/.test(t)) incForm?.requestSubmit();
			} catch {
				voiceMsg = 'Erreur réseau';
			}
		};
		listening = true;
		rec.start();
		setTimeout(() => {
			rec.stop();
			listening = false;
		}, 3000);
	}
</script>

<div class="container">
	<a href="/projects/board" class="muted">← Projets</a>

	<header class="head">
		<h1>{p.title}</h1>
		<form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm('Supprimer ce projet ?')) e.preventDefault(); }}>
			<button type="submit">🗑 Supprimer</button>
		</form>
	</header>

	{#if data.pattern}
		<p class="muted">Patron : <a href={`/patterns/${data.pattern.id}`}>{data.pattern.title}</a></p>
	{/if}

	<div class="cols">
		<!-- Compteur de rangs -->
		<section class="card counter">
			<h2>Compteur de rangs</h2>
			<div class="count-display">{p.currentRow}{p.totalRows ? ` / ${p.totalRows}` : ''}</div>
			<div class="bar"><div class="fill" style={`width:${p.progressPct}%`}></div></div>
			<div class="count-btns">
				<form method="POST" action="?/row" use:enhance>
					<input type="hidden" name="delta" value="-1" />
					<button type="submit" class="big">−</button>
				</form>
				<form method="POST" action="?/row" use:enhance bind:this={incForm}>
					<input type="hidden" name="delta" value="1" />
					<button type="submit" class="big btn-primary">+ Rang</button>
				</form>
			</div>
			<button class="voice" class:on={listening} onclick={voiceCount} disabled={listening}>
				{listening ? '🎙 …écoute' : '🎙 Compter à la voix'}
			</button>
			{#if voiceMsg}<div class="muted small">{voiceMsg}</div>{/if}
			<span class="muted small">{p.progressPct}% terminé</span>
		</section>

		<!-- Prédiction deadline -->
		<section class="card">
			<h2>Rythme & prédiction</h2>
			<dl>
				<dt>Vitesse</dt><dd>{data.rowsPerHour ? `${data.rowsPerHour.toFixed(1)} rangs/h` : 'pas encore de données'}</dd>
				<dt>Rangs restants</dt><dd>{data.remaining ?? '—'}</dd>
				<dt>Temps estimé restant</dt><dd>{fmtHours(data.hoursLeft)}</dd>
				<dt>Temps passé</dt><dd>{Math.floor(p.timeSpentMinutes / 60)} h {p.timeSpentMinutes % 60} min</dd>
				{#if p.deadline}<dt>Échéance</dt><dd>{p.deadline}</dd>{/if}
			</dl>
			<form method="POST" action="?/logPace" use:enhance={() => async ({ update }) => update({ reset: true })} class="pace">
				<input name="rowsDone" type="number" placeholder="rangs faits" min="1" required />
				<input name="minutes" type="number" placeholder="minutes" min="1" required />
				<button type="submit">Enregistrer une session</button>
			</form>
		</section>

		<!-- Détails / édition -->
		<section class="card detail">
			<h2>Détails</h2>
			<form method="POST" action="?/update" use:enhance>
				<div class="two">
					<div class="field">
						<label for="status">Colonne</label>
						<select id="status" name="status">
							{#each STATUS_ORDER as s}<option value={s} selected={p.status === s}>{STATUS_LABELS[s]}</option>{/each}
						</select>
					</div>
					<div class="field">
						<label for="progressPct">Avancement (%)</label>
						<input id="progressPct" name="progressPct" type="number" min="0" max="100" value={p.progressPct} />
					</div>
				</div>
				<div class="two">
					<div class="field">
						<label for="totalRows">Rangs total</label>
						<input id="totalRows" name="totalRows" type="number" min="0" value={p.totalRows ?? ''} />
					</div>
					<div class="field">
						<label for="deadline">Échéance</label>
						<input id="deadline" name="deadline" type="date" value={p.deadline ?? ''} />
					</div>
				</div>
				<div class="two">
					<div class="field">
						<label for="cost">Coût matières (€)</label>
						<input id="cost" name="cost" type="number" step="0.01" value={(p.costCents / 100).toFixed(2)} />
					</div>
					<div class="field">
						<label for="retail">Prix prêt-à-porter équiv. (€)</label>
						<input id="retail" name="retail" type="number" step="0.01" value={p.retailPriceCents != null ? (p.retailPriceCents / 100).toFixed(2) : ''} />
					</div>
				</div>
				{#if savings != null}
					<p class="savings">💰 Économie estimée : <strong>{savings.toFixed(2)} €</strong></p>
				{/if}
				<div class="field">
					<label for="location">Emplacement (où est rangé le WIP)</label>
					<input id="location" name="location" value={p.location ?? ''} />
				</div>
				<div class="field">
					<label for="notes">Notes</label>
					<textarea id="notes" name="notes" rows="3">{p.notes ?? ''}</textarea>
				</div>
				<input type="hidden" name="timeSpentMinutes" value={p.timeSpentMinutes} />
				<button class="btn-primary" type="submit">Enregistrer</button>
			</form>
		</section>
	</div>
</div>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.2rem;
		margin-top: 1rem;
	}
	.detail {
		grid-column: 1 / -1;
	}
	.counter {
		text-align: center;
	}
	.count-display {
		font-size: 3rem;
		font-weight: 700;
		color: var(--accent);
		margin: 0.4rem 0;
	}
	.count-btns {
		display: flex;
		gap: 0.6rem;
		justify-content: center;
		margin: 0.6rem 0;
	}
	.big {
		font-size: 1.3rem;
		padding: 0.6rem 1.4rem;
	}
	.voice {
		margin: 0.4rem auto;
		display: block;
	}
	.voice.on {
		background: var(--danger);
		color: #fff;
		border-color: var(--danger);
	}
	.bar {
		height: 8px;
		background: var(--accent-soft);
		border-radius: 999px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--accent);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3rem 0.8rem;
	}
	dt {
		color: var(--muted);
		font-size: 0.85rem;
	}
	dd {
		margin: 0;
	}
	.pace {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.8rem;
		flex-wrap: wrap;
	}
	.pace input {
		width: auto;
		flex: 1;
		min-width: 100px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
	}
	.savings {
		background: #e7f4ec;
		color: var(--ok);
		padding: 0.5rem 0.7rem;
		border-radius: var(--radius);
	}
	.small {
		font-size: 0.82rem;
	}
	@media (max-width: 720px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
