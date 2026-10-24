import { describe, expect, it } from 'vitest';
import { CANDIDATE_SIZE_TAGS, CURATED_FAMILIES, estimateVramGb } from './candidates';

describe('model-watch candidates', () => {
	it('lets an ~8 GB model fit a 10 GB card budget, not a 9 GB one', () => {
		expect(estimateVramGb(8)).toBeLessThanOrEqual(10);
		expect(estimateVramGb(8)).toBeGreaterThan(8);
		expect(estimateVramGb(9)).toBeGreaterThan(9.5);
	});

	it('grows with the context window', () => {
		expect(estimateVramGb(8, 16384)).toBeGreaterThan(estimateVramGb(8, 8192));
	});

	it('knows the recent families and sizes', () => {
		expect(CURATED_FAMILIES).toEqual(expect.arrayContaining(['gemma4', 'qwen3.5']));
		expect(CANDIDATE_SIZE_TAGS).toEqual(expect.arrayContaining(['4b', 'e4b', '12b', '7b', '14b']));
	});
});
