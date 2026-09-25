import { describe, expect, it } from 'vitest';
import { assignTagColors, PALETTE_SWATCHES, readableFg, tagStyle } from './tagColor';

describe('assignTagColors', () => {
	it('gives every distinct tag its own color up to the palette size', () => {
		const tags = Array.from({ length: PALETTE_SWATCHES.length }, (_, i) => `tag-${i}`);
		const colors = assignTagColors(tags);
		const distinct = new Set([...colors.values()].map((c) => c.bg));
		expect(distinct.size).toBe(PALETTE_SWATCHES.length);
	});

	it('does not depend on input order or duplicates', () => {
		const a = assignTagColors(['enfant', 'homme', 'pull', 'homme']);
		const b = assignTagColors(['pull', 'homme', 'enfant']);
		for (const tag of ['enfant', 'homme', 'pull']) expect(a.get(tag)).toEqual(b.get(tag));
	});

	it('uses overrides and keeps the others distinct from each other', () => {
		const custom = { bg: '#123456', fg: '#ffffff' };
		const colors = assignTagColors(['a', 'b', 'c'], new Map([['b', custom]]));
		expect(colors.get('b')).toEqual(custom);
		expect(colors.get('a')).not.toEqual(colors.get('c'));
		// The override does not consume a palette slot.
		expect(colors.get('a')).toEqual(PALETTE_SWATCHES[0]);
		expect(colors.get('c')).toEqual(PALETTE_SWATCHES[1]);
	});
});

describe('readableFg', () => {
	it.each([
		['#ffffff', '#111111'],
		['#000000', '#ffffff'],
		['#ffff00', '#111111'],
		['#0000ff', '#ffffff'],
		['#3d3597', '#ffffff'],
		['#efe1ee', '#111111']
	])('%s -> %s', (bg, fg) => {
		expect(readableFg(bg)).toBe(fg);
	});
});

describe('tagStyle', () => {
	it('reads from the precomputed map', () => {
		const colors = new Map([['x', { bg: '#abcdef', fg: '#111111' }]]);
		expect(tagStyle('x', colors)).toBe('--tag-bg:#abcdef;--tag-fg:#111111');
	});

	it('falls back to a palette color for an unknown tag', () => {
		const style = tagStyle('never-seen');
		expect(PALETTE_SWATCHES.some((c) => style === `--tag-bg:${c.bg};--tag-fg:${c.fg}`)).toBe(true);
	});
});
