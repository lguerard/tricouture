<script lang="ts">
	import { t } from '$lib/i18n';
	let { data, form } = $props();
	const locale = $derived(data.locale);
</script>

<div class="card auth-card">
	<h1>🪡 {t(locale, 'reset.title')}</h1>

	{#if form?.done}
		<p class="ok">{t(locale, 'reset.done')}</p>
		<a class="btn btn-primary block" href="/login">{t(locale, 'auth.signin')}</a>
	{:else if !data.valid}
		<p class="error">{t(locale, 'reset.invalidToken')}</p>
		<p class="muted">{t(locale, 'reset.askAdmin')}</p>
		<a class="btn block" href="/login">{t(locale, 'reset.backToLogin')}</a>
	{:else}
		<p class="muted">{t(locale, 'reset.subtitle', { email: data.email ?? '' })}</p>
		<form method="POST">
			<div class="field">
				<label for="password">{t(locale, 'auth.passwordHint')}</label>
				<input id="password" name="password" type="password" autocomplete="new-password" required />
			</div>
			<div class="field">
				<label for="confirm">{t(locale, 'account.confirmPassword')}</label>
				<input id="confirm" name="confirmPassword" type="password" autocomplete="new-password" required />
			</div>
			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}
			<button class="btn-primary" type="submit" style="width:100%">{t(locale, 'reset.submit')}</button>
		</form>
	{/if}
</div>

<style>
	.auth-card { width: 360px; max-width: 100%; }
	h1 { margin: 0 0 0.2rem; color: var(--accent); font-size: 1.3rem; }
	.block { display: block; text-align: center; margin-top: 1rem; }
	.block:hover { text-decoration: none; }
</style>
