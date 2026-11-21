import { error, fail, redirect } from '@sveltejs/kit';
import { adventRoles, board, calendarForRecipient, daysOf, ownedCalendar, tryDoor } from '$lib/server/advent';
import { parisDate, parseIsoDate, type ParisDate } from '$lib/advent';
import type { AdventCalendar } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

// The calendar shown, and on which date: the recipient's own on today's date,
// or, for the lutin, any of theirs on a chosen date (?preview=<id>&date=).
async function resolve(uid: string, url: URL): Promise<{ cal: AdventCalendar; today: ParisDate; preview: boolean } | null> {
	const previewId = url.searchParams.get('preview');
	if (previewId) {
		const cal = await ownedCalendar(uid, previewId);
		if (!cal) return null;
		const today = parseIsoDate(url.searchParams.get('date')) ?? parisDate(new Date());
		return { cal, today, preview: true };
	}
	const today = parisDate(new Date());
	const cal = await calendarForRecipient(uid, today);
	return cal ? { cal, today, preview: false } : null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	const r = await resolve(user.id, url);
	if (!r) {
		const roles = await adventRoles(user.id);
		if (roles.owner || user.isAdmin) throw redirect(303, '/avent/atelier');
		throw error(404, 'Not found');
	}
	const days = await daysOf(r.cal.id);
	const doors = await board(days, r.cal.year, r.today);
	return {
		calendar: { id: r.cal.id, title: r.cal.title, message: r.cal.message, year: r.cal.year },
		doors,
		today: r.today,
		preview: r.preview,
		previewDate: r.preview ? url.searchParams.get('date') : null
	};
};

export const actions: Actions = {
	open: async ({ locals, request, url }) => {
		const uid = locals.user!.id;
		const r = await resolve(uid, url);
		if (!r) return fail(404, { reason: 'missing' as const, day: 0 });
		const form = await request.formData();
		const day = Number(form.get('day'));
		const code = String(form.get('code') ?? '').slice(0, 200);
		const res = await tryDoor(r.cal, day, code, r.today, new Date(), !r.preview);
		if (!res.ok) return fail(400, { reason: res.reason, minutes: res.minutes ?? 0, day });
		if (r.preview) {
			// Nothing was written: show the content as she will see it.
			const [door] = await board((await daysOf(r.cal.id)).filter((d) => d.day === day), r.cal.year, r.today, new Set([day]));
			return { opened: day, door };
		}
		return { opened: day };
	}
};
