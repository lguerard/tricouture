// Talking to the Android app's local start page (mobile/www/index.html).
//
// The app is built without any server address (the repository and the APK are
// public), so Capacitor does not link the server's pages to the phone: from
// here, the site cannot schedule a notification itself. The app's local start
// page can. It announces itself in the hash of the first page it opens
// (#tc_shell=<its origin>&tc_v=<version>); to schedule notifications, the site
// sends the WebView to that page with the plan in the hash, and the page sends
// it back with an acknowledgement (#tc_advent=<signature>&tc_result=...).
// Since version 3 it also passes the phone's Material You color
// (&tc_accent=#rrggbb, or "none" before Android 12): only that local page can
// read it, through the app's SystemColors plugin (mobile/native).

export const SHELL_MIN_VERSION_NOTIFY = 2;
export const SHELL_MIN_VERSION_COLORS = 3;
const SHELL_KEY = 'tc-shell';
const ACCENT_KEY = 'tc-accent';
const SIG_KEY = 'tc-advent-sig';
const TRY_KEY = 'tc-advent-try';
const RETRY_MS = 12 * 3600_000;

export type ShellInfo = { origin: string; version: number };

// Only the app's own local origin: a link crafted with another address in its
// hash must not make the site send anything elsewhere.
export function isShellOrigin(origin: string): boolean {
	return /^(https?|capacitor):\/\/localhost(:\d{1,5})?$/.test(origin);
}

export type ShellHash = {
	shell: ShellInfo | null;
	ack: { sig: string; result: string } | null;
	/** Material You color, null when the phone has none, undefined when not sent. */
	accent?: string | null;
};

export function parseShellHash(hash: string): ShellHash {
	const p = new URLSearchParams(hash.replace(/^#/, ''));
	const origin = p.get('tc_shell') ?? '';
	const version = Number(p.get('tc_v'));
	const shell = origin && isShellOrigin(origin) && Number.isInteger(version) && version > 0 ? { origin, version } : null;
	const sig = p.get('tc_advent');
	const ack = sig !== null ? { sig, result: p.get('tc_result') ?? '' } : null;
	const rawAccent = p.get('tc_accent');
	if (rawAccent === null) return { shell, ack };
	return { shell, ack, accent: /^#[0-9a-f]{6}$/i.test(rawAccent) ? rawAccent.toLowerCase() : null };
}

// Whether to send the plan to the phone now: it changed since the last time
// the phone acknowledged it, and we did not just try (a failed round trip must
// not turn into a loop).
export function shouldSend(sig: string, storedSig: string | null, lastTry: number, now: number): boolean {
	if (sig === storedSig) return false;
	if (sig === 'none' && storedSig === null) return false; // nothing scheduled, nothing to cancel
	return now - lastTry > RETRY_MS;
}

export type ShellPlan = { id: number; title: string; body: string; at: string; href: string };

export function bounceUrl(shell: ShellInfo, msg: { plan: ShellPlan[]; ids: number[]; sig: string; back: string }): string {
	return `${shell.origin}/index.html#advent=${encodeURIComponent(JSON.stringify(msg))}`;
}

// --- Browser side (localStorage may be missing: private mode, quotas) -------

function get(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function set(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* ignore */
	}
}

// Reads what the start page put in the hash, remembers it, and says whether
// the hash should be cleaned from the address.
export function captureShellHash(hash: string): boolean {
	const { shell, ack, accent } = parseShellHash(hash);
	if (shell) set(SHELL_KEY, JSON.stringify(shell));
	if (accent !== undefined) set(ACCENT_KEY, accent ?? 'none');
	// "error" is retried later; any other answer (scheduled, refused by the
	// person, plugin missing) is final for this plan.
	if (ack && ack.result !== 'error') set(SIG_KEY, ack.sig);
	return !!(shell || ack);
}

export function knownShell(): ShellInfo | null {
	try {
		const s = JSON.parse(get(SHELL_KEY) ?? 'null');
		return s && isShellOrigin(s.origin) && Number.isInteger(s.version) ? s : null;
	} catch {
		return null;
	}
}

// The phone's Material You color, as the start page last passed it: the
// color, null when the phone has none (Android before 12), undefined when the
// start page never sent one (opened in a browser, or an app too old).
export function shellAccent(): string | null | undefined {
	const shell = knownShell();
	if (!shell || shell.version < SHELL_MIN_VERSION_COLORS) return undefined;
	const a = get(ACCENT_KEY);
	return a && /^#[0-9a-f]{6}$/i.test(a) ? a : null;
}

// Sends the plan to the start page if needed. Returns true when the page is
// navigating away.
export function sendPlanToShell(plan: ShellPlan[], ids: number[], sig: string, back: string): boolean {
	const shell = knownShell();
	if (!shell || shell.version < SHELL_MIN_VERSION_NOTIFY) return false;
	const planSig = shellPlanSig(sig, shell.version);
	const lastTry = Number(get(TRY_KEY)) || 0;
	if (!shouldSend(planSig, get(SIG_KEY), lastTry, Date.now())) return false;
	set(TRY_KEY, String(Date.now()));
	location.replace(bounceUrl(shell, { plan, ids, sig: planSig, back }));
	return true;
}

// The plan's signature for a given version of the start page. Updating the
// app (a new start page) may drop the notifications Android had scheduled:
// a new version gives a new signature, so the plan is sent again once.
export function shellPlanSig(sig: string, version: number): string {
	return sig === 'none' ? sig : `${sig}@v${version}`;
}
