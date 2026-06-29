<script lang="ts">
	let { data } = $props();
</script>

<div class="container">
	<h1>Galerie des réalisations</h1>
	{#if data.items.length === 0}
		<p class="muted">
			Rien ici pour l'instant. Tes projets terminés pourront être ajoutés à la galerie (à venir
			dans la phase suivante).
		</p>
	{:else}
		<div class="grid">
			{#each data.items as fo}
				<div class="card">
					{#if fo.photoPath}<img src={`/media/${fo.photoPath}`} alt={fo.title} />{/if}
					<strong>{fo.title}</strong>
					{#if fo.notes}<p class="muted small">{fo.notes}</p>{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	img {
		width: 100%;
		height: 180px;
		object-fit: cover;
		border-radius: var(--radius);
		margin-bottom: 0.4rem;
	}
	.small {
		font-size: 0.82rem;
	}
</style>
