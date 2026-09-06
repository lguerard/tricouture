<script lang="ts">
	import { enhance } from '$app/forms';
	import { craftLabel, CRAFTS } from '$lib/labels';
	import { t } from '$lib/i18n';
	let { data, form } = $props();
	const locale = $derived(data.locale);
	let importing = $state(false);
</script>

<div class="container narrow">
	<a href="/patterns" class="muted">{t(locale, 'patterns.import.back')}</a>
	<h1>{t(locale, 'patterns.import.title')}</h1>
	<p class="muted">{t(locale, 'patterns.import.intro')}</p>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	{#if form?.created?.length}
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

	<form
		method="POST"
		enctype="multipart/form-data"
		use:enhance={() => {
			importing = true;
			return async ({ update }) => {
				importing = false;
				await update();
			};
		}}
	>
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

		<button type="submit" class="btn btn-primary" disabled={importing}>
			{importing ? t(locale, 'patterns.import.importing') : t(locale, 'patterns.import.submit')}
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
