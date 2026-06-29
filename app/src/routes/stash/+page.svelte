<script lang="ts">
	import { enhance } from '$app/forms';
	import { YARN_WEIGHTS, TOOL_TYPES, TOOL_TYPE_LABELS } from '$lib/labels';
	let { data } = $props();

	type Tab = 'yarn' | 'fabric' | 'notion' | 'tool';
	let tab = $state<Tab>('yarn');
	let adding = $state(false);

	const tabs: { id: Tab; label: string; count: number }[] = $derived([
		{ id: 'yarn', label: '🧶 Laine', count: data.yarnList.length },
		{ id: 'fabric', label: '🧵 Tissu', count: data.fabricList.length },
		{ id: 'notion', label: '🔘 Mercerie', count: data.notionList.length },
		{ id: 'tool', label: '🪡 Outils', count: data.toolList.length }
	]);

	const refresh = () => {
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: true });
			adding = false;
		};
	};

	// Scan d'étiquette : envoie la photo au service vision, pré-remplit le formulaire.
	let scanBusy = $state(false);
	let scanMsg = $state('');
	async function scanLabel(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		scanBusy = true;
		scanMsg = '';
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/ai/scan-label', { method: 'POST', body: fd });
			const data = await res.json();
			if (!res.ok) {
				scanMsg = data.error ?? 'Scan indisponible';
			} else {
				const f = data.fields ?? {};
				const set = (id: string, v: unknown) => {
					if (v == null) return;
					const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
					if (el) el.value = String(v);
				};
				set('fi', f.fiber);
				set('yp', f.yardsPerSkein);
				set('wc', f.weightCategory);
				scanMsg = 'Champs pré-remplis ✓ (vérifie puis ajoute)';
			}
		} catch {
			scanMsg = 'Erreur réseau';
		}
		scanBusy = false;
	}
</script>

