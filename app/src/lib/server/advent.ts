// Advent calendar, server side: everything the recipient may see goes through
// `board()`, which is the only place a day row is turned into page data. Codes,
// patterns and yarns of a door that is not open never leave this module.
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	adventCalendars,
	adventDays,
	patternFiles,
	patternPieces,
	patterns,
	yarns,
	type AdventCalendar,
	type AdventDay
} from '$lib/server/db/schema';
import { copyStored } from '$lib/server/storage';
import {
	ADVENT_DAYS,
	MAX_ATTEMPTS,
	attemptWaitMinutes,
	codeMatches,
	daysUntil,
	isDayAvailable,
	isRevealed,
	parisDate,
	type AdventYarn,
	type NotifyMode,
	type ParisDate
} from '$lib/advent';

export const ADVENT_TAG = 'calendrier-avent';

// Which advent links the menu shows for this account. A calendar not yet
// revealed (before December 1st) does not count for its recipient.
export async function adventRoles(uid: string, today: ParisDate = parisDate(new Date())): Promise<{ recipient: boolean; owner: boolean }> {
	const rows = await db
		.select({
			ownerId: adventCalendars.ownerId,
			recipientId: adventCalendars.recipientId,
			year: adventCalendars.year,
			revealEarly: adventCalendars.revealEarly
		})
		.from(adventCalendars)
		.where(or(eq(adventCalendars.ownerId, uid), eq(adventCalendars.recipientId, uid)));
	return {
		recipient: rows.some((r) => r.recipientId === uid && isRevealed(r.year, today, r.revealEarly)),
		owner: rows.some((r) => r.ownerId === uid)
	};
}

// The calendar this account opens: this year's, else the most recent one.
// Calendars not yet revealed are invisible to their recipient.
export async function calendarForRecipient(uid: string, today: ParisDate): Promise<AdventCalendar | null> {
	const rows = (
		await db
			.select()
			.from(adventCalendars)
			.where(eq(adventCalendars.recipientId, uid))
			.orderBy(desc(adventCalendars.year))
	).filter((c) => isRevealed(c.year, today, c.revealEarly));
	const year = today.year;
	return rows.find((c) => c.year === year) ?? rows.find((c) => c.year < year) ?? rows[0] ?? null;
}

export async function ownedCalendar(uid: string, id: string): Promise<AdventCalendar | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	return (
		(await db
			.select()
			.from(adventCalendars)
			.where(and(eq(adventCalendars.id, id), eq(adventCalendars.ownerId, uid)))
			.limit(1))[0] ?? null
	);
}

export async function daysOf(calendarId: string): Promise<AdventDay[]> {
	return db.select().from(adventDays).where(eq(adventDays.calendarId, calendarId)).orderBy(adventDays.day);
}

// 24 empty doors, created with the calendar so the editor only ever updates.
export async function createCalendar(ownerId: string, recipientId: string, year: number, title: string) {
	const [cal] = await db.insert(adventCalendars).values({ ownerId, recipientId, year, title }).returning();
	await db
		.insert(adventDays)
		.values(Array.from({ length: ADVENT_DAYS }, (_, i) => ({ calendarId: cal.id, day: i + 1 })));
	return cal;
}

export type DoorState = 'locked' | 'available' | 'open';

export type Door = {
	day: number;
	isMain: boolean;
	state: DoorState;
	daysLeft: number;
	// From the door's date on:
	hint: string | null;
	hintPhoto: string | null;
	// Once opened:
	title: string | null;
	message: string | null;
	yarns: AdventYarn[];
	patternId: string | null;
	patternTitle: string | null;
	coverPath: string | null;
	openedAt: string | null;
};

