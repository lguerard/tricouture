// Advent calendar: the rules shared by the server (which enforces them) and
// the page (which only displays them). Pure functions, no I/O.
//
// A calendar belongs to the person who prepares it (the "lutin") and is opened
// by one recipient. Door N becomes openable on December N (Paris time) of the
// calendar's year; opening it needs the code hidden with the yarn.

export const ADVENT_DAYS = 24;
export const ADVENT_TZ = 'Europe/Paris';

// Doors are laid out out of order, like a real calendar. A fixed order (not a
// random one) so the board looks the same on every visit and every device.
export const DOOR_ORDER = [
	17, 5, 22, 9, 1, 14,
	11, 20, 3, 24, 7, 16,
	2, 13, 19, 6, 21, 10,
	23, 8, 15, 4, 12, 18
] as const;

export type ParisDate = { year: number; month: number; day: number };

// Calendar date in Paris for an instant: the door opens at midnight there,
// whatever the time zone of the server or of the phone.
export function parisDate(now: Date): ParisDate {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: ADVENT_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now);
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
	return { year: get('year'), month: get('month'), day: get('day') };
}

function dayNumber(d: ParisDate): number {
	return Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
}

// Whole days until door `day` opens (0 = open today or already open).
export function daysUntil(year: number, day: number, today: ParisDate): number {
	return Math.max(0, dayNumber({ year, month: 12, day }) - dayNumber(today));
}

export function isDayAvailable(year: number, day: number, today: ParisDate): boolean {
	if (!Number.isInteger(day) || day < 1 || day > ADVENT_DAYS) return false;
	return daysUntil(year, day, today) === 0;
}

// "2026-12-05" → ParisDate, for the preview date of the lutin. null if invalid.
export function parseIsoDate(s: string | null | undefined): ParisDate | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
	if (!m) return null;
	const d = { year: +m[1], month: +m[2], day: +m[3] };
	const check = new Date(Date.UTC(d.year, d.month - 1, d.day));
	if (check.getUTCMonth() !== d.month - 1 || check.getUTCDate() !== d.day) return null;
	return d;
}

// Codes are typed on a phone: ignore case, accents, spaces and punctuation.
// « Traîneau ! » and "traineau" are the same code.
export function normalizeCode(s: string): string {
	return s
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

export function codeMatches(typed: string, expected: string | null | undefined): boolean {
	const want = normalizeCode(expected ?? '');
	return want.length > 0 && normalizeCode(typed) === want;
}

// Guessing guard: after MAX_ATTEMPTS wrong codes on one door, wait
// LOCKOUT_MINUTES before trying again. Generous on purpose: it stops a script,
// not someone mistyping on a phone.
export const MAX_ATTEMPTS = 6;
export const LOCKOUT_MINUTES = 10;

export function attemptWaitMinutes(failed: number, lastAttemptAt: Date | null, now: Date): number {
	if (failed < MAX_ATTEMPTS || !lastAttemptAt) return 0;
	const left = LOCKOUT_MINUTES * 60_000 - (now.getTime() - lastAttemptAt.getTime());
	return left > 0 ? Math.ceil(left / 60_000) : 0;
}

// The yarn of a day, as the lutin types it. Turned into stash entries when
// the door opens.
export type AdventYarn = {
	brand: string;
	name: string;
	colorway: string;
	colorHex: string;
	weightCategory: string;
	fiber: string;
	metersPerSkein: number | null;
	gramsPerSkein: number | null;
	skeins: number;
};

const HEX = /^#[0-9a-f]{6}$/i;

// "#1F4FD1", "1f4fd1" or " #1f4fd1 " → "#1f4fd1"; anything else → "".
export function normalizeHex(v: string): string {
	const s = v.trim();
	const hex = s.startsWith('#') ? s : '#' + s;
	return HEX.test(hex) ? hex.toLowerCase() : '';
}

// Cleans one yarn line from the editor; null when the line is empty.
export function cleanYarn(raw: Partial<Record<keyof AdventYarn, unknown>>): AdventYarn | null {
	const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
	const num = (v: unknown) => {
		const n = Number(String(v ?? '').replace(',', '.'));
		return Number.isFinite(n) && n > 0 ? n : null;
	};
	const y: AdventYarn = {
		brand: str(raw.brand, 160),
		name: str(raw.name, 160),
		colorway: str(raw.colorway, 160),
		colorHex: normalizeHex(str(raw.colorHex, 8)),
		weightCategory: str(raw.weightCategory, 40),
		fiber: str(raw.fiber, 160),
		metersPerSkein: num(raw.metersPerSkein),
		gramsPerSkein: num(raw.gramsPerSkein),
		skeins: num(raw.skeins) ?? 1
	};
	if (!y.brand && !y.name && !y.colorway) return null;
	return y;
}

// The recipient sees the calendar (menu link and page) from December 1st, so
// the lutin can prepare it in advance without spoiling the surprise — unless
// they choose to show it early, as a teaser.
export function isRevealed(year: number, today: ParisDate, revealEarly: boolean): boolean {
	if (revealEarly) return true;
	return dayNumber(today) >= dayNumber({ year, month: 12, day: 1 });
}

// The lutin's preparation checklist, shown in the workshop. Ids are stored in
// advent_calendars.todo_done, so they are data: never rename one. Titles live
// in the i18n dictionary (advent.todo.<id> and advent.todo.<id>.note).
// `auto` items are ticked by the app itself from the calendar's state.
export const ADVENT_TODO: { phase: 'before' | 'prepare' | 'during'; ids: string[] }[] = [
	{ phase: 'before', ids: ['yarn', 'notions', 'patterns', 'import'] },
	{ phase: 'prepare', ids: ['packs', 'tags', 'hints', 'fill', 'preview'] },
	{ phase: 'during', ids: ['hide', 'watch'] }
];
export const ADVENT_TODO_AUTO = new Set(['fill']);
export const ADVENT_TODO_IDS = new Set(ADVENT_TODO.flatMap((g) => g.ids));

// Notifications to the recipient: none, December 1st only, or every morning.
export const NOTIFY_MODES = ['off', 'first', 'daily'] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];
export const ADVENT_NOTIFY_HOUR = 8; // Paris time
export const ADVENT_NOTIFY_ID_BASE = 880_000; // + day: stable ids on the phone

