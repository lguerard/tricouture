<script lang="ts">
	// PDF reader drawn with pdf.js on canvases, so it works everywhere —
	// including the Android app's WebView, which has no built-in PDF viewer
	// (an <iframe> there stays blank or tries to download the file).
	import { onMount } from 'svelte';
	// The "legacy" build carries polyfills for the newest JS the modern build
	// uses (e.g. Map.getOrInsertComputed), which Android WebViews lack.
	import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
	import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
	import { t, type Locale } from '$lib/i18n';

	let { src, title, locale }: { src: string; title: string; locale: Locale } = $props();

	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 4;
	const MAX_CANVAS_PIXELS = 16_000_000; // phones refuse bigger canvases

	let scroller = $state<HTMLDivElement>();
	let pagesEl = $state<HTMLDivElement>();
	let pageCount = $state(0);
	let current = $state(1);
	let zoom = $state(1);
	let full = $state(false);
	let failed = $state(false);

	let doc: PDFDocumentProxy | null = null;
	type Slot = { el: HTMLDivElement; canvas: HTMLCanvasElement; ratio: number; visible: boolean; drawn: string; task: RenderTask | null };
	let slots: Slot[] = [];
	let observer: IntersectionObserver | null = null;
	let pageObserver: IntersectionObserver | null = null;

	// Width the pages are laid out at, in CSS pixels.
	const pageWidth = () => Math.max(100, (scroller?.clientWidth ?? 600) - 16) * zoom;

	function layout() {
		const w = pageWidth();
		for (const s of slots) {
			s.el.style.width = `${w}px`;
			s.el.style.height = `${w * s.ratio}px`;
		}
	}

	async function draw(i: number) {
		const s = slots[i];
		if (!doc || !s.visible) return;
		const dpr = window.devicePixelRatio || 1;
		const w = pageWidth();
		const key = `${w}x${dpr}`;
		if (s.drawn === key) return;
		s.task?.cancel();
		const page = await doc.getPage(i + 1);
		const base = page.getViewport({ scale: 1 });
		if (Math.abs(base.height / base.width - s.ratio) > 1e-3) {
			s.ratio = base.height / base.width;
			s.el.style.height = `${w * s.ratio}px`;
		}
		let scale = (w / base.width) * dpr;
		const pixels = base.width * base.height * scale * scale;
		if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
		const viewport = page.getViewport({ scale });
		// Draw off-screen, then swap: no white flash while zooming.
		const canvas = document.createElement('canvas');
		canvas.width = Math.floor(viewport.width);
		canvas.height = Math.floor(viewport.height);
		const task = page.render({ canvas, viewport });
		s.task = task;
		try {
			await task.promise;
		} catch {
			return; // cancelled by a newer render
		}
		if (s.task !== task || !s.visible) return;
		s.task = null;
		s.drawn = key;
		s.canvas.replaceWith(canvas);
		s.canvas = canvas;
	}

	// Pages far off-screen give their memory back.
	function release(s: Slot) {
		s.task?.cancel();
		s.task = null;
		s.drawn = '';
		s.canvas.width = 0;
		s.canvas.height = 0;
	}

	function redrawVisible() {
		layout();
		slots.forEach((s, i) => s.visible && draw(i));
	}

	function setZoom(z: number) {
		const el = scroller;
		const keep = el ? (el.scrollTop + el.clientHeight / 2) / Math.max(1, el.scrollHeight) : 0;
		zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
		redrawVisible();
		if (el) el.scrollTop = keep * el.scrollHeight - el.clientHeight / 2;
	}

	function goTo(n: number) {
		slots[n - 1]?.el.scrollIntoView({ block: 'start' });
	}

	function toggleFull() {
		full = !full;
		// The layout changes size: lay pages out again once it has.
		requestAnimationFrame(redrawVisible);
	}

	onMount(() => {
		let cancelled = false;
		let resizeTimer: ReturnType<typeof setTimeout>;
		const onResize = () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(redrawVisible, 150);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && full) toggleFull();
		};
		window.addEventListener('resize', onResize);
		window.addEventListener('keydown', onKey);

		(async () => {
			try {
				const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
				pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
				const loaded = await pdfjs.getDocument({ url: src }).promise;
				if (cancelled) {
					loaded.destroy();
					return;
				}
				doc = loaded;
				const first = (await loaded.getPage(1)).getViewport({ scale: 1 });
				const ratio = first.height / first.width;
				observer = new IntersectionObserver(
					(entries) => {
						for (const e of entries) {
							const i = Number((e.target as HTMLElement).dataset.page) - 1;
							slots[i].visible = e.isIntersecting;
							if (e.isIntersecting) draw(i);
							else release(slots[i]);
						}
					},
					{ root: scroller, rootMargin: '150% 0px' }
				);
				pageObserver = new IntersectionObserver(
					(entries) => {
						for (const e of entries) if (e.isIntersecting) current = Number((e.target as HTMLElement).dataset.page);
					},
					{ root: scroller, rootMargin: '-45% 0px -45% 0px' }
				);
				slots = [];
				for (let i = 0; i < loaded.numPages; i++) {
					const el = document.createElement('div');
					el.className = 'pdf-page';
					el.dataset.page = String(i + 1);
					const canvas = document.createElement('canvas');
					el.append(canvas);
					pagesEl!.append(el);
					slots.push({ el, canvas, ratio, visible: false, drawn: '', task: null });
				}
				pageCount = loaded.numPages;
				layout();
				for (const s of slots) {
					observer.observe(s.el);
					pageObserver.observe(s.el);
				}
			} catch (e) {
				console.error(e);
				failed = true;
			}
		})();

		return () => {
			cancelled = true;
			clearTimeout(resizeTimer);
			window.removeEventListener('resize', onResize);
			window.removeEventListener('keydown', onKey);
			observer?.disconnect();
			pageObserver?.disconnect();
			for (const s of slots) s.task?.cancel();
			doc?.destroy();
		};
	});
