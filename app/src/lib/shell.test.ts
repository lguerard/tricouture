import { describe, expect, it } from 'vitest';
import { bounceUrl, isShellOrigin, parseShellHash, shouldSend } from './shell';

describe('shell origin', () => {
	it('accepts only the app’s own local origin', () => {
		expect(isShellOrigin('https://localhost')).toBe(true);
		expect(isShellOrigin('capacitor://localhost')).toBe(true);
		expect(isShellOrigin('https://evil.example')).toBe(false);
		expect(isShellOrigin('https://localhost.evil.example')).toBe(false);
		expect(isShellOrigin('https://localhost/path')).toBe(false);
		expect(isShellOrigin('javascript:alert(1)')).toBe(false);
	});
});

describe('parseShellHash', () => {
	it('reads the start page’s announcement', () => {
		expect(parseShellHash('#tc_shell=https%3A%2F%2Flocalhost&tc_v=2')).toEqual({ shell: { origin: 'https://localhost', version: 2 }, ack: null });
	});
	it('ignores a foreign address', () => {
		expect(parseShellHash('#tc_shell=https%3A%2F%2Fevil.example&tc_v=2').shell).toBeNull();
	});
	it('reads an acknowledgement', () => {
		expect(parseShellHash('#tc_advent=2026%3Afirst%3Afr&tc_result=ok').ack).toEqual({ sig: '2026:first:fr', result: 'ok' });
	});
	it('reads the Material You color', () => {
		expect(parseShellHash('#tc_shell=https%3A%2F%2Flocalhost&tc_v=3&tc_accent=%233F7A5C').accent).toBe('#3f7a5c');
		expect(parseShellHash('#tc_shell=https%3A%2F%2Flocalhost&tc_v=3&tc_accent=none').accent).toBeNull();
		expect(parseShellHash('#tc_shell=https%3A%2F%2Flocalhost&tc_v=3&tc_accent=red;x').accent).toBeNull();
		expect(parseShellHash('#tc_shell=https%3A%2F%2Flocalhost&tc_v=2')).not.toHaveProperty('accent');
	});
	it('returns nothing for an ordinary hash', () => {
		expect(parseShellHash('#day-3')).toEqual({ shell: null, ack: null });
	});
});

describe('shouldSend', () => {
	const now = 1_000_000_000_000;
	it('sends a new plan once', () => {
		expect(shouldSend('2026:first:fr', null, 0, now)).toBe(true);
		expect(shouldSend('2026:first:fr', '2026:first:fr', 0, now)).toBe(false);
	});
	it('sends a change, including a cancellation', () => {
		expect(shouldSend('2026:daily:fr', '2026:first:fr', 0, now)).toBe(true);
		expect(shouldSend('none', '2026:first:fr', 0, now)).toBe(true);
	});
	it('does nothing when there was never anything to schedule', () => {
		expect(shouldSend('none', null, 0, now)).toBe(false);
	});
	it('waits before trying again', () => {
		expect(shouldSend('2026:first:fr', null, now - 3600_000, now)).toBe(false);
		expect(shouldSend('2026:first:fr', null, now - 13 * 3600_000, now)).toBe(true);
	});
});

describe('bounceUrl', () => {
	it('points to the local start page with the plan in the hash', () => {
		const url = bounceUrl({ origin: 'https://localhost', version: 2 }, { plan: [], ids: [1], sig: 's', back: 'https://srv/' });
		expect(url.startsWith('https://localhost/index.html#advent=')).toBe(true);
		expect(JSON.parse(decodeURIComponent(url.split('#advent=')[1]))).toEqual({ plan: [], ids: [1], sig: 's', back: 'https://srv/' });
	});
});
