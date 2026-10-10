<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { toasts } from '$lib/toast.svelte';
	import { mediaUrl } from '$lib/media';
	import { digitize, sewingMinutes, HOOP_MM, type Design, type PatchShape, type RasterImage } from '$lib/embroidery/digitize';
	import { writePes } from '$lib/embroidery/pes';
	import { PEC_THREADS, threadHex } from '$lib/embroidery/threads';
	import { canvasBlob, drawStitches, renderThumbnail } from '$lib/embroidery/render';
	import type { PageData } from './$types';

	let { data } = $props();
	type EmbroideryDesign = PageData['designs'][number];
	type EmbroiderySettings = EmbroideryDesign['settings'];
	const locale = $derived(data.locale);

	const THREADS = PEC_THREADS.filter((th) => th.name !== 'Applique');
	const threadByIndex = new Map(PEC_THREADS.map((th) => [th.index, th]));
	const DENSITY = { light: 0.5, normal: 0.4, dense: 0.33 } as const;
	const MAX_PIXELS = 600; // the picture is downscaled to this before digitizing

	let image = $state<RasterImage | null>(null);
	let imageUrl = $state<string | null>(null);
	let title = $state('');
	let sizeMm = $state(70);
	let colors = $state(4);
	let removeBackground = $state(true);
	let shape = $state<PatchShape>('circle');
	let borderThread = $state(20); // Black
	let backgroundThread = $state(0); // 0: no background fill
	let density = $state<keyof typeof DENSITY>('normal');
	let fabric = $state('#f3efe7');
	// Threads swapped by hand after digitizing: original index → chosen one.
	let swaps = $state<Record<number, number>>({});
	let design = $state<Design | null>(null);
	let busy = $state(false);
	let dragging = $state(false);
	let canvas = $state<HTMLCanvasElement>();
	let inApp = $state(false);

	// Library: every patch made here is saved automatically (picture, preview,
	// .pes and settings); changes to the open one update the same entry.
	let sourceCanvas: HTMLCanvasElement | null = null; // the downscaled picture
	let currentId = $state<string | null>(null);
	let session = $state(0); // bumps with each picture loaded
	let savedKey = '';
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	onMount(() => {
		// Android app (WebView): file downloads don't reach the phone there.
		inApp = '__capacitor' in window || 'Capacitor' in window || / wv\)/.test(navigator.userAgent);
	});

	const threads = $derived(design ? design.threads.map((i) => swaps[i] ?? i) : []);
	const uniqueThreads = $derived([...new Set(design?.threads ?? [])]);

	// File name for a title: ASCII, no spaces (machines and Artspira are picky).
	function safeName(s: string) {
		return (
			s
				.normalize('NFD')
				.replace(/[^A-Za-z0-9_-]+/g, '_')
				.replace(/^_+|_+$/g, '')
				.slice(0, 40) || 'ecusson'
		);
	}
	const fileBase = $derived(safeName(title));

	function currentSettings(): EmbroiderySettings {
		return { sizeMm, colors, removeBackground, shape, borderThread, backgroundThread, density, fabric, swaps };
	}
	const keyFor = () => JSON.stringify({ session, title, settings: currentSettings() });

	// `from`: a design reopened from the library, to edit in place.
	async function load(file: File | undefined, from?: EmbroideryDesign) {
		if (!file) return;
		try {
			const bitmap = await createImageBitmap(file);
			const scale = Math.min(1, MAX_PIXELS / Math.max(bitmap.width, bitmap.height));
			const w = Math.max(1, Math.round(bitmap.width * scale));
			const h = Math.max(1, Math.round(bitmap.height * scale));
			const c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			const ctx = c.getContext('2d')!;
			ctx.drawImage(bitmap, 0, 0, w, h);
			bitmap.close();
			sourceCanvas = c;
			if (imageUrl) URL.revokeObjectURL(imageUrl);
			imageUrl = URL.createObjectURL(file);
			session++;
			if (from) {
				const st = from.settings;
				({ sizeMm, colors, removeBackground, shape, borderThread, backgroundThread, density, fabric } = st);
				swaps = Object.fromEntries(Object.entries(st.swaps ?? {}).map(([k, v]) => [Number(k), v]));
				title = from.title;
				currentId = from.id;
				savedKey = keyFor(); // already in the library as it is
				saveState = 'saved';
			} else {
				title = file.name.replace(/\.[^.]+$/, '').slice(0, 200) || 'Écusson';
				swaps = {};
				currentId = null;
				saveState = 'idle';
			}
			image = { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
		} catch {
			toasts.push({ kind: 'error', key: 'embroidery.errorImage' }, 6000);
		}
	}

	// Re-digitize (debounced) whenever the picture or an option changes.
	$effect(() => {
		const img = image;
		const opts = {
			sizeMm,
			colors,
			removeBackground,
			shape,
			borderThread,
			backgroundThread: backgroundThread || null,
			spacing: DENSITY[density]
		};
		if (!img) return;
		busy = true;
		const timer = setTimeout(() => {
			try {
				design = digitize(img, opts);
			} catch (e) {
				console.error(e);
				design = null;
				toasts.push({ kind: 'error', key: 'toast.error' }, 6000);
			}
			busy = false;
		}, 250);
		return () => clearTimeout(timer);
	});

	// Stitch preview: every stitch as a line in its thread colour.
	$effect(() => {
		const d = design;
		const th = threads;
		const bg = fabric;
		if (!canvas || !d) return;
		const dpr = window.devicePixelRatio || 1;
		const px = canvas.clientWidth * dpr;
		if (!px) return;
		canvas.width = px;
		canvas.height = px;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, px, px);
		// The 100 mm hoop area, design centred like on the machine.
		drawStitches(ctx, d.commands, th, px / (HOOP_MM * 10), px / 2, px / 2);
		// Hoop outline.
		ctx.strokeStyle = 'rgba(0,0,0,0.25)';
		ctx.setLineDash([6 * dpr, 6 * dpr]);
		ctx.lineWidth = dpr;
		ctx.strokeRect(dpr, dpr, px - 2 * dpr, px - 2 * dpr);
	});

	// Autosave, a moment after the design stops changing.
	$effect(() => {
		const d = design;
		const key = keyFor();
		if (!d || busy || key === savedKey) return;
		const timer = setTimeout(save, 1200);
		return () => clearTimeout(timer);
	});

	let saving: Promise<void> | null = null;
	async function save(): Promise<void> {
		while (saving) await saving;
		const d = design;
		const key = keyFor();
		if (!d || !sourceCanvas || busy || key === savedKey) return;
		const th = [...threads];
		const src = sourceCanvas;
		saving = (async () => {
			saveState = 'saving';
			try {
				const form = new FormData();
				form.set(
					'meta',
					JSON.stringify({
						title: title.trim() || 'Écusson',
						settings: currentSettings(),
						threads: th,
						widthMm: d.widthMm,
						heightMm: d.heightMm,
						stitchCount: d.stitchCount
					})
				);
				form.set('image', await canvasBlob(src), 'source');
				form.set('preview', await canvasBlob(renderThumbnail(d.commands, th)), 'preview');
				form.set('pes', new Blob([writePes(d.commands, th, fileBase)]), 'design.pes');
				const send = (id: string | null) =>
					fetch(id ? `/api/embroidery/${id}` : '/api/embroidery', { method: id ? 'PUT' : 'POST', body: form });
				let res = await send(currentId);
				if (res.status === 404 && currentId) res = await send(null); // deleted meanwhile
				if (!res.ok) throw new Error(`save failed: ${res.status}`);
				currentId = (await res.json()).id;
				savedKey = key;
				saveState = 'saved';
				await invalidateAll();
			} catch (e) {
				console.error(e);
				saveState = 'error';
			}
		})();
		await saving;
		saving = null;
	}

	function pesFile(): File | null {
		if (!design) return null;
		const bytes = writePes(design.commands, threads, fileBase);
		return new File([bytes], `${fileBase}.pes`, { type: 'application/octet-stream' });
	}

	function download() {
		const file = pesFile();
		if (!file) return;
		const url = URL.createObjectURL(file);
		const a = document.createElement('a');
		a.href = url;
		a.download = file.name;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
		save();
	}

	const canShare = $derived.by(() => {
		if (typeof navigator === 'undefined' || !navigator.canShare) return false;
		try {
			return navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.pes', { type: 'application/octet-stream' })] });
		} catch {
			return false;
		}
	});

	async function share() {
		const file = pesFile();
		if (!file) return;
		const shared = navigator.share({ files: [file], title: file.name });
		save();
		try {
			await shared;
		} catch (e) {
			if ((e as Error).name !== 'AbortError') toasts.push({ kind: 'error', key: 'embroidery.errorShare' }, 6000);
		}
	}

	async function shareSaved(d: EmbroideryDesign) {
		try {
			const blob = await (await fetch(`/media/${d.pesPath}`)).blob();
			await navigator.share({ files: [new File([blob], `${safeName(d.title)}.pes`, { type: 'application/octet-stream' })], title: d.title });
		} catch (e) {
			if ((e as Error).name !== 'AbortError') toasts.push({ kind: 'error', key: 'embroidery.errorShare' }, 6000);
		}
	}

	async function reopen(d: EmbroideryDesign) {
		try {
			const blob = await (await fetch(`/media/${d.imagePath}`)).blob();
			await load(new File([blob], d.title, { type: blob.type }), d);
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch {
			toasts.push({ kind: 'error', key: 'toast.error' }, 6000);
		}
	}

	function clearEditor() {
		image = null;
		design = null;
		sourceCanvas = null;
		currentId = null;
		saveState = 'idle';
		if (imageUrl) URL.revokeObjectURL(imageUrl);
		imageUrl = null;
	}

	// Permanent: the entry and its files are gone, no undo.
	async function remove(d: EmbroideryDesign) {
		if (!confirm(t(locale, 'embroidery.confirmDelete', { title: d.title }))) return;
		const res = await fetch(`/api/embroidery/${d.id}`, { method: 'DELETE' });
		if (!res.ok && res.status !== 404) {
			toasts.push({ kind: 'error', key: 'toast.error' }, 6000);
			return;
		}
		if (d.id === currentId) clearEditor();
		toasts.push({ kind: 'success', key: 'embroidery.deleted' });
		await invalidateAll();
	}

	const dateFmt = $derived(new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }));

	const minutes = $derived(design ? Math.max(1, Math.round(sewingMinutes(design))) : 0);
