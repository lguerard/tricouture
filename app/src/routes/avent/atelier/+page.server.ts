import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { adventCalendars, adventDays, patterns, users } from '$lib/server/db/schema';
import { createCalendar, daysOf, ownedCalendar } from '$lib/server/advent';
import { deleteStored, isSupportedImage, saveImageUpload } from '$lib/server/storage';
import { ADVENT_DAYS, NOTIFY_MODES, type NotifyMode, ADVENT_TODO_AUTO, ADVENT_TODO_IDS, cleanYarn, normalizeCode, parisDate, type AdventYarn } from '$lib/advent';
import { t } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';

// Yarn lines per day in the editor (kept in sync with +page.svelte).
const YARN_ROWS = 4;

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	const calendars = await db
		.select({ id: adventCalendars.id, title: adventCalendars.title, year: adventCalendars.year, recipientName: users.displayName })
		.from(adventCalendars)
		.innerJoin(users, eq(users.id, adventCalendars.recipientId))
		.where(eq(adventCalendars.ownerId, user.id))
		.orderBy(asc(adventCalendars.year));
	if (!calendars.length && !user.isAdmin) throw error(404, 'Not found');

	const wanted = url.searchParams.get('c');
	const selectedId = calendars.find((c) => c.id === wanted)?.id ?? calendars.at(-1)?.id ?? null;
	const cal = selectedId ? await ownedCalendar(user.id, selectedId) : null;
	const days = cal ? await daysOf(cal.id) : [];

	const myPatterns = await db
		.select({ id: patterns.id, title: patterns.title, craft: patterns.craft, isShared: patterns.isShared })
		.from(patterns)
		.where(eq(patterns.ownerId, user.id))
		.orderBy(asc(patterns.title));

	// Accounts a calendar can be made for (administrators only create).
	const people = user.isAdmin
		? await db
				.select({ id: users.id, displayName: users.displayName })
				.from(users)
				.where(ne(users.id, user.id))
				.orderBy(asc(users.displayName))
		: [];

	return {
		calendars,
		calendar: cal ? { id: cal.id, title: cal.title, message: cal.message, year: cal.year, revealEarly: cal.revealEarly, todoDone: cal.todoDone, notify: cal.notify } : null,
		days,
		myPatterns,
		people,
		canCreate: user.isAdmin,
		thisYear: parisDate(new Date()).year
	};
};

