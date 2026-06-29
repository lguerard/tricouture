<script lang="ts">
	import { CRAFT_LABELS, CRAFTS, DIFFICULTY_LABELS } from '$lib/labels';
	let { data } = $props();
</script>

<div class="container">
	<header class="head">
		<h1>Patrons</h1>
		<a class="btn btn-primary" href="/patterns/new">+ Nouveau patron</a>
	</header>

	<form class="filters" method="GET">
		<input name="q" placeholder="Rechercher (titre, contenu PDF…)" value={data.q} />
		<select name="craft" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
			<option value="">Tous types</option>
			{#each CRAFTS as c}
				<option value={c} selected={data.craftFilter === c}>{CRAFT_LABELS[c]}</option>
			{/each}
		</select>
		<button type="submit">Rechercher</button>
	</form>

	{#if data.rows.length === 0}
		<p class="muted">Aucun patron trouvé. <a href="/patterns/new">Ajoute ton premier patron</a>.</p>
	{:else}
		<div class="grid">
			{#each data.rows as p}
				<a class="card item" href={`/patterns/${p.id}`}>
					<div class="row">
						<strong>{p.title}</strong>
						<span class="tag">{CRAFT_LABELS[p.craft]}</span>
					</div>
					{#if p.garmentType || p.designer}
						<span class="muted small">{[p.garmentType, p.designer].filter(Boolean).join(' · ')}</span>
					{/if}
					{#if p.difficulty}
						<span class="muted small">{DIFFICULTY_LABELS[p.difficulty] ?? ''}</span>
					{/if}
					<div>
						{#each p.tags ?? [] as t}<span class="tag">{t}</span>{/each}
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
</style>
