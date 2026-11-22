<script lang="ts">
	import '@fontsource/cinzel/latin-700.css';
	import '@fontsource/dancing-script/latin-700.css';
	import { enhance } from '$app/forms';
	import { onMount, tick } from 'svelte';
	import { t } from '$lib/i18n';
	import { mediaUrl } from '$lib/media';
	import { DOOR_ORDER } from '$lib/advent';

	let { data, form } = $props();
	const locale = $derived(data.locale);

	type Door = (typeof data.doors)[number];
	const byDay = $derived(new Map(data.doors.map((d) => [d.day, d])));
	const ordered = $derived(DOOR_ORDER.map((n) => byDay.get(n)).filter((d): d is Door => !!d));
	const openedCount = $derived(data.doors.filter((d) => d.state === 'open').length);
	const mainDoors = $derived(data.doors.filter((d) => d.isMain));
	const mainOpened = $derived(mainDoors.filter((d) => d.state === 'open').length);

	// Velvet colours of the doors, in turn; gold for the "fil rouge".
	const VELVET = ['#8e1c2e', '#1f5c45', '#26346e', '#5d2459', '#9a4a12', '#14505e'];

	// Content revealed in the lutin's preview (nothing is saved there).
	let revealed = $state<Record<number, Door>>({});
	// Noms de couleur de la laine d'une porte (« Bleu nuit »), pour l'expliquer à côté de la photo du modèle.
	const colorways = (d: Door) => [...new Set(d.yarns.map((y) => y.colorway?.trim()).filter((c): c is string => !!c))];
	let selected = $state<number | null>(null);
	const current = $derived(selected ? (revealed[selected] ?? byDay.get(selected) ?? null) : null);
	let dialog: HTMLDialogElement | undefined = $state();
	let code = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let justOpened = $state<number | null>(null);
	let shaking = $state<number | null>(null);

	function choose(d: Door) {
		if (d.state === 'locked') {
			shaking = d.day;
			setTimeout(() => (shaking = null), 600);
		}
		selected = d.day;
		code = '';
		error = null;
		dialog?.showModal();
	}
	function close() {
		dialog?.close();
	}

	function errorText(reason: string, minutes: number): string {
		if (reason === 'wrong') return t(locale, 'advent.wrong');
		if (reason === 'wait') return t(locale, 'advent.wait', { n: minutes });
		if (reason === 'notYet') return t(locale, 'advent.notYet');
		return t(locale, 'advent.error');
	}

	// Sparkles burst from the door when it opens.
	let sparkles = $state<{ id: number; x: number; y: number; d: number; c: string }[]>([]);
	function burst() {
		if (reduceMotion) return;
		const cols = ['#ffd77a', '#fff4d6', '#f7b2d9', '#b9e6ff'];
		sparkles = Array.from({ length: 36 }, (_, i) => {
			const a = (i / 36) * Math.PI * 2 + Math.random() * 0.3;
			const r = 90 + Math.random() * 120;
			return { id: Date.now() + i, x: Math.cos(a) * r, y: Math.sin(a) * r, d: 600 + Math.random() * 600, c: cols[i % cols.length] };
		});
		setTimeout(() => (sparkles = []), 1400);
	}

	function daysLeftText(n: number) {
		return n === 1 ? t(locale, 'advent.tomorrow') : t(locale, 'advent.inDays', { n });
	}

	// --- Snow ----------------------------------------------------------------
	let canvas: HTMLCanvasElement | undefined = $state();
	let reduceMotion = $state(false);
	onMount(() => {
		reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduceMotion || !canvas) return;
		const ctx = canvas.getContext('2d')!;
		let w = 0, h = 0, raf = 0;
		const flakes = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, s: 0.15 + Math.random() * 0.45, p: Math.random() * 6 }));
		const resize = () => {
			const dpr = Math.min(2, devicePixelRatio || 1);
			w = canvas!.clientWidth; h = canvas!.clientHeight;
			canvas!.width = w * dpr; canvas!.height = h * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(canvas);
		let last = performance.now();
		const frame = (now: number) => {
			const dt = Math.min(50, now - last) / 16; last = now;
			ctx.clearRect(0, 0, w, h);
			for (const f of flakes) {
				f.y += (f.s * dt) / Math.max(1, h) * 2.2;
				f.p += 0.01 * dt;
				if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
				const x = (f.x * w + Math.sin(f.p) * 14 + w) % w;
				ctx.beginPath();
				ctx.fillStyle = `rgba(255,255,255,${0.35 + f.r / 5})`;
				ctx.arc(x, f.y * h, f.r, 0, Math.PI * 2);
				ctx.fill();
			}
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => { cancelAnimationFrame(raf); ro.disconnect(); };
	});
