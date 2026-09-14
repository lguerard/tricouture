// A model-watch run can take a very long time (pulling several multi-GB
// candidate models, one at a time, then running each through every eval
// case) — far longer than a single HTTP request should stay open. The admin
// API route below starts a run in the background and returns immediately;
// the host-side cron script polls this state until it's done.
//
// A plain module-level singleton is enough: this app never runs more than
// one instance, and the run only needs to outlive the HTTP request that
// started it, not the process.

import type { ModelWatchResult } from './evaluate';

type State = {
	running: boolean;
	result: ModelWatchResult | null;
	startedAt: string | null;
	finishedAt: string | null;
};

const state: State = { running: false, result: null, startedAt: null, finishedAt: null };

export function getState(): State {
	return state;
}

// Starts `run` in the background unless one is already in flight. Returns
// whether it actually started.
export function startRun(run: () => Promise<ModelWatchResult>): boolean {
	if (state.running) return false;
	state.running = true;
	state.result = null;
	state.startedAt = new Date().toISOString();
	state.finishedAt = null;
	run()
		.then((result) => {
			state.result = result;
		})
		.catch((e: unknown) => {
			state.result = { ok: false, error: `Erreur inattendue : ${(e as Error).message}` };
		})
		.finally(() => {
			state.running = false;
			state.finishedAt = new Date().toISOString();
		});
	return true;
}
