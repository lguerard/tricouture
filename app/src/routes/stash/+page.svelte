<script lang="ts">
	import { enhance } from '$app/forms';
	import { YARN_WEIGHTS, toolTypeOptions, toolTypeLabel } from '$lib/labels';
	import { isCapacitor, scanBarcode } from '$lib/capacitor';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);

	type Tab = 'yarn' | 'fabric' | 'notion' | 'tool';
	let tab = $state<Tab>('yarn');
	let adding = $state(false);

	const tabs: { id: Tab; icon: string; key: string; count: number }[] = $derived([
		{ id: 'yarn', icon: '🧶', key: 'stash.tab.yarn', count: data.yarnList.length },
		{ id: 'fabric', icon: '🧵', key: 'stash.tab.fabric', count: data.fabricList.length },
		{ id: 'notion', icon: '🔘', key: 'stash.tab.notion', count: data.notionList.length },
		{ id: 'tool', icon: '🪡', key: 'stash.tab.tool', count: data.toolList.length }
	]);

	const refresh = () => {
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: true });
			adding = false;
		};
	};

	// SD colorway preview
	let previewYarnId = $state<string | null>(null);
	let previewBusy = $state(false);
	let previewSrc = $state<string | null>(null);
	let previewError = $state('');

	async function generatePreview(yarnId: string, colorHex: string, label: string) {
		previewYarnId = yarnId;
		previewBusy = true;
		previewSrc = null;
		previewError = '';
		try {
			const res = await fetch('/api/ai/preview-colorway', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ prompt: `pelote de laine ${label}, texturée`, colorHex })
			});
			const d = await res.json();
			if (!res.ok) {
				previewError = d.message ?? t(locale, 'stash.previewUnavailable');
			} else {
				previewSrc = `data:image/png;base64,${d.image_base64}`;
			}
		} catch {
			previewError = t(locale, 'stash.networkError');
		}
		previewBusy = false;
	}

	// Barcode scan via Capacitor (native Android).
	let barcodeBusy = $state(false);
	async function scanBarcodeNative() {
		barcodeBusy = true;
		const code = await scanBarcode();
		barcodeBusy = false;
		if (!code) return;
		// Pre-fills the "notes" field with the scanned code for manual reference.
		// TODO: wire up a lookup API (Open Food Facts, Ravelry…).
		const el = document.getElementById('yarn-notes') as HTMLInputElement | null;
		if (el) el.value = code;
		scanMsg = t(locale, 'stash.codeScanned', { code });
	}

	// Label scan: sends the photo to the vision service, pre-fills the form.
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
				scanMsg = data.error ?? t(locale, 'stash.scanUnavailable');
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
				scanMsg = t(locale, 'stash.fieldsPrefilled');
			}
		} catch {
			scanMsg = t(locale, 'stash.networkError');
		}
		scanBusy = false;
	}
</script>

