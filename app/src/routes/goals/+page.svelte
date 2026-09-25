<script lang="ts">
	import { enhance } from '$app/forms';
	import { withFeedback } from '$lib/feedback';
	import { undoableDelete } from '$lib/undo';
	import { t } from '$lib/i18n';
	let { data } = $props();
	let adding = $state(false);
	const locale = $derived(data.locale);

	const KIND_VALUES = ['projets_an', 'stash_busting', 'defi_mensuel', 'autre'];
	const KINDS = $derived(
		Object.fromEntries(KIND_VALUES.map((v) => [v, t(locale, `goals.kind.${v}`)]))
	);
	function pct(c: number, t: number) {
		return Math.min(100, Math.round((c / Math.max(1, t)) * 100));
	}
</script>

<div class="container">
	<header class="head">
		<h1>{t(locale, 'goals.title')}</h1>
		<button class="btn-primary" onclick={() => (adding = !adding)}>{adding ? t(locale, 'goals.close') : t(locale, 'goals.addBtn')}</button>
	</header>

	{#if adding}
		<form class="card add" method="POST" action="?/add" use:enhance={withFeedback({ success: 'toast.saved', inner: () => async ({ update }) => { await update({ reset: true }); adding = false; } })}>
			<div class="row">
				<div class="field"><label for="t">{t(locale, 'goals.labelTitle')}</label><input id="t" name="title" required /></div>
				<div class="field">
					<label for="k">{t(locale, 'goals.labelType')}</label>
					<select id="k" name="kind">{#each Object.entries(KINDS) as [v, l]}<option value={v}>{l}</option>{/each}</select>
				</div>
				<div class="field"><label for="tv">{t(locale, 'goals.labelTarget')}</label><input id="tv" name="targetValue" type="number" min="1" value="1" /></div>
			</div>
			<div class="row">
				<div class="field"><label for="ps">{t(locale, 'goals.labelStart')}</label><input id="ps" name="periodStart" type="date" /></div>
				<div class="field"><label for="pe">{t(locale, 'goals.labelEnd')}</label><input id="pe" name="periodEnd" type="date" /></div>
			</div>
			<button class="btn-primary" type="submit">{t(locale, 'goals.create')}</button>
		</form>
	{/if}

	{#if data.list.length === 0}
		<p class="muted">{t(locale, 'goals.empty')}</p>
	{:else}
		<div class="grid">
			{#each data.list as g}
				<div class="card goal" data-undo-item>
					<div class="ghead">
						<strong>{g.title}</strong>
						<span class="tag">{KINDS[g.kind] ?? g.kind}</span>
					</div>
					<div class="bar"><div class="fill" style={`width:${pct(g.currentValue, g.targetValue)}%`}></div></div>
					<span class="muted small">{g.currentValue} / {g.targetValue}</span>
					<div class="actions">
						<form method="POST" action="?/step" use:enhance={withFeedback()}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="delta" value="1" /><button type="submit">+1</button></form>
						<form method="POST" action="?/step" use:enhance={withFeedback()}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="delta" value="-1" /><button type="submit">−1</button></form>
						<form method="POST" action="?/delete" use:enhance={undoableDelete()}><input type="hidden" name="id" value={g.id} /><button class="del" type="submit">🗑</button></form>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.head { display: flex; justify-content: space-between; align-items: center; }
	.add { margin: 1rem 0; }
	.row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.7rem; }
	.goal { display: flex; flex-direction: column; gap: 0.35rem; }
	.ghead { display: flex; justify-content: space-between; gap: 0.5rem; }
	.bar { height: 8px; background: var(--accent-soft); border-radius: 999px; overflow: hidden; }
	.fill { height: 100%; background: var(--accent); }
	.actions { display: flex; gap: 0.4rem; margin-top: 0.3rem; }
	.del { color: var(--danger); }
	.small { font-size: 0.8rem; }
	@media (max-width: 560px) { .row { grid-template-columns: 1fr; } }
</style>
