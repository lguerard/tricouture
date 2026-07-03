<script lang="ts">
	import { craftLabel, CRAFTS, difficultyLabel } from '$lib/labels';
	import { t } from '$lib/i18n';
	let { data } = $props();
	const locale = $derived(data.locale);
</script>

<div class="container">
	<header class="head">
		<h1>{t(locale, 'patterns.list.title')}</h1>
		<a class="btn btn-primary" href="/patterns/new">{t(locale, 'patterns.list.new')}</a>
	</header>

	<form class="filters" method="GET">
		<input name="q" placeholder={t(locale, 'patterns.list.searchPlaceholder')} value={data.q} />
		<select name="craft" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
			<option value="">{t(locale, 'patterns.list.allTypes')}</option>
			{#each CRAFTS as c}
				<option value={c} selected={data.craftFilter === c}>{craftLabel(locale, c)}</option>
			{/each}
		</select>
		<select name="scope" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
			<option value="" selected={data.scope === ''}>{t(locale, 'patterns.list.allScope')}</option>
			<option value="mine" selected={data.scope === 'mine'}>{t(locale, 'patterns.list.mine')}</option>
			<option value="shared" selected={data.scope === 'shared'}>{t(locale, 'patterns.list.sharedWithMe')}</option>
		</select>
		<button type="submit">{t(locale, 'patterns.list.search')}</button>
	</form>

	{#if data.rows.length === 0}
		<p class="muted">{t(locale, 'patterns.list.empty')} <a href="/patterns/new">{t(locale, 'patterns.list.addFirst')}</a>.</p>
	{:else}
		<div class="grid">
			{#each data.rows as p}
				<a class="card item" href={`/patterns/${p.id}`}>
					<div class="row">
						<strong>{p.title}</strong>
						<span class="tag">{craftLabel(locale, p.craft)}</span>
					</div>
					{#if !p.mine}
						<span class="shared">{t(locale, 'patterns.list.sharedBy', { name: p.ownerName })}</span>
					{:else if p.isShared}
						<span class="shared mine">{t(locale, 'patterns.list.shared')}</span>
					{/if}
					{#if p.garmentType || p.designer}
						<span class="muted small">{[p.garmentType, p.designer].filter(Boolean).join(' · ')}</span>
					{/if}
					{#if p.difficulty}
						<span class="muted small">{difficultyLabel(locale, p.difficulty) ?? ''}</span>
					{/if}
					<div>
						{#each p.tags ?? [] as tag}<span class="tag">{tag}</span>{/each}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.filters {
		display: flex;
		gap: 0.5rem;
		margin: 1rem 0 1.5rem;
	}
	.filters input {
		flex: 1;
	}
	.filters select {
		width: auto;
	}
	.item {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		color: var(--text);
	}
	.item:hover {
		text-decoration: none;
		border-color: var(--accent);
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.small {
		font-size: 0.82rem;
	}
	.shared {
		font-size: 0.78rem;
		color: var(--accent);
	}
	.shared.mine {
		color: var(--muted);
	}
</style>
