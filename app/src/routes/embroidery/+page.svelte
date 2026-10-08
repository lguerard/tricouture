<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { toasts } from '$lib/toast.svelte';
	import { digitize, sewingMinutes, HOOP_MM, type Design, type PatchShape, type RasterImage } from '$lib/embroidery/digitize';
	import { writePes } from '$lib/embroidery/pes';
	import { PEC_THREADS, threadHex } from '$lib/embroidery/threads';

	let { data } = $props();
	const locale = $derived(data.locale);

	const THREADS = PEC_THREADS.filter((th) => th.name !== 'Applique');
	const threadByIndex = new Map(PEC_THREADS.map((th) => [th.index, th]));
	const DENSITY = { light: 0.5, normal: 0.4, dense: 0.33 } as const;
	const MAX_PIXELS = 600; // the picture is downscaled to this before digitizing

	let image = $state<RasterImage | null>(null);
	let imageUrl = $state<string | null>(null);
	let fileBase = $state('ecusson');
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

	onMount(() => {
		// Android app (WebView): file downloads don't reach the phone there.
		inApp = '__capacitor' in window || 'Capacitor' in window || / wv\)/.test(navigator.userAgent);
	});

	const threads = $derived(design ? design.threads.map((i) => swaps[i] ?? i) : []);
	const uniqueThreads = $derived([...new Set(design?.threads ?? [])]);

	async function load(file: File | undefined) {
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
			image = { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
			if (imageUrl) URL.revokeObjectURL(imageUrl);
			imageUrl = URL.createObjectURL(file);
			fileBase =
				file.name
					.replace(/\.[^.]+$/, '')
					.normalize('NFD')
					.replace(/[^A-Za-z0-9_-]+/g, '_')
					.replace(/^_+|_+$/g, '')
					.slice(0, 40) || 'ecusson';
			swaps = {};
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
		const scale = px / (HOOP_MM * 10);
		ctx.save();
		ctx.translate(px / 2, px / 2);
		ctx.scale(scale, scale);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineWidth = 3.5; // ~0.35 mm thread
		let block = 0;
		let prev: { x: number; y: number } | null = null;
		const stroke = () => {
			const thread = threadByIndex.get(th[block] ?? 20);
			ctx.strokeStyle = thread ? threadHex(thread) : '#000';
			ctx.stroke();
			ctx.beginPath();
		};
		ctx.beginPath();
		for (const c of d.commands) {
			if (c.kind === 'stitch') {
				if (prev) ctx.lineTo(c.x, c.y);
				else ctx.moveTo(c.x, c.y);
				prev = c;
			} else if (c.kind === 'jump') {
				prev = null;
			} else if (c.kind === 'color') {
				stroke();
				block++;
				prev = null;
			}
		}
		stroke();
		ctx.restore();
		// Hoop outline.
		ctx.strokeStyle = 'rgba(0,0,0,0.25)';
		ctx.setLineDash([6 * dpr, 6 * dpr]);
		ctx.lineWidth = dpr;
		ctx.strokeRect(dpr, dpr, px - 2 * dpr, px - 2 * dpr);
	});

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
		try {
			await navigator.share({ files: [file], title: file.name });
		} catch (e) {
			if ((e as Error).name !== 'AbortError') toasts.push({ kind: 'error', key: 'embroidery.errorShare' }, 6000);
		}
	}

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
					onchange={(e) => load((e.currentTarget as HTMLInputElement).files?.[0])}
				/>
			</label>

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
					<p class="muted small">{t(locale, 'embroidery.howto')}</p>
				{/if}
			{/if}
		</section>
	</div>
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
</style>
