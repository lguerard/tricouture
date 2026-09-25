<script lang="ts">
	import { goto } from '$app/navigation';
	import { t, type Locale } from '$lib/i18n';
	import { mediaUrl } from '$lib/media';
	import type { SearchHit } from '../../routes/api/search/+server';

	let { locale, open = $bindable(false) }: { locale: Locale; open?: boolean } = $props();

	const KIND_ICON: Record<SearchHit['kind'], string> = {
		pattern: '📄',
		project: '🧶',
		yarn: '🧵',
		fabric: '✂️',
		notion: '🔘'
	};
	const KIND_GROUP: Record<SearchHit['kind'], string> = {
		pattern: 'search.patterns',
		project: 'search.projects',
		yarn: 'search.stash',
		fabric: 'search.stash',
		notion: 'search.stash'
	};

	let query = $state('');
	let hits = $state<SearchHit[]>([]);
	let loading = $state(false);
	let selected = $state(0);
	let input = $state<HTMLInputElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;

	$effect(() => {
		if (open) {
			query = '';
			hits = [];
			selected = 0;
			queueMicrotask(() => input?.focus());
		}
	});

	function onInput() {
		clearTimeout(timer);
		controller?.abort();
		const q = query.trim();
		if (q.length < 2) {
			hits = [];
			loading = false;
			return;
		}
		loading = true;
		timer = setTimeout(async () => {
			controller = new AbortController();
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
				hits = res.ok ? ((await res.json()).hits as SearchHit[]) : [];
				selected = 0;
				loading = false;
			} catch (e) {
				if ((e as Error).name !== 'AbortError') loading = false;
			}
		}, 200);
	}

	function pick(hit: SearchHit | undefined) {
		if (!hit) return;
		open = false;
		goto(hit.href);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selected = Math.min(selected + 1, hits.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selected = Math.max(selected - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			pick(hits[selected]);
		} else if (e.key === 'Escape') {
			open = false;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			open = !open;
		}
	}}
/>

{#if open}
	<div class="overlay" role="presentation" onclick={() => (open = false)}>
		<div
			class="palette"
			role="dialog"
			aria-modal="true"
			aria-label={t(locale, 'search.open')}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={onKeydown}
		>
			<input
				bind:this={input}
				bind:value={query}
				oninput={onInput}
				placeholder={t(locale, 'search.placeholder')}
				role="combobox"
				aria-expanded={hits.length > 0}
				aria-controls="search-results"
				aria-activedescendant={hits[selected] ? `hit-${selected}` : undefined}
				autocomplete="off"
			/>
			<ul id="search-results" role="listbox">
				{#each hits as hit, i (hit.kind + hit.id)}
					{#if i === 0 || KIND_GROUP[hits[i - 1].kind] !== KIND_GROUP[hit.kind]}
						<li class="group" role="presentation">{t(locale, KIND_GROUP[hit.kind])}</li>
					{/if}
					<li id={`hit-${i}`} role="option" aria-selected={i === selected}>
						<button type="button" class:sel={i === selected} onmouseenter={() => (selected = i)} onclick={() => pick(hit)}>
							{#if hit.image}
								<img src={mediaUrl(hit.image, 200)} alt="" loading="lazy" />
							{:else}
								<span class="ico">{KIND_ICON[hit.kind]}</span>
							{/if}
							<span class="txt">
								<strong>{hit.title}</strong>
								{#if hit.subtitle}<small>{hit.subtitle}</small>{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
			{#if query.trim().length >= 2 && !loading && hits.length === 0}
				<p class="empty">{t(locale, 'search.empty')}</p>
			{:else if query.trim().length < 2}
				<p class="empty">{t(locale, 'search.hint')}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 1100;
		background: rgba(0, 0, 0, 0.35);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 10vh 1rem 1rem;
	}
	.palette {
		width: min(560px, 100%);
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}
	input {
		border: none;
		border-bottom: 1px solid var(--border);
		border-radius: 0;
		padding: 0.9rem 1rem;
		font-size: 1.05rem;
	}
	input:focus {
		outline: none;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0.3rem;
		overflow-y: auto;
	}
	.group {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
		padding: 0.6rem 0.6rem 0.2rem;
	}
	li button {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		width: 100%;
		text-align: left;
		border: none;
		background: none;
		padding: 0.45rem 0.6rem;
	}
	li button.sel {
		background: var(--accent-soft);
	}
	img,
	.ico {
		width: 36px;
		height: 36px;
		flex: none;
		border-radius: 6px;
		object-fit: cover;
		display: grid;
		place-items: center;
		font-size: 1.2rem;
		background: var(--accent-soft);
	}
	.txt {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.txt strong,
	.txt small {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	small {
		color: var(--muted);
	}
	.empty {
		color: var(--muted);
		padding: 0.8rem 1rem;
		margin: 0;
		font-size: 0.9rem;
	}
</style>
