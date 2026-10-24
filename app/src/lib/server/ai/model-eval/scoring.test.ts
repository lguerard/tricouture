import { describe, expect, it } from 'vitest';
import { scoreLabel, scorePatternInfo, scorePieces, scoreTranslation, similarity } from './scoring';

describe('similarity', () => {
	it('ignores case, accents and punctuation', () => {
		expect(similarity('Mérinos Douceur', 'merinos douceur')).toBe(1);
		expect(similarity('Rouille 052', 'Rouille 52')).toBeGreaterThan(0.8);
		expect(similarity('abc', '')).toBe(0);
	});
});

describe('scoreLabel', () => {
	const expected = { brand: 'Filature des Monts', name: 'Mérinos Douceur', weightCategory: 'dk', yardsPerSkein: 105, gramsPerSkein: 50 };
	it('gives full marks to a perfect read and partial credit otherwise', () => {
		expect(scoreLabel({ brand: 'Filature des Monts', name: 'Merinos Douceur', weightCategory: 'dk', yardsPerSkein: 105, gramsPerSkein: 50 }, expected).score).toBe(100);
		const partial = scoreLabel({ brand: 'Filature des Monts', weightCategory: 'worsted', yardsPerSkein: 110, gramsPerSkein: 50 }, expected);
		expect(partial.score).toBeGreaterThan(30);
		expect(partial.score).toBeLessThan(80);
		expect(partial.notes.join(' ')).toContain('grosseur worsted');
	});
	it('scores an empty read 0', () => {
		expect(scoreLabel({}, expected).score).toBe(0);
	});
});

describe('scorePieces', () => {
	const expected = [{ name: 'Dos', rows: 84 }, { name: 'Devant', rows: 84 }, { name: 'Manche', rows: 52 }, { name: 'Col' }];
	it('matches names loosely and checks the numbers', () => {
		const perfect = [{ name: 'Dos', rows: 84 }, { name: 'Devant', rows: 84 }, { name: 'Manches', rows: 52 }, { name: 'Col' }];
		expect(scorePieces(perfect, expected).score).toBe(100);
		const wrongRows = scorePieces([{ name: 'Dos', rows: 40 }, { name: 'Devant' }, { name: 'Manche', rows: 52 }, { name: 'Col' }], expected);
		expect(wrongRows.score).toBeGreaterThan(60);
		expect(wrongRows.score).toBeLessThan(100);
	});
	it('scores nothing 0 and a partial list partially', () => {
		expect(scorePieces([], expected).score).toBe(0);
		const half = scorePieces([{ name: 'Dos', rows: 84 }, { name: 'Devant', rows: 84 }], expected).score;
		expect(half).toBeGreaterThan(30);
		expect(half).toBeLessThan(80);
	});
	it('checks couture quantities', () => {
		const exp = [{ name: 'Dos jupe', quantity: 2 }, { name: 'Poche', quantity: 4 }];
		expect(scorePieces([{ name: 'Dos jupe', quantity: 2 }, { name: 'Poche', quantity: 4 }], exp).score).toBe(100);
		expect(scorePieces([{ name: 'Dos jupe' }, { name: 'Poche', quantity: 4 }], exp).score).toBeLessThan(100);
	});
});

describe('scorePatternInfo', () => {
	const expected = { garmentType: 'Pull', designer: 'Laine & Lune', language: 'fr', difficulty: 3, gaugeStitches: 22, yardageRequired: 875 };
	it('rewards matching fields with tolerance', () => {
		expect(scorePatternInfo({ tags: [], garmentType: 'pull', designer: 'Laine & Lune', language: 'fr', difficulty: 3, gaugeStitches: 22, yardageRequired: 900 }, expected).score).toBe(100);
		const some = scorePatternInfo({ tags: [], garmentType: 'Gilet', language: 'fr', difficulty: 4 }, expected);
		expect(some.score).toBeGreaterThan(10);
		expect(some.score).toBeLessThan(60);
	});
	it('scores unreadable JSON 0', () => {
		expect(scorePatternInfo({ tags: [] }, expected, false).score).toBe(0);
	});
});

describe('scoreTranslation', () => {
	const source = 'CO 96 sts. Rnd 1: *k10, k2tog; rep from * (88 sts). BO all sts on a WS row.';
	it('checks numbers, knitting terms and the output language', () => {
		const good = scoreTranslation(source, 'Monter 96 m. Tour 1 : *10 m. end., 2 m. ens. à l\'end. ; répéter depuis * (88 m.). Rabattre toutes les mailles sur un rang envers.');
		expect(good.score).toBe(100);
		const untranslated = scoreTranslation(source, source);
		expect(untranslated.score).toBeLessThan(60);
		const lostNumbers = scoreTranslation(source, 'Monter les mailles. Tricoter le tour en répétant 2 m. ens. et rabattre sur l\'envers des mailles.');
		expect(lostNumbers.score).toBeLessThan(good.score);
		expect(lostNumbers.notes.join(' ')).toContain('nombres conservés 1/5');
	});
	it('scores an empty answer 0', () => {
		expect(scoreTranslation(source, '  ').score).toBe(0);
	});
});
