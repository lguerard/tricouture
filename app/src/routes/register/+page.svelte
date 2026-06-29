<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	let { form } = $props();
	const l = $derived($page.data.locale);
</script>

<div class="card auth-card">
	<h1>🪡 {t(l, 'auth.register.title')}</h1>
	<p class="muted">{t(l, 'auth.register.note')}</p>

	<form method="POST">
		<div class="field">
			<label for="displayName">{t(l, 'auth.displayName')}</label>
			<input id="displayName" name="displayName" value={form?.displayName ?? ''} required />
		</div>
		<div class="field">
			<label for="email">{t(l, 'auth.email')}</label>
			<input id="email" name="email" type="email" autocomplete="email" value={form?.email ?? ''} required />
		</div>
		<div class="field">
			<label for="password">{t(l, 'auth.passwordHint')}</label>
			<input id="password" name="password" type="password" autocomplete="new-password" required />
		</div>
		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}
		<button class="btn-primary" type="submit" style="width:100%">{t(l, 'auth.create')}</button>
	</form>

	<p class="muted alt">{t(l, 'auth.haveAccount')} <a href="/login">{t(l, 'auth.signin')}</a></p>
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
