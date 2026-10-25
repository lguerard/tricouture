// One assistant answer at a time per account: the GPU is shared and requests
// to Ollama are served one after the other, so a second tab (or an impatient
// double send) would only queue behind the first and push everyone else back.
// In memory: the app runs as a single Node process.
const inFlight = new Set<string>();

// Returns the release function, or null when this account already has an
// answer in progress. Releasing twice is harmless.
export function tryLock(uid: string): (() => void) | null {
	if (inFlight.has(uid)) return null;
	inFlight.add(uid);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		inFlight.delete(uid);
	};
}

export function isLocked(uid: string): boolean {
	return inFlight.has(uid);
}