function str(form: FormData, key: string, max: number): string {
	return String(form.get(key) ?? '').trim().slice(0, max);
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = locals.user!;
		if (!user.isAdmin) return fail(403, { error: t(locals.locale, 'advent.err.admin') });
		const form = await request.formData();
		const recipientId = str(form, 'recipientId', 40);
		const year = parseInt(str(form, 'year', 4), 10);
		const title = str(form, 'title', 160) || 'Calendrier de l’Avent';
		if (!recipientId || recipientId === user.id || !(year >= 2020 && year <= 2100)) return fail(400, { error: t(locals.locale, 'advent.err.invalid') });
		const exists = (await db.select({ id: users.id }).from(users).where(eq(users.id, recipientId)).limit(1))[0];
		if (!exists) return fail(400, { error: t(locals.locale, 'advent.err.invalid') });
		const taken = (
			await db
				.select({ id: adventCalendars.id })
				.from(adventCalendars)
				.where(and(eq(adventCalendars.recipientId, recipientId), eq(adventCalendars.year, year)))
				.limit(1)
		)[0];
		if (taken) return fail(400, { error: t(locals.locale, 'advent.err.taken') });
		const cal = await createCalendar(user.id, recipientId, year, title);
		throw redirect(303, `/avent/atelier?c=${cal.id}`);
	},

	saveCalendar: async ({ locals, request }) => {
		const form = await request.formData();
		const cal = await ownedCalendar(locals.user!.id, str(form, 'calendarId', 40));
		if (!cal) return fail(404, { error: t(locals.locale, 'advent.err.missing') });
		await db
			.update(adventCalendars)
			.set({
				title: str(form, 'title', 160) || cal.title,
				message: str(form, 'message', 2000) || null,
				revealEarly: form.get('revealEarly') === 'on',
				notify: (NOTIFY_MODES as readonly string[]).includes(str(form, 'notify', 10)) ? (str(form, 'notify', 10) as NotifyMode) : cal.notify
			})
			.where(eq(adventCalendars.id, cal.id));
		return { ok: true };
	},

	// Ticks or unticks one item of the preparation checklist.
	toggleTodo: async ({ locals, request }) => {
		const form = await request.formData();
		const cal = await ownedCalendar(locals.user!.id, str(form, 'calendarId', 40));
		if (!cal) return fail(404, { error: t(locals.locale, 'advent.err.missing') });
		const id = str(form, 'id', 40);
		if (!ADVENT_TODO_IDS.has(id) || ADVENT_TODO_AUTO.has(id)) return fail(400, { error: t(locals.locale, 'advent.err.invalid') });
		const done = new Set(cal.todoDone);
		if (form.get('done') === 'on') done.add(id);
		else done.delete(id);
		await db.update(adventCalendars).set({ todoDone: [...done] }).where(eq(adventCalendars.id, cal.id));
		return { ok: true };
	},

	saveDay: async ({ locals, request }) => {
		const uid = locals.user!.id;
		const form = await request.formData();
		const cal = await ownedCalendar(uid, str(form, 'calendarId', 40));
		if (!cal) return fail(404, { error: t(locals.locale, 'advent.err.missing') });
		const dayNo = parseInt(str(form, 'day', 2), 10);
		if (!(dayNo >= 1 && dayNo <= ADVENT_DAYS)) return fail(400, { error: t(locals.locale, 'advent.err.invalid') });
		const current = (
			await db
				.select()
				.from(adventDays)
				.where(and(eq(adventDays.calendarId, cal.id), eq(adventDays.day, dayNo)))
				.limit(1)
		)[0];
		if (!current) return fail(404, { error: t(locals.locale, 'advent.err.missing') });

		// Only a pattern of the lutin's own library can be given.
		let patternId: string | null = str(form, 'patternId', 40) || null;
		if (patternId) {
			const own = (
				await db
					.select({ id: patterns.id })
					.from(patterns)
					.where(and(eq(patterns.id, patternId), eq(patterns.ownerId, uid)))
					.limit(1)
			)[0];
			if (!own) patternId = null;
		}

		const yarnList: AdventYarn[] = [];
		for (let i = 0; i < YARN_ROWS; i++) {
			const y = cleanYarn({
				brand: form.get(`y${i}_brand`),
				name: form.get(`y${i}_name`),
				colorway: form.get(`y${i}_colorway`),
				colorHex: form.get(`y${i}_colorHex`),
				weightCategory: form.get(`y${i}_weight`),
				fiber: form.get(`y${i}_fiber`),
				metersPerSkein: form.get(`y${i}_meters`),
				gramsPerSkein: form.get(`y${i}_grams`),
				skeins: form.get(`y${i}_skeins`)
			});
			if (y) yarnList.push(y);
		}

		const code = str(form, 'code', 80);
		if (code && !normalizeCode(code)) return fail(400, { error: t(locals.locale, 'advent.err.badCode'), day: dayNo });

		let hintPhotoPath = current.hintPhotoPath;
		const photo = form.get('hintPhoto');
		if (photo instanceof File && photo.size > 0) {
			if (!isSupportedImage(photo)) return fail(400, { error: t(locals.locale, 'advent.err.badPhoto'), day: dayNo });
			const saved = await saveImageUpload(uid, photo, 'advent');
			if (hintPhotoPath) await deleteStored(hintPhotoPath);
			hintPhotoPath = saved.storedPath;
		} else if (form.get('removePhoto') === 'on' && hintPhotoPath) {
			await deleteStored(hintPhotoPath);
			hintPhotoPath = null;
		}

		await db
			.update(adventDays)
			.set({
				title: str(form, 'title', 160) || null,
				isMain: form.get('isMain') === 'on',
				hint: str(form, 'hint', 4000) || null,
				hintPhotoPath,
				code: code || null,
				patternId,
				yarns: yarnList,
				message: str(form, 'message', 4000) || null
			})
			.where(eq(adventDays.id, current.id));
		return { ok: true, day: dayNo };
	}
};