<div class="container">
	<h1>{t(locale, 'stash.title')}</h1>

	<div class="tabs">
		{#each tabs as tb}
			<button class="tab" class:active={tab === tb.id} onclick={() => (tab = tb.id)}>
				{tb.icon} {t(locale, tb.key)} <span class="count">{tb.count}</span>
			</button>
		{/each}
		<div class="spacer"></div>
		<button class="btn-primary" onclick={() => (adding = !adding)}>
			{adding ? t(locale, 'stash.close') : t(locale, 'stash.addItem')}
		</button>
	</div>

	{#if adding}
		<div class="card add">
			{#if tab === 'yarn'}
				<div class="scan">
					{#if isCapacitor()}
						<button type="button" class="scan-btn" onclick={scanBarcodeNative} disabled={barcodeBusy}>
							{barcodeBusy ? t(locale, 'stash.scanning') : `📦 ${t(locale, 'stash.scanBarcode')}`}
						</button>
					{/if}
					<label class="scan-btn">
						📷 {t(locale, 'stash.scanLabel')}
						<input type="file" accept="image/*" capture="environment" onchange={scanLabel} hidden />
					</label>
					{#if scanBusy}<span class="muted small">{t(locale, 'stash.analyzing')}</span>{/if}
					{#if scanMsg}<span class="muted small">{scanMsg}</span>{/if}
				</div>
				<form method="POST" action="?/addYarn" enctype="multipart/form-data" use:enhance={refresh}>
					<div class="row3">
						<div class="field"><label for="b">{t(locale, 'stash.yarn.brand')}</label><input id="b" name="brand" /></div>
						<div class="field"><label for="n">{t(locale, 'stash.yarn.name')}</label><input id="n" name="name" /></div>
						<div class="field"><label for="cw">{t(locale, 'stash.yarn.colorway')}</label><input id="cw" name="colorway" /></div>
					</div>
					<div class="row3">
						<div class="field"><label for="ch">{t(locale, 'stash.yarn.color')}</label><input id="ch" name="colorHex" type="color" value="#cccccc" /></div>
						<div class="field"><label for="dl">{t(locale, 'stash.yarn.dyeLot')}</label><input id="dl" name="dyeLot" /></div>
						<div class="field">
							<label for="wc">{t(locale, 'stash.yarn.weight')}</label>
							<select id="wc" name="weightCategory">
								<option value="">{t(locale, 'stash.optionNone')}</option>
								{#each YARN_WEIGHTS as w}<option value={w}>{w}</option>{/each}
							</select>
						</div>
					</div>
					<div class="row3">
						<div class="field"><label for="fi">{t(locale, 'stash.yarn.fiber')}</label><input id="fi" name="fiber" placeholder={t(locale, 'stash.yarn.fiberPlaceholder')} /></div>
						<div class="field"><label for="yp">{t(locale, 'stash.yarn.yardsPerSkein')}</label><input id="yp" name="yardsPerSkein" type="number" /></div>
						<div class="field"><label for="sk">{t(locale, 'stash.yarn.skeins')}</label><input id="sk" name="skeins" type="number" step="0.5" value="1" /></div>
					</div>
					<div class="field"><label for="ph">{t(locale, 'stash.yarn.photo')}</label><input id="ph" name="photo" type="file" accept="image/*" /></div>
					<div class="field"><label for="yarn-notes">{t(locale, 'stash.yarn.notes')}</label><input id="yarn-notes" name="notes" /></div>
					<button class="btn-primary" type="submit">{t(locale, 'stash.yarn.submit')}</button>
				</form>
			{:else if tab === 'fabric'}
				<form method="POST" action="?/addFabric" use:enhance={refresh}>
					<div class="row3">
						<div class="field"><label for="fn">{t(locale, 'stash.fabric.name')}</label><input id="fn" name="name" /></div>
						<div class="field"><label for="ft">{t(locale, 'stash.fabric.type')}</label><input id="ft" name="fabricType" placeholder={t(locale, 'stash.fabric.typePlaceholder')} /></div>
						<div class="field"><label for="fc">{t(locale, 'stash.fabric.color')}</label><input id="fc" name="colorHex" type="color" value="#cccccc" /></div>
					</div>
					<div class="row3">
						<div class="field"><label for="fcomp">{t(locale, 'stash.fabric.composition')}</label><input id="fcomp" name="composition" /></div>
						<div class="field"><label for="fl">{t(locale, 'stash.fabric.length')}</label><input id="fl" name="lengthCm" type="number" /></div>
						<div class="field"><label for="fw">{t(locale, 'stash.fabric.width')}</label><input id="fw" name="widthCm" type="number" /></div>
					</div>
					<button class="btn-primary" type="submit">{t(locale, 'stash.fabric.submit')}</button>
				</form>
			{:else if tab === 'notion'}
				<form method="POST" action="?/addNotion" use:enhance={refresh}>
					<div class="row3">
						<div class="field"><label for="nn">{t(locale, 'stash.notion.name')}</label><input id="nn" name="name" required /></div>
						<div class="field"><label for="nc">{t(locale, 'stash.notion.category')}</label><input id="nc" name="category" placeholder={t(locale, 'stash.notion.categoryPlaceholder')} /></div>
						<div class="field"><label for="nq">{t(locale, 'stash.notion.quantity')}</label><input id="nq" name="quantity" type="number" value="1" /></div>
					</div>
					<button class="btn-primary" type="submit">{t(locale, 'stash.notion.submit')}</button>
				</form>
			{:else}
				<form method="POST" action="?/addTool" use:enhance={refresh}>
					<div class="row3">
						<div class="field">
							<label for="tt">{t(locale, 'stash.tool.type')}</label>
							<select id="tt" name="type" required>
								{#each toolTypeOptions(locale) as opt}<option value={opt.value}>{opt.label}</option>{/each}
							</select>
						</div>
						<div class="field"><label for="ts">{t(locale, 'stash.tool.size')}</label><input id="ts" name="sizeMm" type="number" step="0.25" /></div>
						<div class="field"><label for="tl">{t(locale, 'stash.tool.cable')}</label><input id="tl" name="lengthCm" type="number" /></div>
					</div>
					<div class="field"><label for="tq">{t(locale, 'stash.tool.quantity')}</label><input id="tq" name="quantity" type="number" value="1" /></div>
					<button class="btn-primary" type="submit">{t(locale, 'stash.tool.submit')}</button>
				</form>
			{/if}
		</div>
	{/if}

	{#if tab === 'yarn'}
		<div class="grid">
			{#each data.yarnList as y}
				<div class="card stash-item">
					{#if previewYarnId === y.id && previewSrc}
						<img src={previewSrc} alt={t(locale, 'stash.yarn.previewAlt')} class="preview-img" />
					{:else if y.photoPath}
						<img src={`/media/${y.photoPath}`} alt={y.name ?? t(locale, 'stash.yarn.altFallback')} />
					{:else}
						<div class="swatch" style={`background:${y.colorHex ?? '#eee'}`}></div>
					{/if}
					<strong>{[y.brand, y.name].filter(Boolean).join(' ') || y.colorway || t(locale, 'stash.yarn.fallbackName')}</strong>
					<span class="muted small">{[y.colorway, y.weightCategory].filter(Boolean).join(' · ')}</span>
					<span class="muted small">{y.fiber ?? ''}</span>
					<span class="small">{y.skeins} {y.skeins > 1 ? t(locale, 'stash.yarn.skeinPlural') : t(locale, 'stash.yarn.skein')}{y.dyeLot ? ` · ${t(locale, 'stash.yarn.dyeLotPrefix')} ${y.dyeLot}` : ''}</span>
					{#if previewYarnId === y.id && previewError}
						<span class="muted small">{previewError}</span>
					{/if}
					<div class="card-actions">
						<button
							type="button"
							class="btn-ghost small"
							disabled={previewBusy && previewYarnId === y.id}
							onclick={() => generatePreview(y.id, y.colorHex ?? '#888', [y.brand, y.name, y.colorway].filter(Boolean).join(' '))}
						>
							{previewBusy && previewYarnId === y.id ? `⏳ ${t(locale, 'stash.yarn.generating')}` : `🎨 ${t(locale, 'stash.yarn.previewBtn')}`}
						</button>
						<form method="POST" action="?/delete" use:enhance={refresh}>
							<input type="hidden" name="kind" value="yarn" /><input type="hidden" name="id" value={y.id} />
							<button class="del" type="submit">{t(locale, 'stash.delete')}</button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{:else if tab === 'fabric'}
		<div class="grid">
			{#each data.fabricList as f}
				<div class="card stash-item">
					<div class="swatch" style={`background:${f.colorHex ?? '#eee'}`}></div>
					<strong>{f.name ?? f.fabricType ?? t(locale, 'stash.fabric.fallbackName')}</strong>
					<span class="muted small">{f.composition ?? ''}</span>
					<span class="small">{[f.lengthCm && `${f.lengthCm} cm`, f.widthCm && `${t(locale, 'stash.fabric.widthPrefix')} ${f.widthCm}`].filter(Boolean).join(' · ')}</span>
					<form method="POST" action="?/delete" use:enhance={refresh}>
						<input type="hidden" name="kind" value="fabric" /><input type="hidden" name="id" value={f.id} />
						<button class="del" type="submit">{t(locale, 'stash.delete')}</button>
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
					<span class="small">{t(locale, 'stash.qtyPrefix')} {n.quantity}</span>
					<form method="POST" action="?/delete" use:enhance={refresh}>
						<input type="hidden" name="kind" value="notion" /><input type="hidden" name="id" value={n.id} />
						<button class="del" type="submit">{t(locale, 'stash.delete')}</button>
					</form>
				</div>
			{/each}
		</div>
	{:else}
		<div class="grid">
			{#each data.toolList as tl}
				<div class="card stash-item">
					<strong>{toolTypeLabel(locale, tl.type)}</strong>
					<span class="small">{[tl.sizeMm && `${tl.sizeMm} mm`, tl.lengthCm && `${tl.lengthCm} cm`].filter(Boolean).join(' · ')}</span>
					<span class="muted small">{t(locale, 'stash.qtyPrefix')} {tl.quantity}{tl.inUseProjectId ? ` · ${t(locale, 'stash.inUse')}` : ''}</span>
					<form method="POST" action="?/delete" use:enhance={refresh}>
						<input type="hidden" name="kind" value="tool" /><input type="hidden" name="id" value={tl.id} />
						<button class="del" type="submit">{t(locale, 'stash.delete')}</button>
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
	.card-actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}
	.btn-ghost {
		background: transparent;
		border: 1px solid var(--border);
		cursor: pointer;
		border-radius: var(--radius);
	}
	.btn-ghost.small {
		font-size: 0.82rem;
		padding: 0.3rem 0.6rem;
	}
	.preview-img {
		width: 100%;
		height: 120px;
		object-fit: cover;
		border-radius: var(--radius);
		margin-bottom: 0.3rem;
		border: 2px solid var(--accent);
	}
	@media (max-width: 560px) {
		.row3 {
			grid-template-columns: 1fr;
		}
	}
</style>
