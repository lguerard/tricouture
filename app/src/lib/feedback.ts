import type { SubmitFunction } from '@sveltejs/kit';
import { toasts } from '$lib/toast.svelte';

type ResultCallback = Exclude<Awaited<ReturnType<SubmitFunction>>, void>;

// Wraps a form's `use:enhance` so every submission gives feedback: submit
// buttons are disabled while it runs (no double submit), failures always
// raise an error toast, and `success` (an i18n key) raises a success toast.
// `inner` is the page's own enhance callback, if it had one — it still runs
// and decides how the page updates.
export function withFeedback(opts: { success?: string; inner?: SubmitFunction } = {}): SubmitFunction {
	return (input) => {
		const buttons = [...input.formElement.querySelectorAll<HTMLButtonElement>('button:not([type=button])')];
		const wasDisabled = buttons.map((b) => b.disabled);
		buttons.forEach((b) => (b.disabled = true));
		input.formElement.setAttribute('aria-busy', 'true');

		const restore = () => {
			buttons.forEach((b, i) => (b.disabled = wasDisabled[i]));
			input.formElement.removeAttribute('aria-busy');
		};

		let innerResult: ReturnType<SubmitFunction>;
		try {
			innerResult = opts.inner?.(input);
		} catch (e) {
			restore();
			throw e;
		}

		return async (res) => {
			restore();
			const { result } = res;
			if (result.type === 'failure') {
				const data = (result.data ?? {}) as Record<string, unknown>;
				const message = Object.entries(data).find(([k, v]) => /error$/i.test(k) && typeof v === 'string')?.[1];
				toasts.push({ kind: 'error', message: message as string | undefined, key: 'toast.error' }, 6000);
			} else if (result.type === 'error') {
				toasts.push({ kind: 'error', key: 'toast.error' }, 6000);
			} else if (opts.success) {
				toasts.push({ kind: 'success', key: opts.success });
			}

			const callback = (await innerResult) as ResultCallback | undefined;
			if (callback) await callback(res);
			else await res.update();
		};
	};
}
