import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daysFromToday, formatDate, formatDeadline, formatRelativeDays } from './format';

describe('date helpers', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 3, 23, 30)); // 3 Oct 2026, late evening local time
	});
	afterEach(() => vi.useRealTimers());

	it('treats a date column as a local calendar day', () => {
		expect(daysFromToday('2026-10-03')).toBe(0);
		expect(daysFromToday('2026-10-08')).toBe(5);
		expect(daysFromToday('2026-10-01')).toBe(-2);
	});

	it('ignores the time of day', () => {
		expect(daysFromToday(new Date(2026, 9, 4, 0, 5))).toBe(1);
	});

	it('formats in both languages', () => {
		expect(formatDate('fr', '2026-10-03')).toBe('3 oct. 2026');
		expect(formatDate('en', '2026-10-03')).toBe('Oct 3, 2026');
		expect(formatDate('fr', null)).toBe('');
		expect(formatRelativeDays('fr', '2026-10-04')).toBe('demain');
		expect(formatRelativeDays('en', '2026-10-08')).toBe('in 5 days');
		expect(formatDeadline('en', '2026-10-03')).toBe('Oct 3, 2026 · today');
	});
});
