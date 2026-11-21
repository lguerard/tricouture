import { describe, expect, it } from 'vitest';
import {
	ADVENT_DAYS,
	DOOR_ORDER,
	attemptWaitMinutes,
	cleanYarn,
	codeMatches,
	daysUntil,
	isDayAvailable,
	normalizeCode,
	parisDate,
	parseIsoDate,
	isRevealed,
	ADVENT_TODO,
	ADVENT_TODO_AUTO,
	ADVENT_TODO_IDS,
	parisInstant,
	notificationPlan,
	parseTodoText,
	groupTodos
} from './advent';

describe('parisDate', () => {
	it('uses the Paris calendar day, not UTC', () => {
		// 23:30 UTC on Nov 30 is already Dec 1 in Paris (UTC+1 in winter).
		expect(parisDate(new Date('2026-11-30T23:30:00Z'))).toEqual({ year: 2026, month: 12, day: 1 });
		expect(parisDate(new Date('2026-11-30T22:59:00Z'))).toEqual({ year: 2026, month: 11, day: 30 });
	});
});

describe('door availability', () => {
	it('opens door N on December N and stays open after', () => {
		const dec5 = { year: 2026, month: 12, day: 5 };
		expect(isDayAvailable(2026, 5, dec5)).toBe(true);
		expect(isDayAvailable(2026, 1, dec5)).toBe(true);
		expect(isDayAvailable(2026, 6, dec5)).toBe(false);
		expect(isDayAvailable(2026, 24, { year: 2027, month: 1, day: 2 })).toBe(true);
	});
	it('keeps everything closed in November and for another year', () => {
		expect(isDayAvailable(2026, 1, { year: 2026, month: 11, day: 30 })).toBe(false);
		expect(isDayAvailable(2027, 1, { year: 2026, month: 12, day: 24 })).toBe(false);
	});
	it('rejects days outside 1..24', () => {
		const d = { year: 2026, month: 12, day: 31 };
		expect(isDayAvailable(2026, 0, d)).toBe(false);
		expect(isDayAvailable(2026, 25, d)).toBe(false);
		expect(isDayAvailable(2026, 2.5, d)).toBe(false);
	});
	it('counts the days left', () => {
		expect(daysUntil(2026, 1, { year: 2026, month: 11, day: 21 })).toBe(10);
		expect(daysUntil(2026, 3, { year: 2026, month: 12, day: 7 })).toBe(0);
	});
});

describe('parseIsoDate', () => {
	it('parses valid dates only', () => {
		expect(parseIsoDate('2026-12-05')).toEqual({ year: 2026, month: 12, day: 5 });
		expect(parseIsoDate('2026-02-30')).toBeNull();
		expect(parseIsoDate('5/12/2026')).toBeNull();
		expect(parseIsoDate(null)).toBeNull();
	});
});

describe('codes', () => {
	it('ignores case, accents, spaces and punctuation', () => {
		expect(normalizeCode(' Traîneau ! ')).toBe('traineau');
		expect(codeMatches('TRAINEAU', 'traîneau')).toBe(true);
		expect(codeMatches('pere noel', 'Père-Noël')).toBe(true);
		expect(codeMatches('flocon', 'houx')).toBe(false);
	});
	it('never matches an empty code', () => {
		expect(codeMatches('', '')).toBe(false);
		expect(codeMatches('!!', '?')).toBe(false);
		expect(codeMatches('x', null)).toBe(false);
	});
});

describe('attempt guard', () => {
	const now = new Date('2026-12-05T10:00:00Z');
	it('lets the first attempts through', () => {
		expect(attemptWaitMinutes(5, new Date(now.getTime() - 1000), now)).toBe(0);
	});
	it('makes the guesser wait after too many wrong codes', () => {
		expect(attemptWaitMinutes(6, new Date(now.getTime() - 60_000), now)).toBe(9);
		expect(attemptWaitMinutes(6, new Date(now.getTime() - 11 * 60_000), now)).toBe(0);
	});
});