</script>

<div class="container">
	<h1>{t(locale, 'embroidery.title')}</h1>
	<p class="muted">{t(locale, 'embroidery.subtitle')}</p>

	{#if inApp}
		<p class="card note">{t(locale, 'embroidery.inApp')}</p>
	{/if}

	<div class="layout" class:has-image={!!image}>
		<section class="card settings">
			<label
				class="drop"
				class:dragging
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(e) => {
					e.preventDefault();
					dragging = false;
					load(e.dataTransfer?.files[0]);
				}}
			>
				{#if imageUrl}
					<img src={imageUrl} alt="" />
				{:else}
					<span class="drop-ico" aria-hidden="true">🖼️</span>
				{/if}
				<span>{t(locale, imageUrl ? 'embroidery.change' : 'embroidery.pick')}</span>
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
					onchange={(e) => {
						const input = e.currentTarget as HTMLInputElement;
						load(input.files?.[0]);
						input.value = ''; // picking the same file again still counts
					}}
				/>
			</label>

			{#if image}
				<div class="field">
					<label for="emb-title">{t(locale, 'embroidery.name')}</label>
					<input id="emb-title" maxlength="200" bind:value={title} />
				</div>
			{/if}
			<div class="field">
				<label for="emb-size">{t(locale, 'embroidery.size', { n: sizeMm })}</label>
				<input id="emb-size" type="range" min="30" max={HOOP_MM} step="5" bind:value={sizeMm} />
			</div>
			<div class="field">
				<label for="emb-colors">{t(locale, 'embroidery.colors', { n: colors })}</label>
				<input id="emb-colors" type="range" min="1" max="8" step="1" bind:value={colors} />
			</div>
			<div class="field check">
				<input id="emb-bg" type="checkbox" bind:checked={removeBackground} />
				<label for="emb-bg">{t(locale, 'embroidery.removeBackground')}</label>
			</div>
			<div class="field">
				<span class="label">{t(locale, 'embroidery.shape')}</span>
				<div class="seg" role="radiogroup" aria-label={t(locale, 'embroidery.shape')}>
					{#each [['circle', 'embroidery.shape.circle'], ['rounded', 'embroidery.shape.rounded'], ['none', 'embroidery.shape.none']] as [value, key]}
						<button type="button" role="radio" aria-checked={shape === value} class:on={shape === value} onclick={() => (shape = value as PatchShape)}>
							{t(locale, key)}
						</button>
					{/each}
				</div>
			</div>
			{#if shape !== 'none'}
				<div class="field">
					<label for="emb-border">{t(locale, 'embroidery.border')}</label>
					<select id="emb-border" bind:value={borderThread}>
						{#each THREADS as th}<option value={th.index}>{th.name}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="emb-fill">{t(locale, 'embroidery.background')}</label>
					<select id="emb-fill" bind:value={backgroundThread}>
						<option value={0}>{t(locale, 'embroidery.background.none')}</option>
						{#each THREADS as th}<option value={th.index}>{th.name}</option>{/each}
					</select>
				</div>
			{/if}
			<div class="field">
				<label for="emb-density">{t(locale, 'embroidery.density')}</label>
				<select id="emb-density" bind:value={density}>
					<option value="light">{t(locale, 'embroidery.density.light')}</option>
					<option value="normal">{t(locale, 'embroidery.density.normal')}</option>
					<option value="dense">{t(locale, 'embroidery.density.dense')}</option>
				</select>
			</div>
		</section>

		<section class="card result">
			{#if !image}
				<p class="muted empty">{t(locale, 'embroidery.empty')}</p>
			{:else}
				<div class="preview" class:busy>
					<canvas bind:this={canvas} aria-label={t(locale, 'embroidery.preview')}></canvas>
					<input class="fabric" type="color" bind:value={fabric} title={t(locale, 'embroidery.fabric')} aria-label={t(locale, 'embroidery.fabric')} />
				</div>
				{#if design}
					<p class="stats">
						{t(locale, 'embroidery.stats', {
							w: Math.round(design.widthMm),
							h: Math.round(design.heightMm),
							n: design.stitchCount.toLocaleString(locale),
							c: new Set(threads).size,
							m: minutes
						})}
					</p>
					<h2>{t(locale, 'embroidery.threads')}</h2>
					<ol class="threads">
						{#each uniqueThreads as orig}
							{@const th = threadByIndex.get(swaps[orig] ?? orig)}
							<li>
								<span class="swatch" style:background={th ? threadHex(th) : '#000'}></span>
								<select
									aria-label={t(locale, 'embroidery.swap')}
									value={swaps[orig] ?? orig}
									onchange={(e) => (swaps = { ...swaps, [orig]: Number((e.currentTarget as HTMLSelectElement).value) })}
								>
									{#each THREADS as opt}<option value={opt.index}>{opt.name}</option>{/each}
								</select>
							</li>
						{/each}
					</ol>
					<div class="actions">
						<button class="btn-primary" type="button" onclick={download}>⬇ {t(locale, 'embroidery.download')}</button>
						{#if canShare}
							<button type="button" onclick={share}>📤 {t(locale, 'embroidery.share')}</button>
						{/if}
					</div>
					<p class="save-state small" class:error={saveState === 'error'} aria-live="polite">
					{#if saveState === 'saving'}{t(locale, 'embroidery.saving')}{:else if saveState === 'saved'}✓ {t(locale, 'embroidery.saved')}{:else if saveState === 'error'}{t(locale, 'embroidery.saveError')}{/if}
				</p>
				<p class="muted small">{t(locale, 'embroidery.howto')}</p>
				{/if}
			{/if}
		</section>
	</div>

	<section class="library">
		<h2>{t(locale, 'embroidery.library')} <span class="muted">({data.designs.length})</span></h2>
		{#if data.designs.length === 0}
			<p class="muted">{t(locale, 'embroidery.libraryEmpty')}</p>
		{:else}
			<div class="lib-grid">
				{#each data.designs as d (d.id)}
					<article class="card lib-item" id={`design-${d.id}`} class:current={d.id === currentId}>
						<button type="button" class="lib-thumb" style:background={d.settings.fabric} onclick={() => reopen(d)} aria-label={t(locale, 'embroidery.edit')}>
							<img src={mediaUrl(d.previewPath, 400)} alt={d.title} loading="lazy" />
						</button>
						<strong class="lib-title">{d.title}</strong>
						<span class="muted small">
							{t(locale, 'embroidery.libraryMeta', {
								w: Math.round(d.widthMm),
								h: Math.round(d.heightMm),
								n: d.stitchCount.toLocaleString(locale),
								date: dateFmt.format(new Date(d.updatedAt))
							})}
						</span>
						<span class="lib-swatches">
							{#each [...new Set(d.threads)] as idx}
								{@const th = threadByIndex.get(idx)}
								<span class="swatch-sm" style:background={th ? threadHex(th) : '#000'} title={th?.name}></span>
							{/each}
						</span>
						<div class="lib-actions">
							<a class="btn" href={`/media/${d.pesPath}`} download={`${safeName(d.title)}.pes`}>⬇ .pes</a>
							{#if canShare}
								<button type="button" onclick={() => shareSaved(d)} aria-label={t(locale, 'embroidery.share')}>📤</button>
							{/if}
							<button type="button" onclick={() => reopen(d)}>✏️ {t(locale, 'embroidery.edit')}</button>
							<button type="button" class="danger" onclick={() => remove(d)} aria-label={t(locale, 'embroidery.delete')} title={t(locale, 'embroidery.delete')}>🗑</button>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
		margin-top: 1rem;
	}
	@media (max-width: 760px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
		/* Once there is a picture, the preview comes first on a phone. */
		.layout.has-image .result {
			order: -1;
		}
	}
	.note {
		margin-top: 1rem;
		border-color: var(--accent);
	}
	.drop {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 140px;
		padding: 0.8rem;
		margin-bottom: 1rem;
		border: 2px dashed var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		text-align: center;
		color: var(--text);
		font-size: 0.95rem;
	}
	.drop.dragging,
	.drop:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.drop img {
		max-height: 140px;
		object-fit: contain;
	}
	.drop-ico {
		font-size: 2rem;
	}
	.drop input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.label {
		display: block;
		font-size: 0.85rem;
		color: var(--muted);
		margin-bottom: 0.25rem;
	}
	input[type='range'] {
		padding: 0;
		min-height: 32px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.check input {
		width: 22px;
		height: 22px;
		flex: none;
	}
	.check label {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text);
	}
	.seg {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.seg button {
		flex: 1;
		min-height: 40px;
	}
	.seg button.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}
	.empty {
		text-align: center;
		padding: 3rem 1rem;
	}
	.preview {
		position: relative;
		max-width: 520px;
		margin: 0 auto;
	}
	.preview canvas {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		border-radius: var(--radius);
		transition: opacity 0.2s;
	}
	.preview.busy canvas {
		opacity: 0.5;
	}
	.fabric {
		position: absolute;
		right: 0.5rem;
		bottom: 0.5rem;
		width: 40px;
		height: 40px;
		padding: 2px;
	}
	.stats {
		text-align: center;
		margin: 0.8rem 0;
	}
	h2 {
		font-size: 1.05rem;
		margin: 1rem 0 0.5rem;
	}
	.threads {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	}
	.threads li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.swatch {
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 1px solid var(--border);
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin: 1rem 0 0.5rem;
	}
	.actions button {
		min-height: 44px;
		flex: 1 1 180px;
	}
	.small {
		font-size: 0.85rem;
	}
	.save-state {
		min-height: 1.2em;
		margin: 0 0 0.3rem;
		color: var(--ok);
	}
	.save-state.error {
		color: var(--danger);
	}
	.library {
		margin-top: 2rem;
	}
	.library h2 {
		font-size: 1.2rem;
	}
	.lib-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	}
	.lib-item {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}
	.lib-item.current,
	.lib-item:target {
		outline: 2px solid var(--accent);
	}
	.lib-thumb {
		padding: 0;
		border-radius: var(--radius);
		aspect-ratio: 1;
		overflow: hidden;
		display: block;
		width: 100%;
	}
	.lib-thumb img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}
	.lib-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lib-swatches {
		display: flex;
		gap: 3px;
		flex-wrap: wrap;
	}
	.swatch-sm {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 1px solid var(--border);
	}
	.lib-actions {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		margin-top: auto;
		padding-top: 0.3rem;
	}
	.lib-actions > * {
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.lib-actions .btn {
		text-decoration: none;
	}
	.lib-actions .danger {
		margin-left: auto;
		color: var(--danger);
	}
</style>
