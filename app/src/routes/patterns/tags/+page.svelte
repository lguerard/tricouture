<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import { tagStyle } from '$lib/tagColor';

	let { data, form } = $props();
	const locale = $derived(data.locale);

	// One-click quick picks: every color currently in use across the user's
	// tags (auto-assigned or manually picked) plus the site's own palette,
	// deduped by hex -- reusing a color already in the library, or one of the
	// app's defaults, shouldn't mean re-typing its hex by hand. The picker
	// below is never limited to this list, though -- see the color input.
	const quickSwatches = $derived.by(() => {
		const seen = new Map<string, { bg: string; fg: string }>();
		for (const c of data.colors.values()) seen.set(c.bg, c);
		for (const c of data.palette) if (!seen.has(c.bg)) seen.set(c.bg, c);
		return [...seen.values()];
	});

	// Which tag's picker is currently open (one at a time), and the color
	// input's live value while it's open.
	let openTag = $state<string | null>(null);
	let customColor = $state('#c6a6d6');
	let customForm: HTMLFormElement | undefined = $state();

	function openPicker(tag: string) {
		if (openTag === tag) {
			openTag = null;
			return;
		}
		customColor = data.colors.get(tag)?.bg ?? '#c6a6d6';
		openTag = tag;
	}

	const afterSubmit = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			openTag = null;
		};
	};
</script>

<div class="container narrow">
	<h1>{t(locale, 'patterns.tags.title')}</h1>
	<p class="muted">{t(locale, 'patterns.tags.subtitle')}</p>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	{#if data.allTags.length === 0}
		<p class="muted">{t(locale, 'patterns.tags.empty')}</p>
	{:else}
		<ul class="list">
			{#each data.allTags as tag}
				<li class="row card">
					<span class="tag" style={tagStyle(tag, data.colors)}>{tag}</span>
					<div class="actions">
						{#if data.overriddenTags.includes(tag)}
							<form method="POST" action="?/resetColor" use:enhance>
								<input type="hidden" name="tag" value={tag} />
								<button class="btn small" type="submit">{t(locale, 'patterns.tags.reset')}</button>
							</form>
						{/if}
						<button class="btn small" type="button" onclick={() => openPicker(tag)}>
							{t(locale, 'patterns.tags.changeColor')}
						</button>
					</div>

					{#if openTag === tag}
						<div class="picker">
							<div class="swatches">
								{#each quickSwatches as color}
									<form method="POST" action="?/setColor" use:enhance={afterSubmit}>
										<input type="hidden" name="tag" value={tag} />
										<input type="hidden" name="bg" value={color.bg} />
										<button
											class="swatch"
											type="submit"
											style={`background:${color.bg};color:${color.fg}`}
											aria-label={color.bg}
											title={color.bg}
										>A</button>
									</form>
								{/each}
							</div>

							<form
								class="custom"
								method="POST"
								action="?/setColor"
								bind:this={customForm}
								use:enhance={afterSubmit}
							>
								<input type="hidden" name="tag" value={tag} />
								<label class="visually-hidden" for={`picker-${tag}`}>{t(locale, 'patterns.tags.customColor')}</label>
								<input
									id={`picker-${tag}`}
									type="color"
									name="bg"
									bind:value={customColor}
									onchange={() => customForm?.requestSubmit()}
								/>
								<input
									class="hex"
									type="text"
									bind:value={customColor}
									pattern="#[0-9a-fA-F]{6}"
									maxlength="7"
									placeholder="#c6a6d6"
								/>
								<button class="btn small" type="submit">{t(locale, 'patterns.tags.apply')}</button>
							</form>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.narrow {
		max-width: 640px;
	}
	h1 {
		margin-bottom: 0.2rem;
	}
	.list {
		list-style: none;
		margin: 1.2rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		padding: 0.7rem 0.9rem;
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}
	.btn.small {
		padding: 0.3rem 0.6rem;
		font-size: 0.82rem;
	}
	.picker {
		flex-basis: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--border);
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.swatch {
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		border-radius: 50%;
		border: 1px solid var(--border);
		font-size: 0;
	}
	.swatch:hover {
		border-color: var(--accent);
	}
	.custom {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.custom input[type='color'] {
		width: 2.4rem;
		height: 2.2rem;
		padding: 0.15rem;
		flex: none;
	}
	.custom .hex {
		width: 8rem;
		flex: none;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
