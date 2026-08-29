<script lang="ts">
	import { statusLabel, STATUS_ORDER, craftLabel } from '$lib/labels';
	import { t } from '$lib/i18n';
	let { data, form } = $props();
	const locale = $derived(data.locale);
</script>

<div class="container narrow">
	<a href="/projects/board" class="muted">{t(locale, 'projects.new.back')}</a>
	<h1>{t(locale, 'projects.new.title')}</h1>

	<form method="POST">
		<div class="field">
			<label for="title">{t(locale, 'projects.new.titleField')}</label>
			<input id="title" name="title" required />
		</div>
		<div class="field">
			<label for="patternId">{t(locale, 'projects.new.linkedPattern')}</label>
			<select id="patternId" name="patternId">
				<option value="">{t(locale, 'projects.new.none')}</option>
				{#each data.patternOptions as p}
					<option value={p.id} selected={data.presetPattern === p.id}>
						{p.title} — {craftLabel(locale, p.craft)}{p.mine ? '' : ` (${t(locale, 'projects.new.sharedPattern')})`}
					</option>
				{/each}
			</select>
		</div>
		<div class="two">
			<div class="field">
				<label for="status">{t(locale, 'projects.new.column')}</label>
				<select id="status" name="status">
					{#each STATUS_ORDER as s}<option value={s}>{statusLabel(locale, s)}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="totalRows">{t(locale, 'projects.new.totalRows')}</label>
				<input id="totalRows" name="totalRows" type="number" min="0" />
			</div>
		</div>
		<div class="field">
			<label for="deadline">{t(locale, 'projects.new.deadline')}</label>
			<input id="deadline" name="deadline" type="date" />
		</div>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<button class="btn-primary" type="submit">{t(locale, 'projects.new.submit')}</button>
	</form>
</div>

<style>
	.narrow {
		max-width: 560px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
	}
</style>
