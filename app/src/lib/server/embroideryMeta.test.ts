import { describe, expect, it } from 'vitest';
import { parseMeta } from './embroideryMeta';

const good = {
	title: '  Fleur  ',
	settings: { sizeMm: 70, colors: 4, removeBackground: true, shape: 'circle', borderThread: 20, backgroundThread: 0, density: 'normal', fabric: '#f3efe7', swaps: { '5': 13 } },
	threads: [5, 37, 20],
	widthMm: 70,
	heightMm: 70,
	stitchCount: 2585
};

describe('parseMeta', () => {
	it('accepts what the editor sends', () => {
		const m = parseMeta(JSON.stringify(good))!;
		expect(m.title).toBe('Fleur');
		expect(m.threads).toEqual([5, 37, 20]);
		expect(m.settings.swaps).toEqual({ '5': 13 });
		expect(m.stitchCount).toBe(2585);
		expect(m.source).toBe('editor');
		expect(parseMeta({ ...good, source: 'import' })!.source).toBe('import');
		expect(parseMeta({ ...good, source: 'other' })!.source).toBe('editor');
	});
	it('rejects broken JSON and bad thread lists', () => {
		expect(parseMeta('{nope')).toBeNull();
		expect(parseMeta(JSON.stringify({ ...good, threads: [] }))).toBeNull();
		expect(parseMeta(JSON.stringify({ ...good, threads: [0, 65] }))).toBeNull();
		expect(parseMeta(JSON.stringify({ ...good, threads: ['5'] }))).toBeNull();
	});
	it('clamps and defaults the settings', () => {
		const m = parseMeta({
			...good,
			title: '',
			settings: { sizeMm: 500, colors: 99, shape: 'star', density: 'max', fabric: 'red;', borderThread: 99, swaps: { x: 3, '2': 70 } }
		})!;
		expect(m.title).toBe('Écusson');
		expect(m.settings).toMatchObject({ sizeMm: 100, colors: 8, shape: 'circle', density: 'normal', fabric: '#f3efe7', borderThread: 20, swaps: {} });
	});
});
