<script lang="ts">
	import { page } from '$app/stores';
	import { t, DEFAULT_LOCALE, isLocale } from '$lib/i18n';

	const locale = $derived(isLocale($page.data.locale) ? $page.data.locale : DEFAULT_LOCALE);
	const notFound = $derived($page.status === 404);
</script>

<div class="container error-page">
	<div class="big">{notFound ? '🧶' : '🪡'}</div>
	<h1>{t(locale, notFound ? 'error.notFound' : 'error.generic')}</h1>
	<p class="muted">{t(locale, notFound ? 'error.notFoundHint' : 'error.genericHint')}</p>
	<p class="muted small">{$page.status}{$page.error?.message ? ` · ${$page.error.message}` : ''}</p>
	<div class="actions">
		<button type="button" onclick={() => history.back()}>← {t(locale, 'error.back')}</button>
		<a class="btn btn-primary" href="/">{t(locale, 'error.home')}</a>
	</div>
</div>

<style>
	.error-page {
		text-align: center;
		padding-top: 4rem;
	}
	.big {
		font-size: 4rem;
	}
	.small {
		font-size: 0.8rem;
	}
	.actions {
		display: flex;
		gap: 0.6rem;
		justify-content: center;
		margin-top: 1.5rem;
	}
</style>
