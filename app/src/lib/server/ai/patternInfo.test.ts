import { beforeEach, describe, expect, it, vi } from 'vitest';

const generate = vi.fn<(...args: unknown[]) => Promise<string>>();
vi.mock('./ollama', () => ({ generate: (...args: unknown[]) => generate(...args) }));

const { mergePatternInfo, mergeTags, normalizeInfoLanguage, suggestPatternInfo } = await import('./patternInfo');

const empty = {
	tags: [],
	garmentType: null,
	designer: null,
	language: null,
	difficulty: null,
	sizes: null,
	gaugeStitches: null,
	gaugeRows: null,
	yardageRequired: null
};

describe('normalizeInfoLanguage', () => {
	it('accepts fr/en and defaults to fr', () => {
		expect(normalizeInfoLanguage('en')).toBe('en');
		expect(normalizeInfoLanguage('fr')).toBe('fr');
		expect(normalizeInfoLanguage('de')).toBe('fr');
		expect(normalizeInfoLanguage(null)).toBe('fr');
	});
});

describe('mergeTags', () => {
	it('adds new tags without case-insensitive duplicates, keeping existing order', () => {
		expect(mergeTags(['Pull', 'laine'], ['pull', 'Raglan', 'LAINE'])).toEqual(['Pull', 'laine', 'Raglan']);
	});

	it('re-cases a suggestion to the spelling already used in the library', () => {
		expect(mergeTags([], ['hiver', 'Top-down'], ['Hiver', 'top-down'])).toEqual(['Hiver', 'top-down']);
	});
});

describe('mergePatternInfo', () => {
	it('fills only empty fields', () => {
		const { updates } = mergePatternInfo(
			{ ...empty, designer: 'Déjà là', difficulty: 2 },
			{ tags: [], designer: 'Autre', difficulty: 4, garmentType: 'pull', gaugeStitches: 22 }
		);
		expect(updates).toEqual({ garmentType: 'pull', gaugeStitches: 22 });
	});

	it('only reports tags when they changed', () => {
		expect(mergePatternInfo({ ...empty, tags: ['a'] }, { tags: ['A'] }).updates).toEqual({});
		expect(mergePatternInfo({ ...empty, tags: ['a'] }, { tags: ['b'] }).updates).toEqual({ tags: ['a', 'b'] });
	});

	it('canonicalizes garment type and designer against the vocabulary', () => {
		const { updates } = mergePatternInfo(
			empty,
			{ tags: [], garmentType: 'PULL', designer: 'petite knit' },
			{ tags: [], garmentTypes: ['Pull'], designers: ['PetiteKnit', 'Petite Knit'] }
		);
		expect(updates.garmentType).toBe('Pull');
		expect(updates.designer).toBe('Petite Knit');
	});
});

describe('suggestPatternInfo', () => {
	beforeEach(() => generate.mockReset());

	it('parses fenced JSON and cleans every field', async () => {
		generate.mockResolvedValue(
			'```json\n' +
				JSON.stringify({
					title: 'Pull Lina',
					tags: ['raglan', 'Raglan', '…', 'x'.repeat(200)],
					garmentType: 'pull',
					designer: '?',
					difficulty: 9,
					gaugeStitches: '22.26',
					yardageRequired: 850.4
				}) +
				'\n```'
		);
		const info = await suggestPatternInfo('Pull Lina, un pull raglan');
		expect(info.title).toBe('Pull Lina');
		expect(info.tags).toEqual(['raglan']);
		expect(info.designer).toBeUndefined();
		expect(info.difficulty).toBeUndefined();
		expect(info.gaugeStitches).toBe(22.3);
		expect(info.yardageRequired).toBe(850);
	});

	it('returns nothing rather than throwing on a non-JSON reply', async () => {
		generate.mockResolvedValue('Désolé, je ne peux pas.');
		await expect(suggestPatternInfo('texte')).resolves.toEqual({ tags: [] });
	});

	it('drops season/audience tags the text does not support', async () => {
		generate.mockResolvedValue(JSON.stringify({ tags: ['hiver', 'homme', 'dentelle'], garmentType: 'débardeur' }));
		const info = await suggestPatternInfo('Débardeur Lina en dentelle');
		expect(info.tags).toEqual(['dentelle']);
	});
});
