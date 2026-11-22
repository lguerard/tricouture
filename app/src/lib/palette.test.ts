import { describe, expect, it } from 'vitest';
import { hexToLch, parseHex, THEME_SWATCHES, themeCss, themeVars, tone } from './palette';

const lum = (hex: string) => hexToLch(hex).l;

describe('tone', () => {
	it('gives back a displayable color unchanged (within 1/255)', () => {
		for (const hex of ['#7c4d8b', '#1565c0', '#2e7d32', '#e65100', '#9e9e9e']) {
			const { l, c, h } = hexToLch(hex);
			const back = parseHex(tone(h, c, l))!;
			parseHex(hex)!.forEach((v, i) => expect(Math.abs(v - back[i])).toBeLessThanOrEqual(1));
		}
	});

	it('keeps the requested lightness, losing chroma rather than hue when out of gamut', () => {
		const { h } = hexToLch('#1565c0');
		for (const t of [10, 40, 70, 92]) {
			const out = tone(h, 120, t); // chroma impossible : réduit
			expect(Math.abs(lum(out) - t)).toBeLessThan(1);
			expect(Math.abs(hexToLch(out).h - h)).toBeLessThan(3);
		}
		expect(tone(h, 40, 0)).toBe('#000000');
		expect(tone(h, 40, 100)).toBe('#ffffff');
	});
});

describe('themeVars', () => {
	it('derives a light and a dark theme with readable contrast from any swatch', () => {
		for (const seed of THEME_SWATCHES) {
			const light = themeVars(seed, false);
			const dark = themeVars(seed, true);
			expect(lum(light['--bg'])).toBeGreaterThan(95);
			expect(lum(light['--text'])).toBeLessThan(20);
			expect(lum(dark['--bg'])).toBeLessThan(10);
			expect(lum(dark['--text'])).toBeGreaterThan(88);
			// Texte sur bouton d'accent : écart de luminance suffisant.
			expect(lum(light['--on-accent']) - lum(light['--accent'])).toBeGreaterThan(50);
			expect(lum(dark['--accent']) - lum(dark['--on-accent'])).toBeGreaterThan(50);
		}
	});

	it('keeps the hue of the chosen color', () => {
		const seedHue = hexToLch('#2e7d32').h;
		const accent = themeVars('#2e7d32', false)['--accent'];
		expect(Math.abs(hexToLch(accent).h - seedHue)).toBeLessThan(4);
	});

	it('matches the original purple palette closely for the default swatch', () => {
		const light = themeVars('#7c4d8b', false);
		expect(Math.abs(lum(light['--accent']) - lum('#7c4d8b'))).toBeLessThan(2);
		expect(Math.abs(lum(themeVars('#7c4d8b', true)['--accent']) - lum('#c49ad4'))).toBeLessThan(2);
	});
});

describe('themeCss', () => {
	it('covers chosen light, chosen dark and system dark, above app.css rules', () => {
		const css = themeCss('#1565c0');
		expect(css).toContain('html:root{');
		expect(css).toContain("html:root[data-theme='dark']{");
		expect(css).toContain("@media (prefers-color-scheme: dark){html:root:not([data-theme='light']){");
		expect(css).not.toMatch(/<|\/\*/); // rien d'autre que des déclarations
	});

	it('rejects invalid colors', () => {
		expect(() => themeVars('red', false)).toThrow();
		expect(parseHex('#12345')).toBeNull();
	});
});