</script>

<div class="advent">
	<canvas class="snow" bind:this={canvas} aria-hidden="true"></canvas>
	<div class="sky" aria-hidden="true"></div>

	<div class="inner">
		{#if data.preview}
			<form class="preview" method="GET">
				<input type="hidden" name="preview" value={data.calendar.id} />
				<span>👁️ {t(locale, 'advent.preview.banner')}</span>
				<label for="pdate">{t(locale, 'advent.preview.date')}</label>
				<input id="pdate" type="date" name="date" value={data.previewDate ?? ''} />
				<button type="submit">{t(locale, 'advent.preview.go')}</button>
				<a href="/avent/atelier?c={data.calendar.id}">{t(locale, 'advent.preview.back')}</a>
			</form>
		{/if}

		<header class="hero">
			<p class="eyebrow">{t(locale, 'advent.eyebrow', { year: data.calendar.year })}</p>
			<h1>{data.calendar.title}</h1>
			{#if data.calendar.message}<p class="lead">{data.calendar.message}</p>{/if}
			<div class="progress">
				<span>{t(locale, 'advent.progress', { n: openedCount })}</span>
				{#if mainDoors.length}
					<span class="thread" title={t(locale, 'advent.mainHelp')}>
						<span class="spool">🧶</span>
						{#each mainDoors as m}<i class:done={m.state === 'open'}></i>{/each}
						<span class="sr">{t(locale, 'advent.mainProgress', { n: mainOpened, total: mainDoors.length })}</span>
					</span>
				{/if}
			</div>
		</header>

		<div class="board">
			{#each ordered as d, i (d.day)}
				<button
					type="button"
					class="door {d.state}"
					class:main={d.isMain}
					class:big={d.day === 24}
					class:first={d.day === 1}
					class:shake={shaking === d.day}
					class:fresh={justOpened === d.day}
					style="--velvet: {d.isMain ? '#6b4a12' : VELVET[i % VELVET.length]}"
					onclick={() => choose(d)}
					aria-label={t(locale, 'advent.doorLabel', { n: d.day }) +
						' — ' +
						(d.state === 'locked' ? daysLeftText(d.daysLeft) : d.state === 'open' ? (d.title ?? t(locale, 'advent.opened')) : t(locale, 'advent.ready'))}
				>
					<span class="inside">
						{#if d.state === 'open'}
							{#if d.coverPath}
								<img src={mediaUrl(d.coverPath, 200)} alt="" loading="lazy" />
								<!-- La laine de la porte, sur la photo du modèle : c'est elle qui compte. -->
								{#if d.yarns.length}
									<span class="balls on-cover">
										{#each d.yarns.slice(0, 3) as y}<i style="--c: {y.colorHex || '#d9c7a7'}"></i>{/each}
									</span>
								{/if}
							{:else}
								<span class="balls">
									{#each d.yarns.slice(0, 4) as y}<i style="--c: {y.colorHex || '#d9c7a7'}"></i>{/each}
								</span>
							{/if}
							<span class="ititle">{d.title ?? ''}</span>
						{/if}
					</span>
					<span class="leaf">
						<span class="num">{d.day}</span>
						{#if d.isMain}<span class="ribbon" aria-hidden="true">✦</span>{/if}
						{#if d.state === 'locked'}<span class="lock">{daysLeftText(d.daysLeft)}</span>{/if}
						{#if d.state === 'available'}<span class="glow" aria-hidden="true"></span>{/if}
					</span>
				</button>
			{/each}
		</div>
		<p class="legend">✦ {t(locale, 'advent.mainHelp')}</p>
	</div>
</div>

<dialog bind:this={dialog} class="scroll" onclose={() => (selected = null)}>
	{#if current}
		<button class="x" type="button" onclick={close} aria-label={t(locale, 'advent.close')}>×</button>
		<p class="dday">{t(locale, 'advent.doorLabel', { n: current.day })}{#if current.isMain}<span class="tag">✦ {t(locale, 'advent.main')}</span>{/if}</p>

		{#if current.state === 'locked'}
			<p class="big-msg">❄️ {t(locale, 'advent.lockedMsg')}</p>
			<p class="muted">{daysLeftText(current.daysLeft)}</p>
		{:else if current.state === 'available'}
			<h2>{t(locale, 'advent.hintTitle')}</h2>
			{#if current.hint}<p class="hint">{current.hint}</p>{:else}<p class="muted">{t(locale, 'advent.noHint')}</p>{/if}
			{#if current.hintPhoto}<img class="hphoto" src={mediaUrl(current.hintPhoto, 800)} alt={t(locale, 'advent.hintPhoto')} />{/if}
			<form
				method="POST"
				action="?/open{data.preview ? `&preview=${data.calendar.id}&date=${data.previewDate ?? ''}` : ''}"
				class="spell"
				use:enhance={() => {
					busy = true;
					error = null;
					const day = current!.day;
					return async ({ result, update }) => {
						busy = false;
						if (result.type === 'success') {
							const door = (result.data as { door?: Door } | undefined)?.door;
							if (door) revealed = { ...revealed, [day]: door };
							else await update({ reset: false });
							justOpened = day;
							await tick();
							burst();
						} else if (result.type === 'failure') {
							const f = result.data as { reason: string; minutes: number };
							error = errorText(f.reason, f.minutes);
						} else {
							error = t(locale, 'advent.error');
						}
					};
				}}
			>
				<input type="hidden" name="day" value={current.day} />
				<label for="code">{t(locale, 'advent.codeLabel')}</label>
				<div class="spell-row">
					<input id="code" name="code" bind:value={code} autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="✶ ✶ ✶" />
					<button class="cast" type="submit" disabled={busy || !code.trim()}>{t(locale, 'advent.open')}</button>
				</div>
				{#if error}<p class="err" role="alert">{error}</p>{/if}
			</form>
		{:else}
			<div class="reveal">
				{#each sparkles as s (s.id)}<i class="sparkle" style="--x:{s.x}px;--y:{s.y}px;--d:{s.d}ms;--c:{s.c}"></i>{/each}
				<h2>{current.title ?? t(locale, 'advent.opened')}</h2>
				{#if current.message}<p class="note">{current.message}</p>{/if}

				{#if current.patternId || current.patternTitle}
					<!-- Le patron de la porte : dit clairement qu'il rejoint la bibliothèque. -->
					<section class="gift">
						<p class="kicker">📜 {t(locale, data.preview ? 'advent.patternPreview' : 'advent.patternAdded')}</p>
						<div class="pat">
							{#if current.coverPath}<img class="cover" src={mediaUrl(current.coverPath, 400)} alt="" />{/if}
							<div class="pat-text">
								{#if current.patternTitle}<b class="pat-title">{current.patternTitle}</b>{/if}
								{#if current.coverPath && current.yarns.length}
									<p class="small cover-note">
										{colorways(current).length
											? t(locale, 'advent.coverNote', { colors: colorways(current).join(', ') })
											: t(locale, 'advent.coverNoteNoColor')}
									</p>
								{/if}
							</div>
						</div>
						{#if current.patternId}
							<div class="actions">
								<a class="cta" href="/patterns/{current.patternId}">📜 {t(locale, 'advent.seePattern')}</a>
								{#if !data.preview}
									<a class="cta alt" href="/projects/new?pattern={current.patternId}">🧶 {t(locale, 'advent.startProject')}</a>
								{/if}
							</div>
						{/if}
					</section>
				{:else if current.coverPath}
					<img class="cover" src={mediaUrl(current.coverPath, 400)} alt="" />
				{/if}

				{#if current.yarns.length}
					<section class="gift">
						<h3>{t(locale, current.patternId || current.patternTitle ? 'advent.yarnForPattern' : 'advent.yarnTitle')}</h3>
						<ul class="yarns">
							{#each current.yarns as y}
								<li>
									<i style="--c: {y.colorHex || '#d9c7a7'}"></i>
									<span><b>{[y.brand, y.name].filter(Boolean).join(' ')}</b>{#if y.colorway} · {y.colorway}{/if}</span>
									<span class="qty">× {y.skeins}</span>
								</li>
							{/each}
						</ul>
						<p class="muted small">{t(locale, data.preview ? 'advent.inStashPreview' : 'advent.inStash')}</p>
					</section>
				{/if}
			</div>
		{/if}
	{/if}
</dialog>

<style>
	.advent {
		--gold: #f3cf7a;
		--gold-deep: #c8973a;
		--ink: #f6efe4;
		--ink-soft: #cbc3d8;
		--night: #0c0f2c;
		position: relative;
		min-height: 100%;
		min-height: 100dvh;
		color: var(--ink);
		background:
			radial-gradient(1200px 600px at 80% -10%, rgba(120, 90, 200, 0.35), transparent 60%),
			radial-gradient(900px 500px at 0% 0%, rgba(40, 120, 160, 0.25), transparent 60%),
			linear-gradient(180deg, #0c0f2c 0%, #191547 55%, #2a1440 100%);
		overflow: hidden;
		isolation: isolate;
	}
	.snow {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 1;
	}
	.sky {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background-image:
			radial-gradient(1.5px 1.5px at 12% 18%, #fff, transparent),
			radial-gradient(1px 1px at 28% 8%, #fff, transparent),
			radial-gradient(1.5px 1.5px at 47% 22%, #fff8d0, transparent),
			radial-gradient(1px 1px at 63% 12%, #fff, transparent),
			radial-gradient(2px 2px at 78% 26%, #fff, transparent),
			radial-gradient(1px 1px at 90% 6%, #fff, transparent),
			radial-gradient(1px 1px at 6% 40%, #fff, transparent),
			radial-gradient(1.5px 1.5px at 95% 45%, #fff8d0, transparent);
		animation: twinkle 6s ease-in-out infinite alternate;
	}
	@keyframes twinkle {
		from { opacity: 0.55; }
		to { opacity: 1; }
	}
	.inner {
		position: relative;
		z-index: 2;
		max-width: 1080px;
		margin: 0 auto;
		padding: 2rem 1rem 3rem;
		display: grid;
		gap: 1.6rem;
	}
	.preview {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.8rem;
		align-items: center;
		background: rgba(255, 255, 255, 0.08);
		border: 1px dashed rgba(243, 207, 122, 0.6);
		border-radius: 12px;
		padding: 0.6rem 0.9rem;
		font-size: 0.9rem;
	}
	.preview input { width: auto; }
	.preview a { color: var(--gold); }
	.hero { text-align: center; display: grid; gap: 0.5rem; justify-items: center; }
	.eyebrow {
		font-family: 'Cinzel', Georgia, serif;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		font-size: 0.8rem;
		color: var(--gold);
		margin: 0;
	}
	h1 {
		font-family: 'Dancing Script', 'Brush Script MT', cursive;
		font-size: clamp(2.4rem, 7vw, 4.2rem);
		line-height: 1.05;
		margin: 0;
		color: #fff;
		text-shadow: 0 0 24px rgba(243, 207, 122, 0.45);
		text-wrap: balance;
	}
	.lead { max-width: 56ch; color: var(--ink-soft); margin: 0; }
	.progress { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; justify-content: center; color: var(--ink-soft); font-size: 0.9rem; }
	.thread { display: inline-flex; align-items: center; gap: 4px; }
	.thread i {
		width: 26px; height: 3px; border-radius: 2px;
		background: rgba(243, 207, 122, 0.25);
	}
	.thread i.done { background: var(--gold); box-shadow: 0 0 8px var(--gold); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

	/* Doors ---------------------------------------------------------------- */
	.board {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		grid-auto-flow: dense;
		gap: 12px;
		perspective: 1200px;
	}
	@media (max-width: 760px) {
		.board { grid-template-columns: repeat(4, 1fr); gap: 9px; }
	}
	.door {
		position: relative;
		aspect-ratio: 1;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
		border-radius: 10px;
		transform-style: preserve-3d;
		min-width: 0;
	}
	.door.big { grid-column: span 2; grid-row: span 2; }
	/* 22 small doors + door 1 (2×1) + door 24 (2×2) = 28 cells: 7 columns
	   on a wide screen, 4 on a phone, no hole either way. */
	.door.first { grid-column: span 2; aspect-ratio: 2 / 1; }
	.door:focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }
	.inside {
		position: absolute;
		inset: 0;
		border-radius: 10px;
		background: radial-gradient(circle at 50% 30%, #3b2a14, #120c05);
		box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.8);
		display: grid;
		place-items: center;
		overflow: hidden;
		padding: 6px;
		gap: 4px;
	}
	.inside img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; opacity: 0.9; }
	.ititle {
		position: relative;
		font-size: 0.72rem;
		line-height: 1.15;
		color: #fff;
		text-shadow: 0 1px 3px #000;
		align-self: end;
		text-align: center;
		background: rgba(0, 0, 0, 0.45);
		border-radius: 6px;
		padding: 2px 6px;
	}
	.balls { display: flex; gap: 4px; }
	.balls i, .yarns i {
		width: 18px; height: 18px; border-radius: 50%; display: block;
		background: repeating-linear-gradient(120deg, rgba(255, 255, 255, 0.2) 0 2px, transparent 2px 5px), var(--c);
		box-shadow: inset -3px -3px 6px rgba(0, 0, 0, 0.3);
	}
	.leaf {
		position: absolute;
		inset: 0;
		border-radius: 10px;
		transform-origin: left center;
		transition: transform 0.9s cubic-bezier(0.2, 0.7, 0.2, 1);
		background:
			radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.18), transparent 50%),
			repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.03) 0 2px, transparent 2px 6px),
			var(--velvet);
		border: 2px solid var(--gold-deep);
		box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45), inset 0 0 0 3px rgba(0, 0, 0, 0.18);
		display: grid;
		place-items: center;
		backface-visibility: hidden;
	}
	.num {
		font-family: 'Cinzel', Georgia, serif;
		font-weight: 700;
		font-size: clamp(1.3rem, 3.4vw, 2.1rem);
		color: var(--gold);
		text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35);
	}
	.big .num { font-size: clamp(2.4rem, 7vw, 4rem); }
	.ribbon {
		position: absolute;
		top: 6px; right: 8px;
		color: var(--gold);
		font-size: 0.9rem;
	}
	.main .leaf {
		background:
			radial-gradient(circle at 30% 20%, rgba(255, 240, 200, 0.35), transparent 55%),
			repeating-linear-gradient(90deg, rgba(255, 220, 140, 0.08) 0 1px, transparent 1px 7px),
			linear-gradient(135deg, #7a5413, #3d2706);
		border-color: var(--gold);
	}
	.locked .leaf::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 8px;
		background:
			radial-gradient(circle at 20% 80%, rgba(220, 240, 255, 0.35), transparent 40%),
			radial-gradient(circle at 85% 15%, rgba(220, 240, 255, 0.25), transparent 35%),
			linear-gradient(160deg, rgba(200, 225, 255, 0.18), rgba(255, 255, 255, 0.04));
		pointer-events: none;
	}
	.lock {
		position: absolute;
		bottom: 6px;
		left: 0; right: 0;
		text-align: center;
		font-size: 0.66rem;
		color: rgba(240, 245, 255, 0.85);
	}
	.available .leaf { animation: call 2.4s ease-in-out infinite; }
	@keyframes call {
		0%, 100% { box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45), 0 0 0 rgba(243, 207, 122, 0); }
		50% { box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45), 0 0 26px rgba(243, 207, 122, 0.85); }
	}
	.glow {
		position: absolute;
		top: 7px;
		left: 9px;
		width: 10px;
		height: 10px;
		background: #fff6d8;
		clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
		filter: drop-shadow(0 0 4px #ffd77a);
		animation: sparkle 1.8s ease-in-out infinite;
	}
	@keyframes sparkle {
		0%, 100% { transform: scale(0.5) rotate(0deg); opacity: 0.4; }
		50% { transform: scale(1.2) rotate(45deg); opacity: 1; }
	}
	.open .leaf { transform: rotateY(-108deg); pointer-events: none; }
	.door.open:hover .leaf { transform: rotateY(-112deg); }
	.door:not(.open):hover .leaf { transform: rotateY(-8deg); }
	.shake .leaf { animation: shake 0.5s; }
	@keyframes shake {
		20%, 60% { transform: translateX(-4px); }
		40%, 80% { transform: translateX(4px); }
	}
	.legend { text-align: center; color: var(--ink-soft); font-size: 0.85rem; margin: 0; }

	/* Dialog ---------------------------------------------------------------- */
	.scroll {
		width: min(520px, calc(100vw - 32px));
		max-height: calc(100dvh - 40px);
		border: 2px solid #c8973a;
		border-radius: 16px;
		padding: 1.6rem 1.4rem 1.4rem;
		color: #2c1d10;
		background:
			radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.7), transparent 60%),
			linear-gradient(180deg, #fbf1dc, #f1dfba);
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
		overflow: auto;
	}
	.scroll::backdrop { background: rgba(8, 6, 30, 0.72); backdrop-filter: blur(3px); }
	.x {
		position: absolute;
		top: 8px; right: 10px;
		border: 0;
		background: transparent;
		font-size: 1.6rem;
		color: #7a5a2a;
		cursor: pointer;
		padding: 0 6px;
	}
	.dday {
		font-family: 'Cinzel', Georgia, serif;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		font-size: 0.8rem;
		color: #8a6420;
		margin: 0 0 0.4rem;
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.tag { background: #2c1d10; color: #f3cf7a; border-radius: 99px; padding: 1px 8px; letter-spacing: 0.05em; font-size: 0.7rem; }
	.scroll h2 {
		font-family: 'Dancing Script', cursive;
		font-size: 2.1rem;
		line-height: 1.1;
		margin: 0.2rem 0 0.8rem;
		color: #4a1d2a;
	}
	.scroll h3 { font-size: 0.95rem; margin: 1rem 0 0.4rem; color: #5a3b14; }
	.hint {
		white-space: pre-line;
		font-size: 1.08rem;
		line-height: 1.6;
		font-style: italic;
		margin: 0 0 0.8rem;
	}
	.hphoto, .cover { width: 100%; border-radius: 10px; margin: 0.2rem 0 0.8rem; border: 1px solid #d8bf8b; }
	.cover { max-height: 260px; object-fit: cover; }
	/* Ce que contient une porte : le patron, puis la laine, chacun dans son encadré. */
	.gift {
		margin: 0.9rem 0 0;
		padding: 0.8rem 0.9rem;
		border: 1px solid #d8bf8b;
		border-radius: 12px;
		background: rgba(255, 248, 230, 0.55);
	}
	.gift h3 { margin: 0 0 0.5rem; }
	.kicker { margin: 0 0 0.6rem; font-weight: 700; color: #6b4a12; }
	.pat { display: flex; gap: 0.8rem; align-items: flex-start; }
	.pat .cover { width: 110px; height: 140px; flex: none; margin: 0; }
	.pat-text { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
	.pat-title { font-size: 1.05rem; }
	.cover-note { margin: 0; color: #5d4630; line-height: 1.45; }
	.gift .actions { margin-top: 0.8rem; }
	/* Pelotes posées sur la photo du modèle, dans la case ouverte. */
	.balls.on-cover {
		position: absolute;
		right: 6px;
		bottom: 6px;
		z-index: 1;
		padding: 3px 4px;
		border-radius: 999px;
		background: rgba(255, 250, 238, 0.85);
	}
	.big-msg { font-size: 1.15rem; margin: 0.6rem 0 0.2rem; }
	.muted { color: #7d6650; }
	.small { font-size: 0.85rem; }
	.spell { display: grid; gap: 0.4rem; margin-top: 0.6rem; }
	.spell label { font-family: 'Cinzel', Georgia, serif; font-size: 0.85rem; color: #6b4a12; }
	.spell-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.spell-row input {
		flex: 1 1 160px;
		min-width: 0;
		font-size: 1.15rem;
		letter-spacing: 0.08em;
		text-align: center;
		background: #fffaf0;
		color: #2c1d10;
		border: 1.5px solid #c8973a;
		border-radius: 10px;
		padding: 0.6rem 0.8rem;
	}
	.cast, .cta {
		border: 0;
		border-radius: 10px;
		padding: 0.65rem 1.1rem;
		font-weight: 700;
		color: #2c1d10;
		background: linear-gradient(180deg, #ffe19a, #d9a441);
		box-shadow: 0 3px 0 #9a6f22;
		cursor: pointer;
		text-decoration: none;
		display: inline-block;
	}
	.cast:disabled { opacity: 0.6; cursor: default; }
	.cta.alt { background: linear-gradient(180deg, #3a2a6e, #22184a); color: #f6efe4; box-shadow: 0 3px 0 #120c2a; }
	.err { color: #9c1c2b; margin: 0.2rem 0 0; font-weight: 600; }
	.reveal { position: relative; }
	.note { white-space: pre-line; font-style: italic; border-left: 3px solid #c8973a; padding-left: 0.8rem; margin: 0.4rem 0; }
	.yarns { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
	.yarns li { display: flex; gap: 0.6rem; align-items: center; }
	.yarns .qty { margin-left: auto; color: #7d6650; font-variant-numeric: tabular-nums; }
	.actions { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1rem; }
	.sparkle {
		position: absolute;
		left: 50%; top: 40px;
		width: 7px; height: 7px;
		border-radius: 50%;
		background: var(--c);
		box-shadow: 0 0 10px var(--c);
		pointer-events: none;
		animation: fly var(--d) ease-out forwards;
	}
	@keyframes fly {
		from { transform: translate(0, 0) scale(1); opacity: 1; }
		to { transform: translate(var(--x), var(--y)) scale(0.2); opacity: 0; }
	}
	.fresh .leaf { transition-duration: 1.6s; }

	@media (prefers-reduced-motion: reduce) {
		.sky, .available .leaf, .glow, .shake .leaf { animation: none; }
		.leaf { transition: none; }
	}
</style>