</script>

<div class="viewer" class:full role={full ? 'dialog' : undefined} aria-label={title}>
	<div class="bar">
		{#if full}<strong class="name">{title}</strong>{/if}
		<span class="pages" aria-live="polite">
			{#if pageCount}{t(locale, 'pdf.page', { n: current, total: pageCount })}{/if}
		</span>
		<span class="tools">
			<button type="button" onclick={() => goTo(current - 1)} disabled={current <= 1} aria-label={t(locale, 'pdf.prev')}>‹</button>
			<button type="button" onclick={() => goTo(current + 1)} disabled={current >= pageCount} aria-label={t(locale, 'pdf.next')}>›</button>
			<button type="button" onclick={() => setZoom(zoom / 1.25)} disabled={zoom <= MIN_ZOOM} aria-label={t(locale, 'pdf.zoomOut')}>−</button>
			<button type="button" class="pct" onclick={() => setZoom(1)} title={t(locale, 'pdf.fit')}>{Math.round(zoom * 100)} %</button>
			<button type="button" onclick={() => setZoom(zoom * 1.25)} disabled={zoom >= MAX_ZOOM} aria-label={t(locale, 'pdf.zoomIn')}>+</button>
			<button type="button" onclick={toggleFull} aria-label={t(locale, full ? 'pdf.exitFull' : 'pdf.full')}>{full ? '✕' : '⛶'}</button>
		</span>
	</div>
	<div class="scroller" bind:this={scroller}>
		{#if failed}
			<p class="muted msg">{t(locale, 'pdf.error')} <a href={src} download>{t(locale, 'pdf.download')}</a></p>
		{:else if !pageCount}
			<p class="muted msg">{t(locale, 'pdf.loading')}</p>
		{/if}
		<div class="pages-list" bind:this={pagesEl}></div>
	</div>
</div>

<style>
	.viewer {
		display: flex;
		flex-direction: column;
		height: 75vh;
		min-height: 320px;
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--accent-soft);
	}
	.viewer.full {
		position: fixed;
		inset: 0;
		z-index: 1000;
		height: auto;
		border-radius: 0;
		background: var(--bg, #333);
		padding-top: env(safe-area-inset-top);
		padding-bottom: env(safe-area-inset-bottom);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.4rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.name {
		flex: 1 1 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pages {
		font-size: 0.85rem;
		color: var(--muted);
		margin-right: auto;
	}
	.tools {
		display: flex;
		gap: 0.25rem;
	}
	.tools button {
		min-width: 40px;
		min-height: 40px;
		padding: 0.2rem 0.5rem;
		font-size: 1.05rem;
	}
	.tools .pct {
		font-size: 0.8rem;
		min-width: 56px;
	}
	.scroller {
		flex: 1;
		overflow: auto;
		-webkit-overflow-scrolling: touch;
		padding: 8px;
	}
	.pages-list {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		width: max-content;
		min-width: 100%;
	}
	.pages-list :global(.pdf-page) {
		background: #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		flex: none;
	}
	.pages-list :global(.pdf-page canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.msg {
		padding: 1rem;
		text-align: center;
	}
</style>
