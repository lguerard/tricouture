<script lang="ts">
	import { page } from '$app/stores';
	let { form } = $props();
	const next = $derived($page.url.searchParams.get('next') ?? '/');
</script>

<div class="card auth-card">
	<h1>🪡 Tricouture</h1>
	<p class="muted">Connecte-toi pour accéder à tes patrons et projets.</p>

	<form method="POST">
		<input type="hidden" name="next" value={next} />
		<div class="field">
			<label for="email">Email</label>
			<input id="email" name="email" type="email" autocomplete="email" value={form?.email ?? ''} required />
		</div>
		<div class="field">
			<label for="password">Mot de passe</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required />
		</div>
		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}
		<button class="btn-primary" type="submit" style="width:100%">Se connecter</button>
	</form>

	<p class="muted alt">Pas de compte ? <a href="/register">Créer un compte</a></p>
</div>

<style>
	.auth-card {
		width: 360px;
		max-width: 100%;
	}
	h1 {
		margin: 0 0 0.2rem;
		color: var(--accent);
	}
	.alt {
		margin-top: 1rem;
		text-align: center;
	}
</style>
