// Partial-credit scores (0-100) for each evaluated task.
//
// Deterministic heuristics rather than an LLM judge: free, fast, and stable
// from one month to the next. They measure what breaks the app when it is
// wrong (the right fields read off a label, the right pieces with their row
// counts, pattern facts, a translation that keeps the numbers and the
// knitting vocabulary) rather than style.
//
// Every criterion has a weight and a value between 0 and 1; a criterion
// with nothing to compare against (a field the stored record leaves empty)
// is left out instead of counting as a miss.

import type { LabelFields } from '../vision';
import type { ParsedPiece } from '../pieces';
import type { SuggestedPatternInfo } from '../patternInfo';

export type Scored = { score: number; notes: string[] };
type Criterion = [weight: number, value: number | null | undefined, note: string];

export function fold(s: unknown): string {
	return String(s ?? '')
		.toLowerCase()
		.replace(/œ/g, 'oe')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
		prev = cur;
	}
	return prev[b.length];
}

// 0-1 resemblance of two strings, ignoring case, accents and punctuation.
export function similarity(a: unknown, b: unknown): number {
	const x = fold(a);
	const y = fold(b);
	if (!x && !y) return 1;
	if (!x || !y) return 0;
	return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

// 1 up to `full`, 0 from `zero`, linear in between.
export function ramp(error: number, full: number, zero: number): number {
	if (error <= full) return 1;
	if (error >= zero) return 0;
	return 1 - (error - full) / (zero - full);
}

function weighted(criteria: Criterion[]): Scored {
	const kept = criteria.filter((c): c is [number, number, string] => c[1] != null);
	const total = kept.reduce((s, [w]) => s + w, 0);
	if (!total) return { score: 0, notes: ['aucun critère mesurable'] };
	const score = (100 * kept.reduce((s, [w, v]) => s + w * v, 0)) / total;
	return {
		score: Math.round(score * 10) / 10,
		notes: kept.filter(([, v]) => v < 1).map(([, v, note]) => `${note} (${Math.round(v * 100)} %)`)
	};
}

const textValue = (got: unknown, want: unknown) => ramp(1 - similarity(got, want), 0.1, 0.5);

// A name or a type: « Pull » for « Pull raglan », « Laine & Lune » for
// « Laine et Lune » are right, just more or less specific.
export function nameValue(got: unknown, want: unknown): number {
	const g = fold(got).replace(/\bet\b/g, ' ').replace(/\s+/g, ' ').trim();
	const w = fold(want).replace(/\bet\b/g, ' ').replace(/\s+/g, ' ').trim();
	if (!g || !w) return 0;
	if (g === w || ` ${g} `.includes(` ${w} `) || ` ${w} `.includes(` ${g} `)) return 1;
	return textValue(g, w);
}

const LETTER_SIZES = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', '3xl', '4xl', '5xl', '6xl'];

// Size list as a set: « XS-XL » = « XS (S, M, L, XL) » = « XS, S, M, L, XL ».
export function sizeSet(text: unknown): Set<string> {
	const t = fold(String(text ?? '').replace(/2xl/gi, 'xxl'));
	const out = new Set<string>();
	const range = t.match(/\b(xxs|xs|s|m|l|xl|xxl|[3-6]xl)\s+(?:a|to)?\s*(xxs|xs|s|m|l|xl|xxl|[3-6]xl)\b/);
	if (range && /[-–àa]|to/.test(String(text))) {
		const [i, j] = [LETTER_SIZES.indexOf(range[1]), LETTER_SIZES.indexOf(range[2])];
		if (i >= 0 && j > i) LETTER_SIZES.slice(i, j + 1).forEach((s) => out.add(s));
	}
	for (const tok of t.match(/\b(xxs|xs|s|m|l|xl|xxl|[3-6]xl|\d{1,3})\b/g) ?? []) out.add(tok);
	return out;
}

const sizesValue = (got: unknown, want: unknown) => {
	const g = sizeSet(got);
	const w = sizeSet(want);
	if (!w.size) return textValue(got, want);
	const inter = [...w].filter((x) => g.has(x)).length;
	return inter / new Set([...g, ...w]).size;
};

const LANGUAGES: Record<string, string> = { francais: 'fr', french: 'fr', anglais: 'en', english: 'en', allemand: 'de', german: 'de', deutsch: 'de', espagnol: 'es', spanish: 'es', italien: 'it', italian: 'it', neerlandais: 'nl', dutch: 'nl' };
const langCode = (v: unknown) => LANGUAGES[fold(v)] ?? fold(v).slice(0, 2);
const relative = (got: number | null | undefined, want: number, full: number, zero: number) =>
	got == null ? 0 : ramp(Math.abs(got - want) / Math.max(Math.abs(want), 1), full, zero);

/* ------------------------------------------------------------------ */
/* Label (vision)                                                     */
/* ------------------------------------------------------------------ */

export type LabelExpected = Partial<Record<keyof LabelFields, string | number | null>>;

export function scoreLabel(got: LabelFields, expected: LabelExpected): Scored {
	if (!got || !Object.keys(got).length) return { score: 0, notes: ['rien de lu (réponse vide ou illisible)'] };
	const c: Criterion[] = [];
	for (const key of ['brand', 'name', 'colorway', 'fiber'] as const) {
		const want = expected[key];
		if (want) c.push([key === 'fiber' ? 1.5 : 1, textValue(got[key], want), `${key} « ${got[key] ?? '—'} », attendu « ${want} »`]);
	}
	if (expected.weightCategory) {
		c.push([1, Number(got.weightCategory === expected.weightCategory), `grosseur ${got.weightCategory ?? '—'}, attendu ${expected.weightCategory}`]);
	}
	if (typeof expected.yardsPerSkein === 'number') {
		c.push([1.5, relative(got.yardsPerSkein, expected.yardsPerSkein, 0.05, 0.3), `métrage ${got.yardsPerSkein ?? '—'} m, attendu ${expected.yardsPerSkein}`]);
	}
	if (typeof expected.gramsPerSkein === 'number') {
		c.push([1.5, relative(got.gramsPerSkein, expected.gramsPerSkein, 0.02, 0.3), `poids ${got.gramsPerSkein ?? '—'} g, attendu ${expected.gramsPerSkein}`]);
	}
	if (typeof expected.needleSizeMm === 'number') {
		c.push([1, relative(got.needleSizeMm, expected.needleSizeMm, 0.02, 0.3), `aiguilles ${got.needleSizeMm ?? '—'} mm`]);
	}
	return weighted(c);
}

/* ------------------------------------------------------------------ */
/* Pattern pieces                                                     */
/* ------------------------------------------------------------------ */

export type PieceExpected = { name: string; rows?: number | null; quantity?: number | null };

function sameName(a: string, b: string): boolean {
	const x = fold(a).replace(/s\b/g, '');
	const y = fold(b).replace(/s\b/g, '');
	if (!x || !y) return false;
	if (x.includes(y) || y.includes(x)) return true;
	return similarity(x, y) >= 0.75;
}

export function scorePieces(got: ParsedPiece[], expected: PieceExpected[]): Scored {
	if (!Array.isArray(got) || !got.length) return { score: 0, notes: ['aucune pièce extraite'] };
	const unused = [...got];
	let found = 0;
	const numbers: number[] = [];
	for (const want of expected) {
		const i = unused.findIndex((p) => sameName(p.name, want.name));
		const match = i >= 0 ? unused.splice(i, 1)[0] : undefined;
		if (match) found++;
		if (want.rows) numbers.push(match?.rows != null ? ramp(Math.abs(match.rows - want.rows) / want.rows, 0.05, 0.3) : 0);
		if (want.quantity && want.quantity > 1) numbers.push(Number(match?.quantity === want.quantity));
	}
	const n = got.length;
	const lo = Math.max(1, Math.floor(expected.length * 0.75));
	const hi = Math.ceil(expected.length * 1.34) + 1;
	const gap = n < lo ? lo - n : n > hi ? n - hi : 0;
	return weighted([
		[15, 1, 'liste exploitable'],
		[45, expected.length ? found / expected.length : null, `pièces retrouvées ${found}/${expected.length}`],
		[15, Math.max(0, 1 - gap * 0.25), `${n} pièces, attendu ${lo}-${hi}`],
		[25, numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null, 'rangs et quantités']
	]);
}

/* ------------------------------------------------------------------ */
/* Pattern info                                                       */
/* ------------------------------------------------------------------ */

export type PatternInfoExpected = {
	tags?: string[];
	garmentType?: string | null;
	designer?: string | null;
	language?: string | null;
	difficulty?: number | null;
	sizes?: string | null;
	gaugeStitches?: number | null;
	gaugeRows?: number | null;
	yardageRequired?: number | null;
};

export function scorePatternInfo(got: SuggestedPatternInfo, expected: PatternInfoExpected, validJson = true): Scored {
	if (!validJson) return { score: 0, notes: ['JSON illisible'] };
	const c: Criterion[] = [[10, 1, 'JSON valide']];
	const text = (key: 'garmentType' | 'designer' | 'sizes', w: number, value: (g: unknown, e: unknown) => number) => {
		if (expected[key]) c.push([w, value(got[key], expected[key]), `${key} « ${got[key] ?? '—'} », attendu « ${expected[key]} »`]);
	};
	text('garmentType', 15, nameValue);
	text('designer', 10, nameValue);
	text('sizes', 10, sizesValue);
	if (expected.language) {
		c.push([10, Number(langCode(got.language) === langCode(expected.language)), `langue ${got.language ?? '—'}, attendu ${expected.language}`]);
	}
	if (expected.difficulty) {
		// A rating the person chose: one level off is a matter of taste.
		const d = got.difficulty == null ? 9 : Math.abs(got.difficulty - expected.difficulty);
		c.push([5, d === 0 ? 1 : d === 1 ? 0.75 : 0, `difficulté ${got.difficulty ?? '—'}, attendu ${expected.difficulty}`]);
	}
	for (const key of ['gaugeStitches', 'gaugeRows'] as const) {
		const want = expected[key];
		if (want) c.push([10, got[key] == null ? 0 : ramp(Math.abs(got[key]! - want), 1, 4), `${key} ${got[key] ?? '—'}, attendu ${want}`]);
	}
	if (expected.yardageRequired) {
		c.push([10, relative(got.yardageRequired, expected.yardageRequired, 0.1, 0.4), `métrage ${got.yardageRequired ?? '—'}, attendu ${expected.yardageRequired}`]);
	}
	if (expected.tags?.length) {
		const want = new Set(expected.tags.map(fold));
		const have = new Set((got.tags ?? []).map(fold));
		const inter = [...want].filter((t) => have.has(t)).length;
		const union = new Set([...want, ...have]).size;
		c.push([10, union ? inter / union : 0, `étiquettes ${[...have].join(', ') || '—'}`]);
	}
	return weighted(c);
}

/* ------------------------------------------------------------------ */
/* Translation (English pattern -> French)                            */
/* ------------------------------------------------------------------ */

// English abbreviation found in the source -> what a correct French
// translation must contain (KNITTING_GLOSSARY in prompts.ts).
export const GLOSSARY: { en: RegExp; fr: RegExp; label: string }[] = [
	{ label: 'k2tog/p2tog', en: /\b[kp]2tog\b/i, fr: /2\s*m(?:ailles|\.)?\s*ens/i },
	{ label: 'ssk', en: /\bssk\b/i, fr: /surjet/i },
	{ label: 'yo', en: /\byo\b/i, fr: /jet[ée]/i },
	{ label: 'CO', en: /\b(?:CO|cast on)\b/, fr: /mont/i },
	{ label: 'BO', en: /\b(?:BO|bind off)\b/, fr: /rabat/i },
	{ label: 'RS', en: /\bRS\b/, fr: /endroit|\bend\b/i },
	{ label: 'WS', en: /\bWS\b/, fr: /envers|\benv\b/i },
	{ label: 'sl st', en: /\bsl st\b/i, fr: /coul[ée]e/i },
	{ label: 'hdc', en: /\bhdc\b/i, fr: /demi[- ]?bride/i },
	{ label: 'dc', en: /\bdc\b/i, fr: /bride/i },
	{ label: 'sc', en: /\bsc\b/i, fr: /serr[ée]e|\bms\b/i },
	{ label: 'ch', en: /\bch\b/i, fr: /en l'air|\bml\b/i },
	{ label: 'rnd', en: /\brnds?\b/i, fr: /\btours?\b/i },
	{ label: 'inc', en: /\binc\b|\bm1\b/i, fr: /augment/i },
	{ label: 'dec', en: /\bdec\b/i, fr: /diminu/i },
	{ label: 'st(s)', en: /\bsts?\b/i, fr: /maille|\bm\b/i }
];

const FR_WORDS = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'et', 'en', 'au', 'aux', 'un', 'une', 'sur', 'jusqu', 'chaque', 'puis', 'rang', 'rangs', 'mailles', 'tricoter', 'avec', 'pour', 'dans']);
const EN_WORDS = new Set(['the', 'and', 'to', 'of', 'with', 'each', 'until', 'then', 'row', 'rows', 'knit', 'purl', 'for', 'in', 'work', 'repeat']);

