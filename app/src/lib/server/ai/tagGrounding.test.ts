import { describe, expect, it } from 'vitest';
import { groundTags, sameTag, tagKey } from './tagGrounding';
import { buildVocabulary } from '../vocabularyRanking';

describe('tagKey / sameTag', () => {
	it('folds case, accents, "d\'", hyphens and plurals', () => {
		expect(tagKey("D'hiver")).toBe('hiver');
		expect(tagKey('Sans-couture')).toBe('sans couture');
		expect(sameTag('Torsades', 'torsade')).toBe(true);
		expect(sameTag('Bébé', 'bebe')).toBe(true);
	});

	it('knows French/English synonyms', () => {
		expect(sameTag('top-down', 'de haut en bas')).toBe(true);
		expect(sameTag('dentelle', 'Lace')).toBe(true);
		expect(sameTag('dentelle', 'torsade')).toBe(false);
	});
});

describe('groundTags', () => {
	it('drops technique and material tags the text never mentions', () => {
		expect(groundTags(['raglan', 'mohair', 'dentelle'], { text: 'Pull raglan en laine' })).toEqual(['raglan']);
	});

	it('accepts a French tag on an English pattern through its synonym', () => {
		expect(groundTags(['dentelle', 'torsade', 'sans couture'], { text: 'Lace shawl with cables, seamless' })).toEqual([
			'dentelle',
			'torsade',
			'sans couture'
		]);
	});

	it('accepts a word stem and a plural', () => {
		expect(groundTags(['tricot', 'torsades'], { text: 'Bonnet à tricoter, motif torsadé' })).toEqual(['tricot', 'torsades']);
	});

	it('still applies the season and audience rules', () => {
		expect(groundTags(['hiver', 'homme'], { text: 'Débardeur Lina', garmentType: 'débardeur' })).toEqual([]);
	});
});

describe('buildVocabulary', () => {
	it('lists the most used values first and merges variants under the usual spelling', () => {
		const rows = [
			{ tags: ['torsades', 'hiver'], garmentType: 'Pull', designer: null },
			{ tags: ['torsade', 'hiver'], garmentType: 'Pull', designer: null },
			{ tags: ['Torsades', 'raglan', 'hiver'], garmentType: 'Bonnet', designer: 'Laine & Lune' }
		];
		const v = buildVocabulary(rows);
		expect(v.tags).toEqual(['torsades', 'hiver', 'raglan']);
		expect(v.garmentTypes).toEqual(['Pull', 'Bonnet']);
	});
});
