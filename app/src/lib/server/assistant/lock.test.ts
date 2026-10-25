import { describe, expect, it } from 'vitest';
import { isLocked, tryLock } from './lock';

describe('per-account lock', () => {
	it('allows one answer at a time per account, independently of others', () => {
		const release = tryLock('u1');
		expect(release).toBeTypeOf('function');
		expect(tryLock('u1')).toBeNull();
		const other = tryLock('u2');
		expect(other).not.toBeNull();
		release!();
		release!(); // twice is harmless
		expect(isLocked('u1')).toBe(false);
		const again = tryLock('u1');
		expect(again).not.toBeNull();
		again!();
		other!();
	});
});
