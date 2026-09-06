<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	const l = $derived($page.data.locale);
</script>

<div class="card auth-card">
	<h1>🪡 {t(l, 'forgot.title')}</h1>
	<p class="muted">{t(l, 'forgot.intro')}</p>

	<ol>
		<li>{t(l, 'forgot.step.admin')}</li>
		<li>{t(l, 'forgot.step.cli')}</li>
	</ol>

	<pre><code>docker compose exec app node scripts/reset-password.js \
  toi@exemple.fr</code></pre>

	<p class="muted alt"><a href="/login">{t(l, 'reset.backToLogin')}</a></p>
</div>

<style>
	.auth-card { width: 420px; max-width: 100%; }
	h1 { margin: 0 0 0.2rem; color: var(--accent); font-size: 1.3rem; }
	ol { padding-left: 1.1rem; margin: 0.8rem 0; }
	li { margin-bottom: 0.5rem; font-size: 0.92rem; }
	pre { background: var(--accent-soft); padding: 0.6rem; border-radius: var(--radius); overflow-x: auto; margin: 0; }
	code { font-size: 0.78rem; }
	.alt { margin-top: 1rem; text-align: center; }
</style>
