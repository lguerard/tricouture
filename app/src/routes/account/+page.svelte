<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	let { data, form } = $props();
	const locale = $derived(data.locale);
</script>

<div class="container narrow">
	<h1>{t(locale, 'account.title')}</h1>
	<p class="muted">{t(locale, 'account.subtitle')}</p>

	<div class="card identity">
		<div><span class="muted">{t(locale, 'auth.displayName')}</span><strong>{data.account.displayName}</strong></div>
		<div><span class="muted">{t(locale, 'auth.email')}</span><strong>{data.account.email}</strong></div>
	</div>

	<form class="card" method="POST" action="?/changePassword" use:enhance>
		<h2>{t(locale, 'account.changePassword')}</h2>
		<div class="field">
			<label for="current">{t(locale, 'account.currentPassword')}</label>
			<input id="current" name="currentPassword" type="password" autocomplete="current-password" required />
		</div>
		<div class="field">
			<label for="new">{t(locale, 'auth.passwordHint')}</label>
			<input id="new" name="newPassword" type="password" autocomplete="new-password" required />
		</div>
		<div class="field">
			<label for="confirm">{t(locale, 'account.confirmPassword')}</label>
			<input id="confirm" name="confirmPassword" type="password" autocomplete="new-password" required />
		</div>
		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}
		{#if form?.success}
			<p class="ok">{form.success}</p>
		{/if}
		<p class="muted small">{t(locale, 'account.logoutNote')}</p>
		<button class="btn-primary" type="submit">{t(locale, 'account.changePassword')}</button>
	</form>
</div>

<style>
	.narrow { max-width: 520px; }
	h1 { margin-bottom: 0.2rem; }
	h2 { margin: 0 0 0.8rem; font-size: 1.05rem; }
	.card { margin-top: 1rem; }
	.identity { display: flex; flex-direction: column; gap: 0.5rem; }
	.identity div { display: flex; justify-content: space-between; gap: 1rem; }
	.small { font-size: 0.8rem; }
</style>