describe('doors', () => {
	it('lays out every day exactly once', () => {
		expect([...DOOR_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1));
	});
});

describe('cleanYarn', () => {
	it('drops empty lines and cleans numbers and colours', () => {
		expect(cleanYarn({ brand: ' ', name: '' })).toBeNull();
		expect(
			cleanYarn({ brand: 'DROPS', name: 'Lima', colorway: 'Cobalt', colorHex: '#1F4FD1', skeins: '4', metersPerSkein: '100', gramsPerSkein: 'x' })
		).toMatchObject({ brand: 'DROPS', colorHex: '#1f4fd1', skeins: 4, metersPerSkein: 100, gramsPerSkein: null });
		expect(cleanYarn({ name: 'Nepal', colorHex: 'red', skeins: '0' })).toMatchObject({ colorHex: '', skeins: 1 });
	});
});

describe('reveal date', () => {
	it('hides the calendar from the recipient until December 1st', () => {
		expect(isRevealed(2026, { year: 2026, month: 11, day: 30 }, false)).toBe(false);
		expect(isRevealed(2026, { year: 2026, month: 12, day: 1 }, false)).toBe(true);
		expect(isRevealed(2026, { year: 2027, month: 1, day: 5 }, false)).toBe(true);
	});
	it('shows it early when the lutin asks', () => {
		expect(isRevealed(2026, { year: 2026, month: 11, day: 21 }, true)).toBe(true);
	});
});

describe('preparation checklist', () => {
	it('has unique ids', () => {
		const all = ADVENT_TODO.flatMap((g) => g.ids);
		expect(new Set(all).size).toBe(all.length);
		expect([...ADVENT_TODO_AUTO].every((id) => ADVENT_TODO_IDS.has(id))).toBe(true);
	});
});

describe('notifications', () => {
	it('fires at 8:00 Paris time, winter and summer', () => {
		expect(parisInstant(2026, 12, 1, 8).toISOString()).toBe('2026-12-01T07:00:00.000Z');
		expect(parisInstant(2026, 7, 1, 8).toISOString()).toBe('2026-07-01T06:00:00.000Z');
	});
	it('plans December 1st only, every day, or nothing', () => {
		const now = new Date('2026-11-21T10:00:00Z');
		expect(notificationPlan(2026, 'first', now).map((n) => n.day)).toEqual([1]);
		expect(notificationPlan(2026, 'daily', now)).toHaveLength(24);
		expect(notificationPlan(2026, 'off', now)).toEqual([]);
	});
	it('skips notifications already past', () => {
		const now = new Date('2026-12-05T12:00:00Z');
		expect(notificationPlan(2026, 'first', now)).toEqual([]);
		expect(notificationPlan(2026, 'daily', now)[0].day).toBe(6);
	});
});

describe('custom tasks', () => {
	let n = 0;
	const id = () => String(++n);
	it('reads groups, titles and notes from pasted text', () => {
		const list = parseTodoText('# Commande\nCommander la laine | 60 pelotes\n\n- Acheter les patrons\n## Téléphone\nInstaller l’APK', id);
		expect(list.map((x) => [x.group, x.title, x.note])).toEqual([
			['Commande', 'Commander la laine', '60 pelotes'],
			['Commande', 'Acheter les patrons', ''],
			['Téléphone', 'Installer l’APK', '']
		]);
		expect(new Set(list.map((x) => x.id)).size).toBe(3);
		expect(list.every((x) => x.id.startsWith('c-'))).toBe(true);
	});
	it('ignores empty lines and lines without a title', () => {
		expect(parseTodoText('\n   \n| juste une note\n#\n', id)).toEqual([]);
	});
	it('keeps groups in the order they first appear', () => {
		const list = parseTodoText('# B\nb1\n# A\na1\n# B\nb2', id);
		expect(groupTodos(list).map((g) => [g.group, g.items.map((i) => i.title)])).toEqual([
			['B', ['b1', 'b2']],
			['A', ['a1']]
		]);
	});
});
