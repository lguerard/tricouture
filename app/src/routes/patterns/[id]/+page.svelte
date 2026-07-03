<script lang="ts">
	import { enhance } from '$app/forms';
	import { craftLabel, difficultyLabel } from '$lib/labels';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);
	const p = $derived(data.pattern);

	function isImage(mime: string) {
		return mime.startsWith('image/');
	}
	function isPdf(mime: string) {
		return mime === 'application/pdf';
	}

	// Copilote IA
	let question = $state('');
	let answer = $state('');
	let aiBusy = $state(false);
	let aiErr = $state('');
	async function askCopilot() {
		aiBusy = true;
		aiErr = '';
		answer = '';
		try {
			const res = await fetch('/api/ai/copilot', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ patternId: p.id, question })
			});
			const d = await res.json();
			if (!res.ok) aiErr = d.error ?? t(locale, 'patterns.detail.aiError');
			else answer = d.result;
		} catch {
			aiErr = t(locale, 'patterns.detail.aiNetworkError');
		}
		aiBusy = false;
	}
</script>

<div class="container">
	<a href="/patterns" class="muted">{t(locale, 'patterns.detail.back')}</a>

	<header class="head">
		<div>
			<h1>{p.title}</h1>
			<div>
				<span class="tag">{craftLabel(locale, p.craft)}</span>
				{#each p.tags ?? [] as tag}<span class="tag">{tag}</span>{/each}
			</div>
			{#if !data.isOwner}
				<span class="shared">{t(locale, 'patterns.detail.sharedBy', { name: data.ownerName })}</span>
			{/if}
		</div>
		{#if data.isOwner}
			<div class="owner-actions">
				<form method="POST" action="?/toggleShare" use:enhance>
					<button type="submit" class:on={p.isShared}>
						{p.isShared ? t(locale, 'patterns.detail.shareOn') : t(locale, 'patterns.detail.share')}
					</button>
				</form>
				<form
					method="POST"
					action="?/delete"
					onsubmit={(e) => {
						if (!confirm(t(locale, 'patterns.detail.deleteConfirm'))) e.preventDefault();
					}}
				>
					<button type="submit">{t(locale, 'patterns.detail.delete')}</button>
				</form>
			</div>
		{/if}
	</header>

	<div class="cols">
		<section class="meta card">
			<dl>
				{#if p.garmentType}<dt>{t(locale, 'patterns.detail.garmentType')}</dt><dd>{p.garmentType}</dd>{/if}
				{#if p.designer}<dt>{t(locale, 'patterns.detail.designer')}</dt><dd>{p.designer}</dd>{/if}
				{#if p.source}<dt>{t(locale, 'patterns.detail.source')}</dt><dd>{p.source}</dd>{/if}
				{#if p.difficulty}<dt>{t(locale, 'patterns.detail.difficulty')}</dt><dd>{difficultyLabel(locale, p.difficulty)}</dd>{/if}
				{#if p.language}<dt>{t(locale, 'patterns.detail.language')}</dt><dd>{p.language}</dd>{/if}
				{#if p.sizes}<dt>{t(locale, 'patterns.detail.sizes')}</dt><dd>{p.sizes}</dd>{/if}
				{#if p.gaugeStitches || p.gaugeRows}
					<dt>{t(locale, 'patterns.detail.gauge')}</dt><dd>{t(locale, 'patterns.detail.gaugeValue', { stitches: p.gaugeStitches ?? '?', rows: p.gaugeRows ?? '?' })}</dd>
				{/if}
				{#if p.yardageRequired}<dt>{t(locale, 'patterns.detail.yardage')}</dt><dd>{p.yardageRequired} m</dd>{/if}
			</dl>
			{#if p.notes}<p class="notes">{p.notes}</p>{/if}
		</section>

		<section class="files">
			{#if data.files.length === 0}
				<p class="muted">{t(locale, 'patterns.detail.noFiles')}</p>
			{:else}
				{#each data.files as f}
					<div class="file card">
						<div class="file-head">
							<strong>{f.filename}</strong>
							<a href={`/media/${f.storedPath}`} target="_blank" rel="noopener">{t(locale, 'patterns.detail.open')}</a>
						</div>
						{#if isImage(f.mimeType)}
							<img src={`/media/${f.storedPath}`} alt={f.filename} />
						{:else if isPdf(f.mimeType)}
							<iframe src={`/media/${f.storedPath}`} title={f.filename}></iframe>
						{/if}
					</div>
				{/each}
			{/if}
		</section>
	</div>

	<section class="card copilot">
		<h2>{t(locale, 'patterns.detail.copilotTitle')}</h2>
		<div class="ask">
			<input bind:value={question} placeholder={t(locale, 'patterns.detail.askPlaceholder')} onkeydown={(e) => e.key === 'Enter' && question && askCopilot()} />
			<button class="btn-primary" onclick={askCopilot} disabled={aiBusy || !question}>{aiBusy ? '…' : t(locale, 'patterns.detail.ask')}</button>
		</div>
		{#if aiErr}<p class="error">{aiErr}</p>{/if}
		{#if answer}<div class="answer">{answer}</div>{/if}
	</section>
</div>

<style>
	.copilot {
		margin-top: 1.2rem;
	}
	.ask {
		display: flex;
		gap: 0.5rem;
	}
	.ask input {
		flex: 1;
	}
	.answer {
		margin-top: 0.8rem;
		white-space: pre-wrap;
		background: var(--accent-soft);
		padding: 0.8rem;
		border-radius: var(--radius);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	.owner-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.owner-actions button.on {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
	.shared {
		display: inline-block;
		margin-top: 0.4rem;
		font-size: 0.82rem;
		color: var(--accent);
	}
	.cols {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 1.2rem;
		margin-top: 1rem;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3rem 0.8rem;
		margin: 0;
	}
	dt {
		color: var(--muted);
		font-size: 0.85rem;
	}
	dd {
		margin: 0;
	}
	.notes {
		margin-top: 0.8rem;
		white-space: pre-wrap;
	}
	.files {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}
	.file-head {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.file img {
		max-width: 100%;
		border-radius: var(--radius);
	}
	.file iframe {
		width: 100%;
		height: 70vh;
		border: none;
		border-radius: var(--radius);
	}
	@media (max-width: 720px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
