// App-wide notifications. `message` is shown as-is (e.g. an error string the
// server already localized); otherwise `key` is translated by the Toaster.
export type ToastKind = 'success' | 'error' | 'info';

export type Toast = {
	id: number;
	kind: ToastKind;
	message?: string;
	key?: string;
	action?: { key: string; run: () => void };
};

let nextId = 1;

class Toasts {
	list = $state<Toast[]>([]);

	push(toast: Omit<Toast, 'id'>, timeoutMs = 4000): number {
		const id = nextId++;
		this.list.push({ ...toast, id });
		setTimeout(() => this.dismiss(id), timeoutMs);
		return id;
	}

	dismiss(id: number) {
		this.list = this.list.filter((t) => t.id !== id);
	}
}

export const toasts = new Toasts();
