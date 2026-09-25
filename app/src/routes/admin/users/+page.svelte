<script lang="ts">
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
	import { t } from '$lib/i18n';
	let { data, form } = $props();
	const locale = $derived(data.locale);

	let copied = $state(false);
	async function copy(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false; // clipboard blocked (http, permissions) — the link is on screen anyway
		}
	}
</script>

<div class="container">
	<h1>{t(locale, 'admin.title')}</h1>
	<p class="muted">{t(locale, 'admin.subtitle')}</p>

	{#if form?.resetUrl}
		<div class="card link-card">
			<strong>{t(locale, 'admin.linkFor', { email: form.resetFor })}</strong>
			<code>{form.resetUrl}</code>
			<div class="link-actions">
				<button type="button" onclick={() => copy(form.resetUrl)}>
					{copied ? t(locale, 'admin.copied') : t(locale, 'admin.copy')}
				</button>
			</div>
			<p class="muted small">{t(locale, 'admin.linkNote')}</p>
		</div>
	{/if}

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<div class="card">
		<table>
			<thead>
				<tr>
					<th>{t(locale, 'auth.displayName')}</th>
					<th>{t(locale, 'auth.email')}</th>
					<th>{t(locale, 'admin.role')}</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as u}
					<tr>
						<td>{u.displayName}</td>
						<td class="muted">{u.email}</td>
						<td>
							{#if u.isAdmin}<span class="tag">{t(locale, 'admin.admin')}</span>{:else}<span class="muted">{t(locale, 'admin.member')}</span>{/if}
						</td>
						<td class="row-actions">
							<form method="POST" action="?/resetLink" use:enhance={withFeedback()}>
								<input type="hidden" name="id" value={u.id} />
								<button type="submit">🔑 {t(locale, 'admin.generateLink')}</button>
							</form>
							<form method="POST" action="?/toggleAdmin" use:enhance={withFeedback()}>
								<input type="hidden" name="id" value={u.id} />
								<input type="hidden" name="makeAdmin" value={u.isAdmin ? 'false' : 'true'} />
								<button type="submit">{u.isAdmin ? t(locale, 'admin.demote') : t(locale, 'admin.promote')}</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	h1 { margin-bottom: 0.2rem; }
	.card { margin-top: 1rem; }
	table { width: 100%; border-collapse: collapse; }
	th { text-align: left; font-size: 0.8rem; color: var(--muted); font-weight: 600; padding-bottom: 0.5rem; }
	td { padding: 0.55rem 0.4rem 0.55rem 0; border-top: 1px solid var(--border); vertical-align: middle; }
	.row-actions { display: flex; gap: 0.4rem; justify-content: flex-end; flex-wrap: wrap; }
	.link-card { border-color: var(--accent); display: flex; flex-direction: column; gap: 0.5rem; }
	.link-card code { display: block; word-break: break-all; background: var(--accent-soft); padding: 0.5rem; border-radius: var(--radius); font-size: 0.85rem; }
	.link-actions { display: flex; gap: 0.4rem; }
	.small { font-size: 0.8rem; margin: 0; }
	@media (max-width: 640px) {
		td, th { font-size: 0.9rem; }
		.row-actions { justify-content: flex-start; }
	}
</style>
