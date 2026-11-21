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
	parseIsoDate
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
