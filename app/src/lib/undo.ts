import type { SubmitFunction } from '@sveltejs/kit';
import { invalidateAll } from '$app/navigation';
import { toasts } from '$lib/toast.svelte';

type Pending = { action: string; body: FormData; element: HTMLElement | null; timer: ReturnType<typeof setTimeout> };

const pending = new Set<Pending>();
const UNDO_WINDOW_MS = 5000;

function send(p: Pending, keepalive = false) {
	pending.delete(p);
	clearTimeout(p.timer);
	return fetch(p.action, {
		method: 'POST',
		body: p.body,
		headers: { 'x-sveltekit-action': 'true' },
		keepalive
	});
}

// Deletes happen after a short undo window instead of immediately: the item
// is hidden at once, a toast offers "Annuler", and the real form POST only
// goes out when the window closes (or when the page is left — see
// flushPendingDeletes).
export function undoableDelete(): SubmitFunction {
	return ({ action, formData, formElement, cancel }) => {
		cancel();
		const element = formElement.closest<HTMLElement>('[data-undo-item]');
		if (element) element.hidden = true;

		const p: Pending = {
			action: action.href,
			body: formData,
			element,
			timer: setTimeout(async () => {
				try {
					const res = await send(p);
					if (!res.ok) throw new Error();
				} catch {
					if (element) element.hidden = false;
					toasts.push({ kind: 'error', key: 'toast.error' }, 6000);
				}
				await invalidateAll();
			}, UNDO_WINDOW_MS)
		};
		pending.add(p);

		toasts.push(
			{
				kind: 'info',
				key: 'toast.deleted',
				action: {
					key: 'toast.undo',
					run: () => {
						pending.delete(p);
						clearTimeout(p.timer);
						if (element) element.hidden = false;
					}
				}
			},
			UNDO_WINDOW_MS
		);
	};
}

// Leaving the page (in-app navigation or closing the tab) must not silently
// cancel a delete the person already confirmed by not clicking "Annuler".
export function flushPendingDeletes() {
	for (const p of [...pending]) void send(p, true);
}
