<script lang="ts">
	import { enhance } from '$app/forms';
	import { YARN_WEIGHTS, MOTIF_VALUES, motifLabel, COLOR_NAMES, toolTypeOptions, toolTypeLabel } from '$lib/labels';
	import { isCapacitor, scanBarcode } from '$lib/capacitor';
	import { t } from '$lib/i18n';
	let { data, form } = $props();
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

	// Ne referme le panneau QUE si l'ajout a reussi. Avant, un fail() du serveur
	// (nom manquant, type d'outil invalide, photo dans un format inaffichable)
	// fermait quand meme le formulaire en effacant la saisie : l'echec etait
	// rigoureusement indistinguable d'un ajout reussi.
	const refresh = () => {
		return async ({
			update,
			result
		}: {
			update: (opts?: { reset?: boolean }) => Promise<void>;
			result: { type: string };
		}) => {
			const ok = result.type === 'success';
			await update({ reset: ok });
			if (!ok) return;
			adding = false;
			fetchedPhoto = null;
			scanMsg = '';
			importUrl = '';
			showUrlImport = false;
		};
	};

	// Codes renvoyes par les actions du serveur -> message traduit.
	const ADD_ERRORS: Record<string, string> = {
		photoFormat: 'stash.errPhotoFormat',
		notionName: 'stash.errNotionName',
		toolType: 'stash.errToolType'
	};
	const addError = $derived(
		form?.error ? t(locale, ADD_ERRORS[form.error as string] ?? 'stash.errGeneric') : ''
	);

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

	// Fields pre-fill: shared by label OCR, barcode lookup, and URL import — across all 4 tabs.
	// Maps a generic field key (as returned by the lookup APIs) to the DOM id in each tab's form.
	const FIELD_IDS: Record<Tab, Record<string, string>> = {
		yarn: { brand: 'b', name: 'n', colorway: 'cw', colorHex: 'ch', fiber: 'fi', motif: 'mo', yardsPerSkein: 'yp', weightCategory: 'wc' },
		fabric: { name: 'fn', fabricType: 'ft', composition: 'fcomp', colorHex: 'fc', motif: 'fmo', widthCm: 'fw' },
		notion: { name: 'nn', category: 'nc' },
		tool: { type: 'tt', sizeMm: 'ts', lengthCm: 'tl' }
	};
	// Color/motif fields only exist on yarn and fabric.
	const COLOR_MOTIF_IDS: Record<string, { color: string; motif: string }> = {
		yarn: { color: 'ch', motif: 'mo' },
		fabric: { color: 'fc', motif: 'fmo' }
	};

	let scanMsg = $state('');
	let fetchedPhoto = $state<string | null>(null);
	function applyFields(f: Record<string, unknown>) {
		const set = (id: string, v: unknown) => {
			if (v == null || v === '') return;
			const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
			if (el) el.value = String(v);
		};
		for (const [key, id] of Object.entries(FIELD_IDS[tab])) set(id, f[key]);
	}

	// Photo analysis: guesses colorHex (dominant color) + motif (zero-shot CLIP, if the
	// vision service has it installed) from an actual photo of the item. Only fills fields
	// that are still empty/default so it never overwrites an explicit choice or a value
	// already guessed from product page text.
	let analyzing = $state(false);
	async function analyzePhoto(file: Blob) {
		const ids = COLOR_MOTIF_IDS[tab];
		if (!ids) return;
		const colorEl = document.getElementById(ids.color) as HTMLInputElement | null;
		const motifEl = document.getElementById(ids.motif) as HTMLSelectElement | null;
		const needsColor = !!colorEl && (!colorEl.value || colorEl.value.toLowerCase() === '#cccccc');
		const needsMotif = !!motifEl && !motifEl.value;
		if (!needsColor && !needsMotif) return;
		analyzing = true;
		try {
			const fd = new FormData();
			fd.append('file', file, 'photo.jpg');
			const res = await fetch('/api/ai/analyze-photo', { method: 'POST', body: fd });
			if (res.ok) {
				const d = await res.json();
				if (needsColor && d.colorHex && colorEl) colorEl.value = d.colorHex;
				if (needsMotif && d.motif && motifEl) motifEl.value = d.motif;
				if (d.colorHex || d.motif) scanMsg = t(locale, 'stash.fieldsPrefilled');
			}
		} catch {
			// vision service unavailable — leave fields as-is
		}
		analyzing = false;
	}
	async function analyzeDataUrl(dataUrl: string) {
		try {
			const blob = await (await fetch(dataUrl)).blob();
			await analyzePhoto(blob);
		} catch {
			// ignore
		}
	}

	// Barcode scan via Capacitor (native Android), then a UPC lookup for brand/fiber/photo.
	let barcodeBusy = $state(false);
	async function scanBarcodeNative() {
		barcodeBusy = true;
		scanMsg = '';
		fetchedPhoto = null;
		// Hors application Android, scanBarcode() renvoie null tout de suite (ML Kit
		// n'existe que derrière Capacitor). Sortir sans rien dire donnait un bouton
		// qui semble cassé : on explique au lieu de se taire.
		if (!isCapacitor()) {
			scanMsg = t(locale, 'stash.barcodeAppOnly');
			barcodeBusy = false;
			return;
		}
		const code = await scanBarcode();
		if (!code) {
			scanMsg = t(locale, 'stash.barcodeNoCode');
			barcodeBusy = false;
			return;
		}
		// Yarn keeps the raw code in "notes" for manual reference (other tabs have no notes field).
		if (tab === 'yarn') {
			const el = document.getElementById('yarn-notes') as HTMLInputElement | null;
			if (el) el.value = code;
		}
		try {
			const res = await fetch('/api/ai/lookup-barcode', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code, kind: tab })
			});
			const data = await res.json();
			if (res.ok) {
				applyFields(data.fields ?? {});
				if (data.photoDataUrl) {
					fetchedPhoto = data.photoDataUrl;
					await analyzeDataUrl(data.photoDataUrl);
				}
				scanMsg = t(locale, 'stash.fieldsPrefilled');
			} else {
				scanMsg = t(locale, 'stash.codeScanned', { code });
			}
		} catch {
			scanMsg = t(locale, 'stash.codeScanned', { code });
		}
		barcodeBusy = false;
	}

	// Label scan: sends the photo to the vision service, pre-fills the form.
	// The vision service guesses yarn-shaped fields; for fabric, "fiber" reads as composition.
	let scanBusy = $state(false);
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
				const raw = data.fields ?? {};
				applyFields(tab === 'fabric' ? { name: raw.name, composition: raw.fiber } : raw);
				await analyzePhoto(file);
				scanMsg = t(locale, 'stash.fieldsPrefilled');
			}
		} catch {
			scanMsg = t(locale, 'stash.networkError');
		}
		scanBusy = false;
	}

	// Import from a shop product page URL: scrapes JSON-LD/OpenGraph, pre-fills fields + photo.
	let showUrlImport = $state(false);
	let importUrl = $state('');
	let importBusy = $state(false);
	async function importFromUrl() {
		const url = importUrl.trim();
		if (!url) return;
		importBusy = true;
		scanMsg = '';
		fetchedPhoto = null;
		try {
			const res = await fetch('/api/ai/lookup-url', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url, kind: tab })
			});
			const data = await res.json();
			if (!res.ok) {
				// Codes renvoyés par /api/ai/lookup-url ; tout le reste est un
				// message déjà lisible (URL invalide, réponse trop volumineuse…).
				const codes: Record<string, string> = {
					blocked: 'stash.importBlocked',
					nometa: 'stash.importNoMetadata'
				};
				const key = codes[data.error as string];
				scanMsg = key ? t(locale, key) : (data.error ?? t(locale, 'stash.scanUnavailable'));
			} else {
				applyFields(data.fields ?? {});
				if (data.photoDataUrl) {
					fetchedPhoto = data.photoDataUrl;
					await analyzeDataUrl(data.photoDataUrl);
				}
				scanMsg = t(locale, 'stash.fieldsPrefilled');
				showUrlImport = false;
			}
		} catch {
			scanMsg = t(locale, 'stash.networkError');
		}
		importBusy = false;
	}

	// Smart search: color name/hex, material/fiber, motif, or any plain text — client-side,
	// works instantly on the already-loaded stash without needing AI.
	let searchQuery = $state('');

	function normalize(s: string): string {
		return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
	}

	function hexDistance(a: string, b: string): number {
		const pa = parseInt(a.replace('#', ''), 16);
		const pb = parseInt(b.replace('#', ''), 16);
		const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
		const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
		const db = (pa & 255) - (pb & 255);
		return Math.sqrt(dr * dr + dg * dg + db * db);
	}

	// Matches free-text fields, or (if the query is a color name/hex) the item's colorHex.
	function matchesSearch(fields: (string | null | undefined)[], colorHex: string | null | undefined, query: string): boolean {
		if (!query) return true;
		const q = normalize(query);
		if (fields.some((f) => f && normalize(f).includes(q))) return true;
		if (!colorHex) return false;
		const target = COLOR_NAMES[q] ?? (/^#?[0-9a-f]{6}$/i.test(q) ? (q.startsWith('#') ? q : `#${q}`) : null);
		return target != null && hexDistance(target, colorHex) < 110;
	}

	const filteredYarns = $derived(
		data.yarnList.filter((y) =>
			matchesSearch([y.brand, y.name, y.colorway, y.fiber, y.weightCategory, y.motif && motifLabel(locale, y.motif), y.dyeLot, y.notes], y.colorHex, searchQuery)
		)
	);
	const filteredFabrics = $derived(
		data.fabricList.filter((f) =>
			matchesSearch([f.name, f.fabricType, f.composition, f.motif && motifLabel(locale, f.motif)], f.colorHex, searchQuery)
		)
	);
	const filteredNotions = $derived(
		data.notionList.filter((n) => matchesSearch([n.name, n.category], null, searchQuery))
	);
	const filteredTools = $derived(
		data.toolList.filter((tl) => matchesSearch([toolTypeLabel(locale, tl.type)], null, searchQuery))
	);
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

	<input type="search" class="search-box" placeholder={t(locale, 'stash.searchPlaceholder')} bind:value={searchQuery} />

	{#if adding}
		<div class="card add">
			<div class="scan">
				{#if isCapacitor()}
					<button type="button" class="scan-btn" onclick={scanBarcodeNative} disabled={barcodeBusy}>
						{barcodeBusy ? t(locale, 'stash.scanning') : `📦 ${t(locale, 'stash.scanBarcode')}`}
					</button>
				{/if}
				{#if tab === 'yarn' || tab === 'fabric'}
					<label class="scan-btn">
						📷 {t(locale, 'stash.scanLabel')}
						<input type="file" accept="image/*" capture="environment" onchange={scanLabel} hidden />
					</label>
				{/if}
				<button type="button" class="scan-btn" onclick={() => (showUrlImport = !showUrlImport)}>
					🔗 {t(locale, 'stash.importUrl')}
				</button>
				{#if scanBusy || analyzing}<span class="muted small">{t(locale, 'stash.analyzing')}</span>{/if}
				{#if scanMsg}<span class="muted small">{scanMsg}</span>{/if}
				{#if addError}<span class="add-error">{addError}</span>{/if}
			</div>
			{#if showUrlImport}
				<div class="url-import">
					<input
						type="url"
						placeholder={t(locale, 'stash.importUrlPlaceholder')}
						bind:value={importUrl}
						onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), importFromUrl())}
					/>
					<button type="button" class="btn-primary" onclick={importFromUrl} disabled={importBusy}>
						{importBusy ? t(locale, 'stash.analyzing') : t(locale, 'stash.importUrlSubmit')}
					</button>
				</div>
			{/if}
			{#if tab === 'yarn'}
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
					<div class="row3">
						<div class="field">
							<label for="mo">{t(locale, 'stash.yarn.motif')}</label>
							<select id="mo" name="motif">
								<option value="">{t(locale, 'stash.optionNone')}</option>
								{#each MOTIF_VALUES as m}<option value={m}>{motifLabel(locale, m)}</option>{/each}
							</select>
						</div>
					</div>
					<div class="field">
						<label for="ph">{t(locale, 'stash.yarn.photo')}</label>
						<input
							id="ph"
							name="photo"
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							onchange={(e) => {
								fetchedPhoto = null;
								const f = (e.target as HTMLInputElement).files?.[0];
								if (f) analyzePhoto(f);
							}}
						/>
						{#if fetchedPhoto}
							<img src={fetchedPhoto} alt={t(locale, 'stash.yarn.previewAlt')} class="fetched-photo" />
							<input type="hidden" name="photoDataUrl" value={fetchedPhoto} />
						{/if}
					</div>
					<div class="field"><label for="yarn-notes">{t(locale, 'stash.yarn.notes')}</label><input id="yarn-notes" name="notes" /></div>
					<button class="btn-primary" type="submit">{t(locale, 'stash.yarn.submit')}</button>
				</form>
			{:else if tab === 'fabric'}
				<form method="POST" action="?/addFabric" enctype="multipart/form-data" use:enhance={refresh}>
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
					<div class="row3">
						<div class="field">
							<label for="fmo">{t(locale, 'stash.fabric.motif')}</label>
							<select id="fmo" name="motif">
								<option value="">{t(locale, 'stash.optionNone')}</option>
								{#each MOTIF_VALUES as m}<option value={m}>{motifLabel(locale, m)}</option>{/each}
							</select>
						</div>
					</div>
					<div class="field">
						<label for="fph">{t(locale, 'stash.yarn.photo')}</label>
						<input
							id="fph"
							name="photo"
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							onchange={(e) => {
								fetchedPhoto = null;
								const f = (e.target as HTMLInputElement).files?.[0];
								if (f) analyzePhoto(f);
							}}
						/>
						{#if fetchedPhoto}
							<img src={fetchedPhoto} alt={t(locale, 'stash.yarn.previewAlt')} class="fetched-photo" />
							<input type="hidden" name="photoDataUrl" value={fetchedPhoto} />
						{/if}
					</div>
					<button class="btn-primary" type="submit">{t(locale, 'stash.fabric.submit')}</button>
				</form>
			{:else if tab === 'notion'}
				<form method="POST" action="?/addNotion" enctype="multipart/form-data" use:enhance={refresh}>
					<div class="row3">
						<div class="field"><label for="nn">{t(locale, 'stash.notion.name')}</label><input id="nn" name="name" required /></div>
						<div class="field"><label for="nc">{t(locale, 'stash.notion.category')}</label><input id="nc" name="category" placeholder={t(locale, 'stash.notion.categoryPlaceholder')} /></div>
						<div class="field"><label for="nq">{t(locale, 'stash.notion.quantity')}</label><input id="nq" name="quantity" type="number" value="1" /></div>
					</div>
					<div class="field">
						<label for="nph">{t(locale, 'stash.yarn.photo')}</label>
						<input
							id="nph"
							name="photo"
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							onchange={() => (fetchedPhoto = null)}
						/>
					</div>
					{#if fetchedPhoto}
						<img src={fetchedPhoto} alt={t(locale, 'stash.yarn.previewAlt')} class="fetched-photo" />
						<input type="hidden" name="photoDataUrl" value={fetchedPhoto} />
					{/if}
					<button class="btn-primary" type="submit">{t(locale, 'stash.notion.submit')}</button>
				</form>
			{:else}
				<form method="POST" action="?/addTool" enctype="multipart/form-data" use:enhance={refresh}>
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
					<div class="field">
						<label for="tph">{t(locale, 'stash.yarn.photo')}</label>
						<input id="tph" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange={() => (fetchedPhoto = null)} />
						{#if fetchedPhoto}
							<img src={fetchedPhoto} alt={t(locale, 'stash.yarn.previewAlt')} class="fetched-photo" />
							<input type="hidden" name="photoDataUrl" value={fetchedPhoto} />
						{/if}
					</div>
					<button class="btn-primary" type="submit">{t(locale, 'stash.tool.submit')}</button>
				</form>
			{/if}
		</div>
	{/if}

	{#if tab === 'yarn'}
		{#if filteredYarns.length === 0}<p class="muted">{t(locale, 'stash.noResults')}</p>{/if}
		<div class="grid">
			{#each filteredYarns as y}
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
					<span class="muted small">{[y.fiber, y.motif && motifLabel(locale, y.motif)].filter(Boolean).join(' · ')}</span>
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
		{#if filteredFabrics.length === 0}<p class="muted">{t(locale, 'stash.noResults')}</p>{/if}
		<div class="grid">
			{#each filteredFabrics as f}
				<div class="card stash-item">
					{#if f.photoPath}
						<img src={`/media/${f.photoPath}`} alt={f.name ?? t(locale, 'stash.fabric.fallbackName')} />
					{:else}
						<div class="swatch" style={`background:${f.colorHex ?? '#eee'}`}></div>
					{/if}
					<strong>{f.name ?? f.fabricType ?? t(locale, 'stash.fabric.fallbackName')}</strong>
					<span class="muted small">{[f.composition, f.motif && motifLabel(locale, f.motif)].filter(Boolean).join(' · ')}</span>
					<span class="small">{[f.lengthCm && `${f.lengthCm} cm`, f.widthCm && `${t(locale, 'stash.fabric.widthPrefix')} ${f.widthCm}`].filter(Boolean).join(' · ')}</span>
					<form method="POST" action="?/delete" use:enhance={refresh}>
						<input type="hidden" name="kind" value="fabric" /><input type="hidden" name="id" value={f.id} />
						<button class="del" type="submit">{t(locale, 'stash.delete')}</button>
					</form>
				</div>
			{/each}
		</div>
	{:else if tab === 'notion'}
		{#if filteredNotions.length === 0}<p class="muted">{t(locale, 'stash.noResults')}</p>{/if}
		<div class="grid">
			{#each filteredNotions as n}
				<div class="card stash-item">
					{#if n.photoPath}
						<img src={`/media/${n.photoPath}`} alt={n.name} />
					{/if}
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
		{#if filteredTools.length === 0}<p class="muted">{t(locale, 'stash.noResults')}</p>{/if}
		<div class="grid">
			{#each filteredTools as tl}
				<div class="card stash-item">
					{#if tl.photoPath}
						<img src={`/media/${tl.photoPath}`} alt={toolTypeLabel(locale, tl.type)} />
					{/if}
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
	.search-box {
		width: 100%;
		margin-bottom: 1rem;
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
	.url-import {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.8rem;
	}
	.url-import input {
		flex: 1;
	}
	.fetched-photo {
		width: 100%;
		max-width: 200px;
		height: 120px;
		object-fit: cover;
		border-radius: var(--radius);
		margin-top: 0.4rem;
	}
	.add-error {
		color: #b91c1c;
		font-size: 0.85rem;
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
