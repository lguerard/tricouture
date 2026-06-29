<script lang="ts">
	let { form } = $props();
</script>

<div class="card auth-card">
	<h1>🪡 Créer un compte</h1>
	<p class="muted">Le premier compte créé devient administrateur.</p>

	<form method="POST">
		<div class="field">
			<label for="displayName">Nom affiché</label>
			<input id="displayName" name="displayName" value={form?.displayName ?? ''} required />
		</div>
		<div class="field">
			<label for="email">Email</label>
			<input id="email" name="email" type="email" autocomplete="email" value={form?.email ?? ''} required />
		</div>
		<div class="field">
			<label for="password">Mot de passe (8+ caractères)</label>
			<input id="password" name="password" type="password" autocomplete="new-password" required />
		</div>
		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}
		<button class="btn-primary" type="submit" style="width:100%">Créer le compte</button>
	</form>

	<p class="muted alt">Déjà inscrit ? <a href="/login">Se connecter</a></p>
</div>

<style>
	.auth-card {
		width: 360px;
		max-width: 100%;
	}
	h1 {
		margin: 0 0 0.2rem;
		color: var(--accent);
		font-size: 1.3rem;
	}
	.alt {
		margin-top: 1rem;
		text-align: center;
	}
</style>
