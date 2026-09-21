<script lang="ts">
	import { craftLabel, CRAFTS } from '$lib/labels';
	import { t } from '$lib/i18n';
	let { data, form } = $props();
	const locale = $derived(data.locale);

	// Client-side batch state (used when JS runs, i.e. almost always): each
	// selected file is uploaded to /api/patterns/import-one as its own
	// request instead of the whole batch going out as one giant multipart
	// POST. That keeps every request small regardless of batch size, which
	// matters both for the app's own memory and for any reverse proxy/CDN in
	// front with its own body-size cap (e.g. Cloudflare's ~100MB/request).
	// Without JS, the <form> below falls back to the old one-request action.
	const MAX_FILES = 60;
	let importing = $state(false);
	let progressDone = $state(0);
	let progressTotal = $state(0);
	let clientError = $state('');
	let results = $state<{ created: { id: string; title: string }[]; skipped: string[] } | null>(null);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const formEl = e.currentTarget as HTMLFormElement;
		const fd = new FormData(formEl);
		const craft = String(fd.get('craft') ?? '');
		const tags = String(fd.get('tags') ?? '');
		const aiLanguage = String(fd.get('aiLanguage') ?? 'fr');
		const files = (fd.getAll('files') as File[]).filter((f) => f instanceof File && f.size > 0);

		clientError = '';
		results = null;

		if (files.length === 0) {
			clientError = t(locale, 'patterns.import.error.noFiles');
			return;
		}
		if (files.length > MAX_FILES) {
			clientError = t(locale, 'patterns.import.error.tooMany', { max: MAX_FILES });
			return;
		}

		importing = true;
		progressDone = 0;
		progressTotal = files.length;
		const created: { id: string; title: string }[] = [];
		const skipped: string[] = [];

		for (const file of files) {
			try {
				const oneFd = new FormData();
				oneFd.set('file', file);
				oneFd.set('craft', craft);
				oneFd.set('tags', tags);
				oneFd.set('aiLanguage', aiLanguage);
				const res = await fetch('/api/patterns/import-one', { method: 'POST', body: oneFd });
				const data = await res.json();
				if (res.ok && data.ok) created.push({ id: data.id, title: data.title });
				else skipped.push(data.name ?? file.name);
			} catch {
				// A network blip on one file must not abort the rest of the batch.
				skipped.push(file.name);
			}
			progressDone++;
		}

		results = { created, skipped };
		importing = false;
	}
</script>

<div class="container narrow">
	<a href="/patterns" class="muted">{t(locale, 'patterns.import.back')}</a>
	<h1>{t(locale, 'patterns.import.title')}</h1>
	<p class="muted">{t(locale, 'patterns.import.intro')}</p>

	{#if clientError || form?.error}
		<p class="error">{clientError || form?.error}</p>
	{/if}

	{#if results}
		<section class="card result">
			<h2>{t(locale, 'patterns.import.doneTitle', { n: results.created.length })}</h2>
			<ul>
				{#each results.created as c (c.id)}
					<li><a href={`/patterns/${c.id}`}>{c.title}</a></li>
				{/each}
			</ul>
			{#if results.skipped.length}
				<p class="muted small">
					{t(locale, 'patterns.import.skipped', { files: results.skipped.join(', ') })}
				</p>
			{/if}
		</section>
	{:else if form?.created?.length}
		<section class="card result">
			<h2>{t(locale, 'patterns.import.doneTitle', { n: form.created.length })}</h2>
			<ul>
				{#each form.created as c (c.id)}
					<li><a href={`/patterns/${c.id}`}>{c.title}</a></li>
				{/each}
			</ul>
			{#if form.skipped?.length}
				<p class="muted small">
					{t(locale, 'patterns.import.skipped', { files: form.skipped.join(', ') })}
				</p>
			{/if}
		</section>
	{/if}

	<form method="POST" enctype="multipart/form-data" onsubmit={handleSubmit}>
		<div class="field">
			<label for="files">{t(locale, 'patterns.import.filesLabel')}</label>
			<input id="files" name="files" type="file" multiple accept=".pdf,application/pdf" required />
			<span class="muted small">{t(locale, 'patterns.import.filesHint')}</span>
		</div>

		<div class="field">
			<label for="craft">{t(locale, 'patterns.import.craftLabel')}</label>
			<select id="craft" name="craft" required>
				{#each CRAFTS as c}
					<option value={c}>{craftLabel(locale, c)}</option>
				{/each}
			</select>
			<span class="muted small">{t(locale, 'patterns.import.craftHint')}</span>
		</div>

		<div class="field">
			<label for="tags">{t(locale, 'patterns.import.tagsLabel')}</label>
			<input id="tags" name="tags" placeholder={t(locale, 'patterns.import.tagsPlaceholder')} />
		</div>

		<div class="field">
			<label for="aiLanguage">{t(locale, 'patterns.import.aiLanguageLabel')}</label>
			<select id="aiLanguage" name="aiLanguage">
				<option value="fr" selected>Français</option>
				<option value="en">English</option>
			</select>
			<span class="muted small">{t(locale, 'patterns.import.aiLanguageHint')}</span>
		</div>

		<button type="submit" class="btn btn-primary" disabled={importing}>
			{importing
				? t(locale, 'patterns.import.progress', { done: progressDone, total: progressTotal })
				: t(locale, 'patterns.import.submit')}
		</button>
	</form>
</div>

<style>
	.field {
		display: grid;
		gap: 0.3rem;
		margin-bottom: 1rem;
	}
	.result ul {
		margin: 0.4rem 0 0;
		padding-left: 1.1rem;
	}
	.error {
		color: var(--danger, #b3261e);
	}
	.small {
		font-size: 0.82rem;
	}
</style>
