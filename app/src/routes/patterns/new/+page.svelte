<script lang="ts">
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
	import { page } from '$app/stores';
	import { craftLabel, CRAFTS, difficultyLabel } from '$lib/labels';
	import { t } from '$lib/i18n';
	let { data, form } = $props();
	const locale = $derived(data.locale);
	// Opened from a craft submenu (/patterns/new?craft=tricot) → preselect it.
	const presetCraft = $derived($page.url.searchParams.get('craft') ?? '');
	const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5];
	let submitting = $state(false);

	// Pre-fill from the pattern's link: reads the page's title and author so
	// they do not have to be retyped. Only fills fields left empty -- what the
	// person typed themselves always wins over what a web page claims.
	let fetching = $state(false);
	let fetchError = $state('');

	async function fillFromLink() {
		const src = document.querySelector<HTMLInputElement>('#source');
		const url = src?.value.trim();
		if (!url) return;
		fetching = true;
		fetchError = '';
		try {
			const res = await fetch('/api/patterns/from-url', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url })
			});
			if (!res.ok) throw new Error(String(res.status));
			const meta = await res.json();
			const title = document.querySelector<HTMLInputElement>('#title');
			const designer = document.querySelector<HTMLInputElement>('#designer');
			if (title && !title.value.trim() && meta.title) title.value = meta.title;
			if (designer && !designer.value.trim() && meta.designer) designer.value = meta.designer;
			if (src && meta.source) src.value = meta.source;
			if (!meta.title && !meta.designer) fetchError = t(locale, 'patterns.new.fetchEmpty');
		} catch {
			fetchError = t(locale, 'patterns.new.fetchFailed');
		} finally {
			fetching = false;
		}
	}
</script>

<div class="container narrow">
	<a href="/patterns" class="muted">{t(locale, 'patterns.new.back')}</a>
	<h1>{t(locale, 'patterns.new.title')}</h1>

	<form
		method="POST"
		enctype="multipart/form-data"
		use:enhance={withFeedback({ success: 'toast.saved', inner: () => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		} })}
	>
		<div class="field">
			<label for="title">{t(locale, 'patterns.new.titleLabel')}</label>
			<input id="title" name="title" required />
		</div>

		<div class="two">
			<div class="field">
				<label for="craft">{t(locale, 'patterns.new.typeLabel')}</label>
				<select id="craft" name="craft" required>
					{#each CRAFTS as c}<option value={c} selected={presetCraft === c}>{craftLabel(locale, c)}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="garmentType">{t(locale, 'patterns.new.garmentTypeLabel')}</label>
				<input id="garmentType" name="garmentType" placeholder={t(locale, 'patterns.new.garmentTypePlaceholder')} />
			</div>
		</div>

		<div class="two">
			<div class="field">
				<label for="designer">{t(locale, 'patterns.new.designerLabel')}</label>
				<input id="designer" name="designer" />
			</div>
			<div class="field">
				<label for="source">{t(locale, 'patterns.new.sourceLabel')}</label>
				<div class="source-row">
					<input id="source" name="source" placeholder={t(locale, 'patterns.new.sourcePlaceholder')} />
					<button type="button" onclick={fillFromLink} disabled={fetching}>
						{fetching ? t(locale, 'patterns.new.fetching') : t(locale, 'patterns.new.fetchFromLink')}
					</button>
				</div>
				{#if fetchError}<span class="muted small">{fetchError}</span>{/if}
			</div>
		</div>

		<div class="two">
			<div class="field">
				<label for="difficulty">{t(locale, 'patterns.new.difficultyLabel')}</label>
				<select id="difficulty" name="difficulty">
					<option value="">—</option>
					{#each DIFFICULTY_LEVELS as lvl}<option value={lvl}>{difficultyLabel(locale, lvl)}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="language">{t(locale, 'patterns.new.languageLabel')}</label>
				<input id="language" name="language" placeholder={t(locale, 'patterns.new.languagePlaceholder')} />
			</div>
		</div>

		<div class="two">
			<div class="field">
				<label for="sizes">{t(locale, 'patterns.new.sizesLabel')}</label>
				<input id="sizes" name="sizes" placeholder={t(locale, 'patterns.new.sizesPlaceholder')} />
			</div>
			<div class="field">
				<label for="yardageRequired">{t(locale, 'patterns.new.yardageLabel')}</label>
				<input id="yardageRequired" name="yardageRequired" type="number" min="0" />
			</div>
		</div>

		<div class="two">
			<div class="field">
				<label for="gaugeStitches">{t(locale, 'patterns.new.gaugeStitchesLabel')}</label>
				<input id="gaugeStitches" name="gaugeStitches" type="number" min="0" />
			</div>
			<div class="field">
				<label for="gaugeRows">{t(locale, 'patterns.new.gaugeRowsLabel')}</label>
				<input id="gaugeRows" name="gaugeRows" type="number" min="0" />
			</div>
		</div>

		<div class="field">
			<label for="tags">{t(locale, 'patterns.new.tagsLabel')}</label>
			<input id="tags" name="tags" placeholder={t(locale, 'patterns.new.tagsPlaceholder')} />
		</div>

		<div class="field">
			<label for="notes">{t(locale, 'patterns.new.notesLabel')}</label>
			<textarea id="notes" name="notes" rows="3"></textarea>
		</div>

		<div class="field">
			<label for="files">{t(locale, 'patterns.new.filesLabel')}</label>
			<input id="files" name="files" type="file" multiple accept=".pdf,image/*" />
			<span class="muted small">{t(locale, 'patterns.new.filesHint')}</span>
		</div>

		<div class="field">
			<label for="aiLanguage">{t(locale, 'patterns.new.aiLanguageLabel')}</label>
			<select id="aiLanguage" name="aiLanguage">
				<option value="fr" selected>Français</option>
				<option value="en">English</option>
			</select>
			<span class="muted small">{t(locale, 'patterns.new.aiLanguageHint')}</span>
		</div>

		<div class="field">
			<label for="coverUrl">{t(locale, 'patterns.new.coverUrlLabel')}</label>
			<input id="coverUrl" name="coverUrl" type="url" placeholder="https://…" />
			<span class="muted small">{t(locale, 'patterns.new.coverUrlHint')}</span>
		</div>

		{#if form?.error}<p class="error">{form.error}</p>{/if}

		<button class="btn-primary" type="submit" disabled={submitting}>
			{submitting ? t(locale, 'patterns.new.submitting') : t(locale, 'patterns.new.submit')}
		</button>
	</form>
</div>

<style>
	.narrow {
		max-width: 680px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
	}
	.small {
		font-size: 0.8rem;
	}
	@media (max-width: 560px) {
		.two {
			grid-template-columns: 1fr;
		}
	}

	.source-row {
		display: flex;
		gap: 0.4rem;
	}
	.source-row input {
		flex: 1;
		min-width: 0;
	}
</style>
