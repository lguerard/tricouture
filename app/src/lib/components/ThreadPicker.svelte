<script lang="ts">
	// Picks a Brother thread by its colour: the current one as a swatch and a
	// name, opening a grid of every thread of the palette. `none` adds a first
	// choice (value 0) for "no thread", e.g. no patch background.
	import { PEC_THREADS, threadHex } from '$lib/embroidery/threads';

	let {
		value = $bindable(),
		label,
		none,
		onpick
	}: { value: number; label: string; none?: string; onpick?: (index: number) => void } = $props();

	const THREADS = PEC_THREADS.filter((th) => th.name !== 'Applique');
	const current = $derived(THREADS.find((th) => th.index === value));
	let open = $state(false);
	let root = $state<HTMLDivElement>();

	function pick(index: number) {
		value = index;
		onpick?.(index);
		open = false;
	}

	// Closes on a click elsewhere or Escape.
	$effect(() => {
		if (!open) return;
		const away = (e: PointerEvent) => !root?.contains(e.target as Node) && (open = false);
		const esc = (e: KeyboardEvent) => e.key === 'Escape' && (open = false);
		document.addEventListener('pointerdown', away);
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('pointerdown', away);
			document.removeEventListener('keydown', esc);
		};
	});
</script>

<div class="picker" bind:this={root}>
	<button type="button" class="current" aria-haspopup="true" aria-expanded={open} aria-label={label} onclick={() => (open = !open)}>
		<span class="swatch" class:empty={!current} style:background={current ? threadHex(current) : undefined}></span>
		<span class="name">{current?.name ?? none ?? ''}</span>
		<span aria-hidden="true">▾</span>
	</button>
	{#if open}
		<div class="grid" role="listbox" aria-label={label}>
			{#if none}
				<button type="button" role="option" aria-selected={value === 0} class="opt none" class:on={value === 0} title={none} onclick={() => pick(0)}>
					<span class="swatch empty"></span>
				</button>
			{/if}
			{#each THREADS as th (th.index)}
				<button
					type="button"
					role="option"
					aria-selected={value === th.index}
					aria-label={th.name}
					class="opt"
					class:on={value === th.index}
					title={th.name}
					onclick={() => pick(th.index)}
				>
					<span class="swatch" style:background={threadHex(th)}></span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.picker {
		position: relative;
		min-width: 0;
		flex: 1;
	}
	.current {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 40px;
		text-align: left;
	}
	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.swatch {
		flex: none;
		display: block;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1px solid var(--border);
	}
	.swatch.empty {
		background: repeating-linear-gradient(45deg, transparent 0 4px, var(--border) 4px 6px);
	}
	.grid {
		position: absolute;
		z-index: 20;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		min-width: 232px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
		gap: 4px;
		padding: 0.5rem;
		background: var(--surface, var(--bg));
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
		max-height: 260px;
		overflow-y: auto;
	}
	.opt {
		padding: 0;
		min-height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border-color: transparent;
		background: transparent;
	}
	.opt .swatch {
		width: 28px;
		height: 28px;
	}
	.opt.on {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
</style>