// What the recipient sees of the doors on `today`. With `reveal` (the lutin's
// preview, after a correct code) a door shows its content as if opened, from
// the lutin's own pattern.
export async function board(days: AdventDay[], year: number, today: ParisDate, reveal: Set<number> = new Set()): Promise<Door[]> {
	const patternIds = days
		.map((d) => (d.openedAt ? d.openedPatternId : reveal.has(d.day) ? d.patternId : null))
		.filter((x): x is string => !!x);
	const pats = patternIds.length
		? await db
				.select({ id: patterns.id, title: patterns.title, coverPath: patterns.coverPath })
				.from(patterns)
				.where(inArray(patterns.id, patternIds))
		: [];
	const byId = new Map(pats.map((p) => [p.id, p]));

	return days.map((d) => {
		const available = isDayAvailable(year, d.day, today);
		const open = !!d.openedAt || (available && reveal.has(d.day));
		const state: DoorState = open ? 'open' : available ? 'available' : 'locked';
		const pid = d.openedAt ? d.openedPatternId : reveal.has(d.day) ? d.patternId : null;
		const pat = pid ? byId.get(pid) : undefined;
		return {
			day: d.day,
			isMain: d.isMain,
			state,
			daysLeft: daysUntil(year, d.day, today),
			hint: state === 'locked' ? null : d.hint,
			hintPhoto: state === 'locked' ? null : d.hintPhotoPath,
			title: open ? d.title : null,
			message: open ? d.message : null,
			yarns: open ? d.yarns : [],
			patternId: open ? (pat?.id ?? null) : null,
			patternTitle: open ? (pat?.title ?? null) : null,
			coverPath: open ? (pat?.coverPath ?? null) : null,
			openedAt: d.openedAt ? d.openedAt.toISOString() : null
		};
	});
}

export type OpenResult =
	| { ok: true }
	| { ok: false; reason: 'notYet' | 'wrong' | 'wait' | 'missing'; minutes?: number };

// Checks a code for a door. `commit` (the recipient) opens it for good and
// hands over the pattern and yarn; without it (the lutin's preview) nothing
// is written, not even the failed attempt.
export async function tryDoor(
	cal: AdventCalendar,
	dayNo: number,
	code: string,
	today: ParisDate,
	now: Date,
	commit: boolean
): Promise<OpenResult> {
	const d = (await db
		.select()
		.from(adventDays)
		.where(and(eq(adventDays.calendarId, cal.id), eq(adventDays.day, dayNo)))
		.limit(1))[0];
	if (!d) return { ok: false, reason: 'missing' };
	if (d.openedAt) return { ok: true };
	if (!isDayAvailable(cal.year, dayNo, today)) return { ok: false, reason: 'notYet' };

	if (commit) {
		const wait = attemptWaitMinutes(d.failedAttempts, d.lastAttemptAt, now);
		if (wait > 0) return { ok: false, reason: 'wait', minutes: wait };
	}
	if (!codeMatches(code, d.code)) {
		if (commit) {
			// After a lockout, the count starts again.
			const reset = d.failedAttempts >= MAX_ATTEMPTS;
			await db
				.update(adventDays)
				.set({ failedAttempts: reset ? 1 : d.failedAttempts + 1, lastAttemptAt: now })
				.where(eq(adventDays.id, d.id));
		}
		return { ok: false, reason: 'wrong' };
	}
	if (!commit) return { ok: true };

	// Claim the door first: two taps on "open" must not give the pattern twice.
	const claimed = await db
		.update(adventDays)
		.set({ openedAt: now, failedAttempts: 0 })
		.where(and(eq(adventDays.id, d.id), isNull(adventDays.openedAt)))
		.returning({ id: adventDays.id });
	if (!claimed.length) return { ok: true };

	try {
		const given = d.patternId ? await givePattern(d.patternId, cal.recipientId, cal.year) : null;
		if (given) await db.update(adventDays).set({ openedPatternId: given }).where(eq(adventDays.id, d.id));
		await giveYarns(d.yarns, cal.recipientId, cal.year, d.day);
	} catch (e) {
		await db.update(adventDays).set({ openedAt: null }).where(eq(adventDays.id, d.id));
		throw e;
	}
	return { ok: true };
}