// The instant it is `hour`:00 in Paris on that day (handles summer time).
export function parisInstant(year: number, month: number, day: number, hour: number): Date {
	let t = Date.UTC(year, month - 1, day, hour);
	for (let i = 0; i < 3; i++) {
		const parts = new Intl.DateTimeFormat('en-GB', {
			timeZone: ADVENT_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
		}).formatToParts(new Date(t));
		const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
		const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'));
		const want = Date.UTC(year, month - 1, day, hour);
		if (shown === want) break;
		t += want - shown;
	}
	return new Date(t);
}

// Which notifications to schedule from `now` on: December 1st for 'first',
// every door for 'daily', only those still in the future.
export function notificationPlan(year: number, mode: NotifyMode, now: Date): { day: number; at: Date }[] {
	if (mode === 'off') return [];
	const days = mode === 'first' ? [1] : Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1);
	return days
		.map((day) => ({ day, at: parisInstant(year, 12, day, ADVENT_NOTIFY_HOUR) }))
		.filter((n) => n.at.getTime() > now.getTime());
}

// The lutin's own tasks, added to the checklist by pasting text:
//   # Group title            starts a group
//   Task title | a note      one task per line (the note is optional)
// Blank lines are ignored. Ids are random, so deleting one task never
// renumbers the others' ticks.
export type CustomTodo = { id: string; group: string; title: string; note: string };
export const CUSTOM_TODO_MAX = 100;

export function parseTodoText(text: string, newId: () => string, defaultGroup = ''): CustomTodo[] {
	const out: CustomTodo[] = [];
	let group = defaultGroup.slice(0, 120);
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		if (line.startsWith('#')) {
			group = line.replace(/^#+\s*/, '').slice(0, 120);
			continue;
		}
		const cut = line.indexOf('|');
		const title = (cut >= 0 ? line.slice(0, cut) : line).replace(/^[-*•]\s*/, '').trim().slice(0, 200);
		const note = cut >= 0 ? line.slice(cut + 1).trim().slice(0, 500) : '';
		if (title) out.push({ id: 'c-' + newId(), group, title, note });
	}
	return out;
}

// Custom tasks grouped in the order their groups first appear.
export function groupTodos(list: CustomTodo[]): { group: string; items: CustomTodo[] }[] {
	const groups: { group: string; items: CustomTodo[] }[] = [];
	for (const item of list) {
		const g = groups.find((x) => x.group === item.group) ?? groups[groups.push({ group: item.group, items: [] }) - 1];
		g.items.push(item);
	}
	return groups;
}
