<script lang="ts">
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
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

	<form class="card ai-toggle" method="POST" action="?/toggleAiAutoFill" use:enhance={withFeedback()}>
		<div class="ai-toggle-row">
			<div>
				<h2>{t(locale, 'account.aiAutoFill.title')}</h2>
				<p class="muted small">{t(locale, 'account.aiAutoFill.hint')}</p>
			</div>
			<button type="submit" class:on={data.account.aiAutoFillEnabled}>
				{data.account.aiAutoFillEnabled ? t(locale, 'account.aiAutoFill.on') : t(locale, 'account.aiAutoFill.off')}
			</button>
		</div>
	</form>

	{#if data.unindexed}
		<form class="card ai-toggle" method="POST" action="?/indexLibrary" use:enhance={withFeedback()}>
			<div class="ai-toggle-row">
				<div>
					<h2>{t(locale, 'account.search.title')}</h2>
					<p class="muted small">
						{data.unindexed.patterns + data.unindexed.yarns === 0
							? t(locale, 'account.search.allIndexed')
							: t(locale, 'account.search.pending', { patterns: data.unindexed.patterns, yarns: data.unindexed.yarns })}
					</p>
				</div>
				{#if data.unindexed.patterns + data.unindexed.yarns > 0}
					<button type="submit">{t(locale, 'account.search.index')}</button>
				{/if}
			</div>
		</form>
	{/if}

	<form class="card" method="POST" action="?/changePassword" use:enhance={withFeedback()}>
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
	.ai-toggle-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	.ai-toggle-row h2 { margin: 0 0 0.2rem; font-size: 1rem; }
	.ai-toggle-row button {
		flex: none;
	}
	.ai-toggle-row button.on {
		background: var(--accent);
		color: var(--on-accent);
		border-color: var(--accent);
	}
</style>