<div class="container">
	<h1>Mon stock</h1>

	<div class="tabs">
		{#each tabs as t}
			<button class="tab" class:active={tab === t.id} onclick={() => (tab = t.id)}>
				{t.label} <span class="count">{t.count}</span>
			</button>
		{/each}
		<div class="spacer"></div>
		<button class="btn-primary" onclick={() => (adding = !adding)}>
			{adding ? 'Fermer' : '+ Ajouter'}
		</button>
	</div>

	{#if adding}
		<div class="card add">
			{#if tab === 'yarn'}
				<div class="scan">
					<label class="scan-btn">
						📷 Scanner l'étiquette
						<input type="file" accept="image/*" capture="environment" onchange={scanLabel} hidden />
					</label>
					{#if scanBusy}<span class="muted small">Analyse…</span>{/if}
					{#if scanMsg}<span class="muted small">{scanMsg}</span>{/if}
				</div>
				<form method="POST" action="?/addYarn" enctype="multipart/form-data" use:enhance={refresh}>
					<div class="row3">
						<div class="field"><label for="b">Marque</label><input id="b" name="brand" /></div>
						<div class="field"><label for="n">Nom</label><input id="n" name="name" /></div>
						<div class="field"><label for="cw">Coloris</label><input id="cw" name="colorway" /></div>
					</div>
					<div class="row3">
						<div class="field"><label for="ch">Couleur</label><input id="ch" name="colorHex" type="color" value="#cccccc" /></div>
						<div class="field"><label for="dl">Bain (dye lot)</label><input id="dl" name="dyeLot" /></div>
						<div class="field">
							<label for="wc">Épaisseur</label>
							<select id="wc" name="weightCategory">
								<option value="">—</option>
								{#each YARN_WEIGHTS as w}<option value={w}>{w}</option>{/each}
							</select>
						</div>
					</div>
					<div class="row3">
						<div class="field"><label for="fi">Fibre</label><input id="fi" name="fiber" placeholder="100% mérinos" /></div>
						<div class="field"><label for="yp">Métrage / pelote (m)</label><input id="yp" name="yardsPerSkein" type="number" /></div>
						<div class="field"><label for="sk">Pelotes</label><input id="sk" name="skeins" type="number" step="0.5" value="1" /></div>
					</div>
					<div class="field"><label for="ph">Photo</label><input id="ph" name="photo" type="file" accept="image/*" /></div>
					<button class="btn-primary" type="submit">Ajouter la laine</button>
				</form>
			{:else if tab === 'fabric'}
				<form method="POST" action="?/addFabric" use:enhance={refresh}>
					<div class="row3">
						<div class="field"><label for="fn">Nom</label><input id="fn" name="name" /></div>
						<div class="field"><label for="ft">Type</label><input id="ft" name="fabricType" placeholder="jersey, lin…" /></div>
						<div class="field"><label for="fc">Couleur</label><input id="fc" name="colorHex" type="color" value="#cccccc" /></div>
					</div>
					<div class="row3">
						<div class="field"><label for="fcomp">Composition</label><input id="fcomp" name="composition" /></div>
						<div class="field"><label for="fl">Longueur (cm)</label><input id="fl" name="lengthCm" type="number" /></div>
						<div class="field"><label for="fw">Laize (cm)</label><input id="fw" name="widthCm" type="number" /></div>
					</div>
					<button class="btn-primary" type="submit">Ajouter le tissu</button>
				</form>
			{:else if tab === 'notion'}
				<form method="POST" action="?/addNotion" use:enhance={refresh}>
					<div class="row3">
						<div class="field"><label for="nn">Nom *</label><input id="nn" name="name" required /></div>
						<div class="field"><label for="nc">Catégorie</label><input id="nc" name="category" placeholder="bouton, fermeture…" /></div>
						<div class="field"><label for="nq">Quantité</label><input id="nq" name="quantity" type="number" value="1" /></div>
					</div>
					<button class="btn-primary" type="submit">Ajouter</button>
				</form>
			{:else}
				<form method="POST" action="?/addTool" use:enhance={refresh}>
					<div class="row3">
						<div class="field">
							<label for="tt">Type *</label>
							<select id="tt" name="type" required>
								{#each TOOL_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
							</select>
						</div>
						<div class="field"><label for="ts">Taille (mm)</label><input id="ts" name="sizeMm" type="number" step="0.25" /></div>
						<div class="field"><label for="tl">Câble (cm)</label><input id="tl" name="lengthCm" type="number" /></div>
					</div>
					<div class="field"><label for="tq">Quantité</label><input id="tq" name="quantity" type="number" value="1" /></div>
					<button class="btn-primary" type="submit">Ajouter l'outil</button>
				</form>
			{/if}
		</div>
	{/if}

	{#if tab === 'yarn'}
		<div class="grid">
			{#each data.yarnList as y}
				<div class="card stash-item">
					{#if y.photoPath}<img src={`/media/${y.photoPath}`} alt={y.name ?? 'laine'} />{:else}
						<div class="swatch" style={`background:${y.colorHex ?? '#eee'}`}></div>{/if}
					<strong>{[y.brand, y.name].filter(Boolean).join(' ') || y.colorway || 'Laine'}</strong>
					<span class="muted small">{[y.colorway, y.weightCategory].filter(Boolean).join(' · ')}</span>
					<span class="muted small">{y.fiber ?? ''}</span>
					<span class="small">{y.skeins} pelote{y.skeins > 1 ? 's' : ''}{y.dyeLot ? ` · bain ${y.dyeLot}` : ''}</span>
					<form method="POST" action="?/delete" use:enhance={refresh}>
						<input type="hidden" name="kind" value="yarn" /><input type="hidden" name="id" value={y.id} />
						<button class="del" type="submit">Supprimer</button>
					</form>
				</div>
			{/each}
		</div>
	{:else if tab === 'fabric'}
		<div class="grid">
			{#each data.fabricList as f}
				<div class="card stash-item">
					<div class="swatch" style={`background:${f.colorHex ?? '#eee'}`}></div>
					<strong>{f.name ?? f.fabricType ?? 'Tissu'}</strong>
					<span class="muted small">{f.composition ?? ''}</span>
					<span class="small">{[f.lengthCm && `${f.lengthCm} cm`, f.widthCm && `laize ${f.widthCm}`].filter(Boolean).join(' · ')}</span>
					<form method="POST" action="?/delete" use:enhance={refresh}>
						<input type="hidden" name="kind" value="fabric" /><input type="hidden" name="id" value={f.id} />
						<button class="del" type="submit">Supprimer</button>
					</form>
				</div>
			{/each}
		</div>
	{:else if tab === 'notion'}
		<div class="grid">
			{#each data.notionList as n}
				<div class="card stash-item">
					<strong>{n.name}</strong>
					<span class="muted small">{n.category ?? ''}</span>
					<span class="small">Qté : {n.quantity}</span>
					<form method="POST" action="?/delete" use:enhance={refresh}>
						<input type="hidden" name="kind" value="notion" /><input type="hidden" name="id" value={n.id} />
						<button class="del" type="submit">Supprimer</button>
					</form>
				</div>
			{/each}
		</div>
	{:else}
		<div class="grid">
			{#each data.toolList as t}
				<div class="card stash-item">
					<strong>{TOOL_TYPE_LABELS[t.type]}</strong>
					<span class="small">{[t.sizeMm && `${t.sizeMm} mm`, t.lengthCm && `${t.lengthCm} cm`].filter(Boolean).join(' · ')}</span>
					<span class="muted small">Qté : {t.quantity}{t.inUseProjectId ? ' · en cours' : ''}</span>
					<form method="POST" action="?/delete" use:enhance={refresh}>
						<input type="hidden" name="kind" value="tool" /><input type="hidden" name="id" value={t.id} />
						<button class="del" type="submit">Supprimer</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tabs {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 1rem 0;
		flex-wrap: wrap;
	}
	.tab {
		border: 1px solid var(--border);
	}
	.tab.active {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	.count {
		opacity: 0.7;
		font-size: 0.8rem;
	}
	.spacer {
		flex: 1;
	}
	.add {
		margin-bottom: 1.2rem;
	}
	.scan {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.8rem;
	}
	.scan-btn {
		display: inline-block;
		width: auto;
		margin: 0;
		cursor: pointer;
		background: var(--accent-soft);
		color: var(--accent);
		padding: 0.5rem 0.9rem;
		border-radius: var(--radius);
		font-size: 0.95rem;
	}
	.row3 {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.7rem;
	}
	.stash-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.stash-item img,
	.swatch {
		width: 100%;
		height: 120px;
		object-fit: cover;
		border-radius: var(--radius);
		margin-bottom: 0.3rem;
	}
	.small {
		font-size: 0.82rem;
	}
	.del {
		margin-top: 0.4rem;
		font-size: 0.8rem;
		padding: 0.3rem 0.5rem;
		color: var(--danger);
		align-self: flex-start;
	}
	@media (max-width: 560px) {
		.row3 {
			grid-template-columns: 1fr;
		}
	}
</style>
