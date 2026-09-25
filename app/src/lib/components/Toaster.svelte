<script lang="ts">
	import { toasts } from '$lib/toast.svelte';
	import { t, type Locale } from '$lib/i18n';

	let { locale }: { locale: Locale } = $props();
</script>

<div class="toaster" aria-live="polite" role="status">
	{#each toasts.list as toast (toast.id)}
		<div class="toast {toast.kind}">
			<span>{toast.message ?? t(locale, toast.key ?? 'toast.error')}</span>
			{#if toast.action}
				<button
					type="button"
					onclick={() => {
						toast.action?.run();
						toasts.dismiss(toast.id);
					}}>{t(locale, toast.action.key)}</button
				>
			{/if}
			<button type="button" class="close" aria-label="✕" onclick={() => toasts.dismiss(toast.id)}>✕</button>
		</div>
	{/each}
</div>

<style>
	.toaster {
		position: fixed;
		right: 1rem;
		bottom: calc(1rem + var(--tabbar-height, 0px));
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		z-index: 1000;
		max-width: min(420px, calc(100vw - 2rem));
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
		background: var(--text);
		color: var(--bg);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
		animation: slide-in 0.15s ease-out;
	}
	.toast.error {
		background: var(--danger);
		color: #fff;
	}
	.toast.success {
		background: var(--ok);
		color: #fff;
	}
	.toast span {
		flex: 1;
	}
	.toast button {
		background: transparent;
		color: inherit;
		border: 1px solid currentColor;
		padding: 0.2rem 0.6rem;
		font-weight: 600;
	}
	.toast button.close {
		border: none;
		opacity: 0.7;
		padding: 0.2rem;
	}
	@keyframes slide-in {
		from {
			transform: translateY(8px);
			opacity: 0;
		}
	}
</style>
