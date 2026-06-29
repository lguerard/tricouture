<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	let { form } = $props();
	const next = $derived($page.url.searchParams.get('next') ?? '/');
	const l = $derived($page.data.locale);
</script>

<div class="card auth-card">
	<h1>🪡 Tricouture</h1>
	<p class="muted">{t(l, 'auth.login.subtitle')}</p>

	<form method="POST">
		<input type="hidden" name="next" value={next} />
		<div class="field">
			<label for="email">{t(l, 'auth.email')}</label>
			<input id="email" name="email" type="email" autocomplete="email" value={form?.email ?? ''} required />
		</div>
		<div class="field">
			<label for="password">{t(l, 'auth.password')}</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required />
		</div>
		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}
		<button class="btn-primary" type="submit" style="width:100%">{t(l, 'auth.signin')}</button>
	</form>

	<p class="muted alt">{t(l, 'auth.noAccount')} <a href="/register">{t(l, 'auth.createAccount')}</a></p>
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