function numbers(text: string): string[] {
	return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

export function scoreTranslation(source: string, output: string): Scored {
	const out = (output ?? '').trim();
	if (!out) return { score: 0, notes: ['traduction vide'] };
	const want = numbers(source);
	const pool = numbers(out);
	let kept = 0;
	for (const n of want) {
		const i = pool.indexOf(n);
		if (i >= 0) {
			pool.splice(i, 1);
			kept++;
		}
	}
	const terms = GLOSSARY.filter((g) => g.en.test(source));
	const translated = terms.filter((g) => g.fr.test(out));
	const missing = terms.filter((g) => !g.fr.test(out)).map((g) => g.label);
	const words = fold(out).split(' ');
	const fr = words.filter((w) => FR_WORDS.has(w)).length;
	const en = words.filter((w) => EN_WORDS.has(w)).length;
	const ratio = out.length / Math.max(1, source.trim().length);
	return weighted([
		[35, want.length ? kept / want.length : null, `nombres conservés ${kept}/${want.length}`],
		[35, terms.length ? translated.length / terms.length : null, `termes traduits ${translated.length}/${terms.length}${missing.length ? ` (manque ${missing.join(', ')})` : ''}`],
		[20, fr >= 3 && fr > en * 1.5 ? 1 : 0, 'écrit en français'],
		[10, ratio >= 0.6 && ratio <= 1.9 ? 1 : 0, `longueur ${Math.round(ratio * 100)} % de l'original`]
	]);
}
