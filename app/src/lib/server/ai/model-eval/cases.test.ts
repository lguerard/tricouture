import { describe, expect, it } from 'vitest';
import {
	BUNDLED,
	MIN_CASES,
	TASKS,
	casesHash,
	labelExpected,
	orderPatterns,
	orderYarns,
	groundedInText,
	patternInfoCase,
	vocabularyFor,
	piecesCase,
	translationCase,
	translationExcerpt,
	withFallback,
	type PatternRow,
	type YarnRow
} from './cases';

const day = (n: number) => new Date(Date.UTC(2026, 9, 1) - n * 86_400_000);

function pattern(n: number, extra: Partial<PatternRow> = {}): PatternRow {
	return {
		id: `0000000${n}-aaaa-bbbb-cccc-000000000000`,
		title: `Pull ${n}`,
		craft: 'tricot',
		notes: null,
		extractedText: 'DOS : monter 90 mailles, tricoter 84 rangs. '.repeat(10),
		tags: [],
		garmentType: 'Pull',
		designer: 'Laine & Lune',
		language: 'fr',
		difficulty: null,
		sizes: null,
		gaugeStitches: 22,
		gaugeRows: null,
		yardageRequired: null,
		createdAt: day(n),
		updatedAt: day(n),
		...extra
	};
}

function yarn(n: number, extra: Partial<YarnRow> = {}): YarnRow {
	return {
		id: `y000000${n}-0000`,
		brand: 'Drops',
		name: 'Merino',
		colorway: null,
		fiber: '100 % laine',
		weightCategory: null,
		yardsPerSkein: 105,
		gramsPerSkein: 50,
		photoPath: `u/yarns/${n}.jpg`,
		createdAt: day(n),
		...extra
	};
}

describe('bundled cases', () => {
	it('has at least MIN_CASES per task, with real images for labels', () => {
		for (const t of TASKS) expect(BUNDLED[t].length).toBeGreaterThanOrEqual(MIN_CASES);
		for (const c of BUNDLED.label) expect(Buffer.from(c.image, 'base64').subarray(0, 3).toString('hex')).toBe('ffd8ff');
	});
});

describe('harvest', () => {
	it('keeps yarns with a photo and at least three label fields, newest first', () => {
		const rows = [yarn(3), yarn(1), yarn(2, { photoPath: null }), yarn(4, { brand: null, name: null, fiber: null })];
		expect(orderYarns(rows).map((y) => y.id)).toEqual([yarn(1).id, yarn(3).id]);
		expect(labelExpected(yarn(1))).toEqual({ brand: 'Drops', name: 'Merino', fiber: '100 % laine', yardsPerSkein: 105, gramsPerSkein: 50 });
	});

	it('puts edited patterns first, then the newest', () => {
		const edited = pattern(9, { updatedAt: new Date(day(9).getTime() + 3_600_000) });
		const order = orderPatterns([pattern(2), edited, pattern(1)]).map((p) => p.title);
		expect(order).toEqual(['Pull 9', 'Pull 1', 'Pull 2']);
	});

	it('builds a pieces case from saved pieces, in position order', () => {
		const p = pattern(1);
		const c = piecesCase(p, [
			{ patternId: p.id, name: 'Manche', position: 1, defaultTotalRows: 52, quantity: null },
			{ patternId: p.id, name: 'Dos', position: 0, defaultTotalRows: 84, quantity: null },
			{ patternId: 'other', name: 'X', position: 0, defaultTotalRows: null, quantity: null }
		]);
		expect(c?.expected.map((x) => x.name)).toEqual(['Dos', 'Manche']);
		expect(c?.context.startsWith('Pull 1\n\nDOS')).toBe(true);
		expect(piecesCase(p, [])).toBeNull();
	});

	it('needs three info fields stated in the text for a pattern_info case', () => {
		const text = 'Pull Brume par Laine & Lune. Échantillon : 22 mailles = 10 cm. ' + 'DOS : monter 90 mailles. '.repeat(10);
		expect(patternInfoCase(pattern(1, { extractedText: text }))?.expected).toEqual({ garmentType: 'Pull', designer: 'Laine & Lune', language: 'fr', gaugeStitches: 22 });
		expect(patternInfoCase(pattern(1, { extractedText: text, designer: null, language: null }))).toBeNull();
	});

	it('does not score what the text never states', () => {
		// Designer and gauge typed in by hand, absent from the text: no model can find them.
		const c = patternInfoCase(pattern(1, { sizes: 'S-L', difficulty: 3, extractedText: 'Tailles : S (M, L). ' + 'DOS : monter 90 mailles. '.repeat(10) }));
		expect(c?.expected).toEqual({ garmentType: 'Pull', language: 'fr', sizes: 'S-L' });
		expect(groundedInText('difficulty', 3, 'Niveau : facile')).toBe(true);
		expect(groundedInText('yardageRequired', 875, 'soit 875 m')).toBe(true);
		expect(groundedInText('yardageRequired', 875, 'soit 8750 m')).toBe(false);
	});

	it('gives the vocabulary of the person\'s OTHER patterns, like production', () => {
		const text = 'Pull par Laine & Lune, échantillon 22 mailles. ' + 'DOS : monter 90 mailles. '.repeat(10);
		const rows = [
			pattern(1, { ownerId: 'u1', extractedText: text, tags: ['raglan'], garmentType: 'Pull' }),
			pattern(2, { ownerId: 'u1', tags: ['hiver'], garmentType: 'Bonnet', designer: 'Autre' }),
			pattern(3, { ownerId: 'u2', tags: ['secret'], garmentType: 'Châle' })
		];
		const v = patternInfoCase(rows[0], rows)!.vocabulary!;
		expect(v.tags).toEqual(['hiver']);
		expect(v.garmentTypes).toEqual(['Bonnet']);
		expect(vocabularyFor(rows[0], rows).designers).toEqual(['Autre']);
	});

	it('translates only English patterns, as a bounded excerpt', () => {
		expect(translationCase(pattern(1))).toBeNull();
		const en = translationCase(pattern(1, { language: 'en', extractedText: 'Row 1: k2, p2.\n'.repeat(300) }));
		expect(en?.text.length).toBeLessThanOrEqual(1500);
		expect(translationExcerpt('a\n\n  b   c\n')).toBe('a\nb c');
	});

	it('tops up with bundled cases when the database has too few', () => {
		type C = { id: string; source: 'db' | 'bundled' };
		const db: C[] = [{ id: 'x', source: 'db' }];
		const bundled: C[] = [1, 2, 3, 4].map((n) => ({ id: `b${n}`, source: 'bundled' }));
		expect(withFallback(db, bundled, 12).map((c) => c.id)).toEqual(['x', 'b1', 'b2']);
		expect(withFallback([], bundled, 12)).toHaveLength(4);
		expect(withFallback([], bundled, 2)).toHaveLength(2);
		const many: C[] = [1, 2, 3, 4, 5].map((n) => ({ id: `d${n}`, source: 'db' }));
		expect(withFallback(many, bundled, 4).map((c) => c.id)).toEqual(['d1', 'd2', 'd3', 'd4']);
	});

	it('fingerprints the case set', () => {
		const other = { ...BUNDLED, translation: BUNDLED.translation.slice(1) };
		expect(casesHash(BUNDLED)).toBe(casesHash({ ...BUNDLED }));
		expect(casesHash(BUNDLED)).not.toBe(casesHash(other));
	});
});