// Copies the lutin's pattern into the recipient's library: she owns her copy,
// can annotate it and start projects from it, and the lutin's library stays
// private (nothing is shared, so nothing shows before the door opens).
export async function givePattern(sourceId: string, recipientId: string, year: number): Promise<string | null> {
	const src = (await db.select().from(patterns).where(eq(patterns.id, sourceId)).limit(1))[0];
	if (!src) return null;
	const files = await db.select().from(patternFiles).where(eq(patternFiles.patternId, src.id));
	const pieces = await db.select().from(patternPieces).where(eq(patternPieces.patternId, src.id));

	const copied = new Map<string, string>();
	for (const f of files) copied.set(f.storedPath, await copyStored(f.storedPath, recipientId, 'patterns'));
	let coverPath: string | null = null;
	if (src.coverPath) {
		coverPath = copied.get(src.coverPath) ?? (await copyStored(src.coverPath, recipientId, 'patterns/covers').catch(() => null));
	}

	const { id: _id, ownerId: _o, createdAt: _c, updatedAt: _u, ...rest } = src;
	const tags = [...new Set([...(src.tags ?? []), ADVENT_TAG, `avent-${year}`])];
	const [p] = await db
		.insert(patterns)
		.values({ ...rest, ownerId: recipientId, isShared: false, coverPath, tags })
		.returning({ id: patterns.id });
	if (files.length) {
		await db.insert(patternFiles).values(
			files.map((f) => ({
				patternId: p.id,
				filename: f.filename,
				storedPath: copied.get(f.storedPath)!,
				mimeType: f.mimeType,
				sizeBytes: f.sizeBytes,
				isPrimary: f.isPrimary
			}))
		);
	}
	if (pieces.length) {
		await db.insert(patternPieces).values(
			pieces.map((x) => ({
				patternId: p.id,
				name: x.name,
				position: x.position,
				defaultTotalRows: x.defaultTotalRows,
				quantity: x.quantity
			}))
		);
	}
	return p.id;
}

// The day's yarn lands in the recipient's stash.
async function giveYarns(list: AdventYarn[], recipientId: string, year: number, day: number) {
	if (!list.length) return;
	await db.insert(yarns).values(
		list.map((y) => ({
			ownerId: recipientId,
			brand: y.brand || null,
			name: y.name || null,
			colorway: y.colorway || null,
			colorHex: y.colorHex || null,
			weightCategory: y.weightCategory || null,
			fiber: y.fiber || null,
			yardsPerSkein: y.metersPerSkein ? Math.round(y.metersPerSkein) : null,
			gramsPerSkein: y.gramsPerSkein ? Math.round(y.gramsPerSkein) : null,
			skeins: y.skeins,
			notes: `Calendrier de l'Avent ${year}, jour ${day}`
		}))
	);
}

// Hint photos live in the lutin's folder: the recipient may load one once
// its door's date has come (see /media).
export async function isVisibleHintPhoto(uid: string, rel: string, today: ParisDate): Promise<boolean> {
	const rows = await db
		.select({ day: adventDays.day, year: adventCalendars.year })
		.from(adventDays)
		.innerJoin(adventCalendars, eq(adventDays.calendarId, adventCalendars.id))
		.where(and(eq(adventDays.hintPhotoPath, rel), eq(adventCalendars.recipientId, uid)))
		.limit(1);
	return rows.some((r) => isDayAvailable(r.year, r.day, today));
}

export type AdventLayout = {
	recipient: boolean;
	owner: boolean;
	// Phone notifications to schedule for the recipient. Sent even before the
	// calendar is revealed (only a year and a mode, nothing about its content),
	// so the phone can hold the December 1st notification in advance.
	notify: { year: number; mode: NotifyMode; week: string; weekend: string } | null;
	// The most recent door available today and not opened yet, for the
	// in-app reminder. null when there is none.
	waitingDoor: number | null;
};

export async function adventForLayout(uid: string, today: ParisDate = parisDate(new Date())): Promise<AdventLayout> {
	const roles = await adventRoles(uid, today);
	const mine = await db
		.select()
		.from(adventCalendars)
		.where(and(eq(adventCalendars.recipientId, uid), eq(adventCalendars.year, today.year)))
		.limit(1);
	const cal = mine[0];
	let notify: AdventLayout['notify'] = null;
	let waitingDoor: number | null = null;
	if (cal) {
		if (cal.notify !== 'off') notify = { year: cal.year, mode: cal.notify, week: cal.notifyTimeWeek, weekend: cal.notifyTimeWeekend };
		if (isRevealed(cal.year, today, cal.revealEarly)) {
			const closed = await db
				.select({ day: adventDays.day })
				.from(adventDays)
				.where(and(eq(adventDays.calendarId, cal.id), isNull(adventDays.openedAt)));
			const available = closed.map((d) => d.day).filter((d) => isDayAvailable(cal.year, d, today));
			waitingDoor = available.length ? Math.max(...available) : null;
		}
	}
	return { ...roles, notify, waitingDoor };
}
