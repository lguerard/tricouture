<script lang="ts">
	import { mediaUrl } from '$lib/media';
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
	import { invalidateAll } from '$app/navigation';
	import { craftLabel, difficultyLabel } from '$lib/labels';
	import { t } from '$lib/i18n';
	import { tagStyle } from '$lib/tagColor';
	let { data, form } = $props();
	const locale = $derived(data.locale);
	const p = $derived(data.pattern);

	// Champs suggérés (analyse IA) : tags, type d'objet, créateur·rice, langue,
	// difficulté, tailles, jauge, métrage -- tout ce qui est encore vide.
	let completing = $state(false);
	let completeError = $state('');
	let aiLanguage = $state('fr');
	async function completeWithAi() {
		completing = true;
		completeError = '';
		try {
			const res = await fetch('/api/ai/pattern-info', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ patternId: p.id, language: aiLanguage })
			});
			const d = await res.json();
			if (!res.ok) {
				completeError =
					d.error === 'empty' ? t(locale, 'patterns.detail.completeEmpty') : (d.error ?? t(locale, 'patterns.detail.aiError'));
			} else {
				await invalidateAll();
			}
		} catch {
			completeError = t(locale, 'patterns.detail.aiNetworkError');
		}
		completing = false;
	}

	// Pièces (analyse IA)
	let analyzing = $state(false);
	let analyzeError = $state('');
	async function analyzePieces() {
		analyzing = true;
		analyzeError = '';
		try {
			const res = await fetch('/api/ai/pattern-pieces', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ patternId: p.id })
			});
			const d = await res.json();
			if (!res.ok) {
				analyzeError =
					d.error === 'no-text'
						? t(locale, 'patterns.detail.piecesNoText')
						: d.error === 'empty'
							? t(locale, 'patterns.detail.piecesEmpty')
							: (d.error ?? t(locale, 'patterns.detail.aiError'));
			} else {
				await invalidateAll();
			}
		} catch {
			analyzeError = t(locale, 'patterns.detail.aiNetworkError');
		}
		analyzing = false;
	}

	// A pattern usually arrives as a PDF (uploaded above) or as a link — a
	// Ravelry page, a designer's shop, a blog post. Both go through the same
	// "Source" field, so a value that is a URL is turned into a real link
	// instead of text the person has to select and copy.
	// Only http(s): a javascript: or data: value in an href would run on click.
	function asUrl(v: string): string | null {
		try {
			const u = new URL(v.trim());
			return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
		} catch {
			return null;
		}
	}

	// Cover tools: web search candidates, pasted URL, removal.
	let coverBusy = $state(false);
	let showCoverTools = $state(false);
	const coverEnhance = () => {
		coverBusy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			coverBusy = false;
		};
	};

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
				{#each p.tags ?? [] as tag}<a class="tag" style={tagStyle(tag, data.tagColors)} href={`/patterns?tag=${encodeURIComponent(tag)}`}>{tag}</a>{/each}
				{#if data.isOwner}
					<button type="button" class="tag-suggest" onclick={completeWithAi} disabled={completing}>
						{completing ? t(locale, 'patterns.detail.completing') : t(locale, 'patterns.detail.complete')}
					</button>
					<select class="ai-language" bind:value={aiLanguage} disabled={completing} title={t(locale, 'patterns.detail.completeLanguage')}>
						<option value="fr">Français</option>
						<option value="en">English</option>
					</select>
				{/if}
			</div>
			{#if completeError}<p class="error small">{completeError}</p>{/if}
			{#if !data.isOwner}
				<span class="shared">{t(locale, 'patterns.detail.sharedBy', { name: data.ownerName })}</span>
			{/if}
		</div>
		<div class="owner-actions">
			<a class="btn btn-primary" href={`/projects/new?pattern=${p.id}`}>
				{t(locale, 'patterns.detail.startProject')}
			</a>
			{#if data.isOwner}
				<a class="btn" href={`/patterns/${p.id}/edit`}>{t(locale, 'patterns.detail.edit')}</a>
				<form method="POST" action="?/toggleShare" use:enhance={withFeedback()}>
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
			{/if}
		</div>
	</header>

	<div class="cols">
		<section class="meta card">
			{#if p.coverPath}
				<img class="cover" src={mediaUrl(p.coverPath, 800)} alt={p.title} />
			{:else}
				<div class="cover placeholder">📄</div>
			{/if}
			{#if data.isOwner}
				<button type="button" class="link small" onclick={() => (showCoverTools = !showCoverTools)}>
					🖼️ {t(locale, 'patterns.cover.change')}
				</button>
				{#if showCoverTools || form?.covers || form?.coverError}
					<div class="cover-tools">
						<form method="POST" action="?/findCovers" use:enhance={withFeedback({ inner: coverEnhance })}>
							<button type="submit" disabled={coverBusy}>
								{coverBusy ? t(locale, 'patterns.cover.searching') : `🔍 ${t(locale, 'patterns.cover.search')}`}
							</button>
						</form>
						{#if form?.covers}
							<div class="candidates">
								{#each form.covers as c}
									<form method="POST" action="?/setCover" use:enhance={withFeedback({ success: 'toast.saved', inner: coverEnhance })}>
										<input type="hidden" name="url" value={c.imageUrl} />
										<button type="submit" class="candidate" title={c.title || c.pageUrl} disabled={coverBusy}>
											<img src={c.imageUrl} alt={c.title} loading="lazy" referrerpolicy="no-referrer" />
										</button>
									</form>
								{/each}
							</div>
						{/if}
						<form method="POST" action="?/setCover" class="cover-url" use:enhance={withFeedback({ success: 'toast.saved', inner: coverEnhance })}>
							<input name="url" type="url" required placeholder={t(locale, 'patterns.cover.urlPlaceholder')} />
							<button type="submit" disabled={coverBusy}>{t(locale, 'patterns.cover.use')}</button>
						</form>
						{#if p.coverPath}
							<form method="POST" action="?/removeCover" use:enhance={withFeedback({ inner: coverEnhance })}>
								<button type="submit" class="link small danger">{t(locale, 'patterns.cover.remove')}</button>
							</form>
						{/if}
						{#if form?.coverError}<p class="error small">{form.coverError}</p>{/if}
					</div>
				{/if}
			{/if}
			<dl>
				{#if p.garmentType}<dt>{t(locale, 'patterns.detail.garmentType')}</dt><dd>{p.garmentType}</dd>{/if}
				{#if p.designer}<dt>{t(locale, 'patterns.detail.designer')}</dt><dd>{p.designer}</dd>{/if}
				{#if p.source}
					<dt>{t(locale, 'patterns.detail.source')}</dt>
					<dd>
						{#if asUrl(p.source)}
							<a href={asUrl(p.source)} target="_blank" rel="noopener noreferrer">{p.source}</a>
						{:else}
							{p.source}
						{/if}
					</dd>
				{/if}
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
							<img src={mediaUrl(f.storedPath, 800)} loading="lazy" alt={f.filename} />
						{:else if isPdf(f.mimeType)}
							<iframe src={`/media/${f.storedPath}`} title={f.filename}></iframe>
						{/if}
					</div>
				{/each}
			{/if}
		</section>
	</div>

	<section class="card pieces">
		<div class="pieces-head">
			<h2>{t(locale, 'patterns.detail.piecesTitle')}</h2>
			{#if data.isOwner}
				<button type="button" onclick={analyzePieces} disabled={analyzing}>
					{analyzing ? t(locale, 'patterns.detail.piecesAnalyzing') : t(locale, 'patterns.detail.piecesAnalyze')}
				</button>
			{/if}
		</div>
		{#if analyzeError}<p class="error">{analyzeError}</p>{/if}
		{#if data.pieces.length === 0}
			<p class="muted small">{t(locale, 'patterns.detail.piecesEmptyList')}</p>
		{:else}
			<ul class="piece-list">
				{#each data.pieces as piece}
					<li>
						<span>{piece.name}</span>
						{#if data.isOwner && (p.craft === 'tricot' || p.craft === 'crochet')}
							<form method="POST" action="?/updatePieceDefaults" use:enhance={withFeedback({ success: 'toast.saved' })} class="piece-default">
								<input type="hidden" name="pieceId" value={piece.id} />
								<input
									name="defaultTotalRows"
									type="number"
									min="1"
									placeholder={t(locale, 'patterns.detail.piecesRowsPlaceholder')}
									value={piece.defaultTotalRows ?? ''}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								/>
							</form>
						{:else if data.isOwner && p.craft === 'couture'}
							<form method="POST" action="?/updatePieceDefaults" use:enhance={withFeedback({ success: 'toast.saved' })} class="piece-default">
								<input type="hidden" name="pieceId" value={piece.id} />
								<input
									name="quantity"
									type="number"
									min="1"
									placeholder={t(locale, 'patterns.detail.piecesQuantityPlaceholder')}
									value={piece.quantity ?? ''}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								/>
							</form>
						{:else if piece.defaultTotalRows}
							<span class="muted small">{t(locale, 'patterns.detail.piecesRowsBadge', { n: piece.defaultTotalRows })}</span>
						{:else if piece.quantity}
							<span class="muted small">{t(locale, 'patterns.detail.piecesQuantityBadge', { n: piece.quantity })}</span>
						{/if}
						{#if data.isOwner}
							<form method="POST" action="?/removePiece" use:enhance={withFeedback()}>
								<input type="hidden" name="pieceId" value={piece.id} />
								<button type="submit" class="link-btn" title={t(locale, 'patterns.detail.piecesRemove')}>✕</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.isOwner}
			<form method="POST" action="?/addPiece" use:enhance={withFeedback({ success: 'toast.saved' })} class="add-piece">
				<input name="name" placeholder={t(locale, 'patterns.detail.piecesAddPlaceholder')} required />
				<button type="submit">{t(locale, 'patterns.detail.piecesAdd')}</button>
			</form>
		{/if}
	</section>

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
	.small {
		font-size: 0.82rem;
	}
	.tag-suggest {
		font-size: 0.78rem;
		padding: 0.15rem 0.6rem;
		vertical-align: middle;
	}
	.ai-language {
		width: auto;
		display: inline-block;
		font-size: 0.78rem;
		padding: 0.15rem 0.4rem;
		vertical-align: middle;
	}
	.pieces {
		margin-top: 1.2rem;
	}
	.pieces-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	.piece-list {
		list-style: none;
		margin: 0.8rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.piece-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.4rem 0.6rem;
		background: var(--accent-soft);
		border-radius: var(--radius);
	}
	.piece-default input {
		width: 4.5rem;
	}
	.link-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--muted);
		padding: 0 0.3rem;
	}
	.link-btn:hover {
		color: var(--text);
	}
	.add-piece {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.8rem;
	}
	.add-piece input {
		flex: 1;
	}
	.copilot {
		margin-top: 1.2rem;
	}
	.cover {
		width: 100%;
		aspect-ratio: 4 / 5;
		object-fit: cover;
		border-radius: var(--radius);
		margin-bottom: 0.4rem;
	}
	.cover.placeholder {
		display: grid;
		place-items: center;
		font-size: 3rem;
		background: var(--accent-soft);
	}
	.cover-tools {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0.5rem 0 1rem;
	}
	.candidates {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
	}
	.candidate {
		padding: 0;
		border: 2px solid transparent;
		border-radius: var(--radius);
		overflow: hidden;
		cursor: pointer;
	}
	.candidate:hover {
		border-color: var(--accent);
	}
	.candidate img {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
	}
	.cover-url {
		display: flex;
		gap: 0.4rem;
	}
	.cover-url input {
		flex: 1;
		min-width: 0;
	}
	.link {
		background: none;
		border: none;
		padding: 0;
		color: var(--accent);
		cursor: pointer;
	}
	.link.danger {
		color: var(--danger);
	}
	.small {
		font-size: 0.82rem;
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
		color: var(--on-accent);
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
