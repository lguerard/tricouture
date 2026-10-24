// Evaluation cases: harvested from the app's REAL data at run time
// (harvest.ts), with these bundled cases as the fallback when the database
// has too few for a task (at least MIN_CASES per task).
//
// What the database keeps, and so what can serve as ground truth:
//   - label: yarns with a stored photo and at least three label fields filled
//     in (brand, name, colorway, fiber, weight, meters, grams) -- the fields
//     the person kept after the scan pre-filled the form;
//   - pieces: patterns with extracted text and saved pieces (names, rows,
//     quantities), often corrected by hand;
//   - pattern_info: patterns with extracted text and at least three info
//     fields (garment type, designer, language, difficulty, sizes, gauge,
//     yardage);
//   - translation: English patterns' extracted text; there is no reference
//     translation, so the score checks what a translation must keep (numbers,
//     knitting terms) and the output language.
//
// Deterministic: "validated" records first (edited after creation), then
// newest, capped per task; the excerpts depend on nothing but the record.

import { createHash } from 'node:crypto';
import { ALPACA_LABEL, COTON_LABEL, MERINOS_LABEL } from './labelImages';
import type { PatternVocabulary } from '$lib/server/patternVocabulary';
import { groundTags } from '../tagGrounding';
import { fold, type LabelExpected, type PatternInfoExpected, type PieceExpected } from './scoring';

export const TASKS = ['label', 'pieces', 'pattern_info', 'translation'] as const;
export type Task = (typeof TASKS)[number];
export const DEFAULT_MAX_CASES = 12;
export const MIN_CASES = 3;
// Translation input: an excerpt, cut at a line boundary.
export const TRANSLATION_EXCERPT_CHARS = 1500;

type Base = { id: string; source: 'db' | 'bundled' };
// `image`: the stored photo, base64 (no data: prefix); evaluate.ts downscales
// it with imageForModel, exactly like a production scan.
export type LabelCase = Base & { image: string; expected: LabelExpected };
export type PiecesCase = Base & { context: string; craft: string; expected: PieceExpected[] };
// `vocabulary`: what production passes too (the person's existing tags,
// garment types and designers), built from their OTHER patterns only, as
// when a new pattern is created -- so it never contains this one's answers.
export type PatternInfoCase = Base & { context: string; craft: string; expected: PatternInfoExpected; vocabulary?: PatternVocabulary };
export type TranslationCase = Base & { text: string };
export type EvalCases = {
	label: LabelCase[];
	pieces: PiecesCase[];
	pattern_info: PatternInfoCase[];
	translation: TranslationCase[];
};

export const BUNDLED: EvalCases = {
	label: [
		{
			id: 'label-merinos',
			source: 'bundled',
			image: MERINOS_LABEL,
			expected: {
				brand: 'Filature des Monts',
				name: 'Mérinos Douceur',
				colorway: 'Rouille 052',
				fiber: '100 % laine mérinos',
				weightCategory: 'dk',
				yardsPerSkein: 105,
				gramsPerSkein: 50,
				needleSizeMm: 4
			}
		},
		{
			id: 'label-coton',
			source: 'bundled',
			image: COTON_LABEL,
			expected: {
				brand: 'Atelier Lin',
				name: 'Coton Bio Été',
				colorway: 'Écume 12',
				fiber: '100 % coton biologique',
				weightCategory: 'sport',
				yardsPerSkein: 125,
				gramsPerSkein: 50,
				needleSizeMm: 3
			}
		},
		{
			id: 'label-alpaca',
			source: 'bundled',
			image: ALPACA_LABEL,
			expected: {
				brand: 'Northwind Yarns',
				name: 'Alpaca Cloud',
				colorway: 'Slate 7',
				fiber: '70 % alpaga, 30 % soie',
				weightCategory: 'worsted',
				yardsPerSkein: 201,
				gramsPerSkein: 100,
				needleSizeMm: 5
			}
		}
	],
	pieces: [
		{
			id: 'tricot-pull',
			source: 'bundled',
			craft: 'tricot',
			context: `Pull raglan tricoté de haut en bas, taille M.

DOS : monter 90 mailles. Tricoter au point jersey. Rangs 1 à 84 : jersey. Rabattre.

DEVANT : monter 90 mailles. Identique au dos jusqu'au rang 70, puis façonner l'encolure. Total 84 rangs.

MANCHE (x2) : monter 40 mailles. Augmenter de chaque côté tous les 6 rangs. Tricoter 52 rangs au total.

COL : monter 100 mailles au point mousse, tricoter 8 rangs, rabattre.`,
			expected: [
				{ name: 'Dos', rows: 84 },
				{ name: 'Devant', rows: 84 },
				{ name: 'Manche', rows: 52 },
				{ name: 'Col', rows: 8 }
			]
		},
		{
			id: 'couture-jupe',
			source: 'bundled',
			craft: 'couture',
			context: `Patron n°42 — Jupe évasée
Burda Style — page 3/12

Pièces à couper dans le tissu principal :
- Devant jupe x1 (sur pli)
- Dos jupe x2
- Ceinture x1 (sur pli)
- Poche x4

Thermocollant : Entoilage ceinture x1

Instructions de montage page suivante...

© Burda 2023 — reproduction interdite`,
			expected: [
				{ name: 'Devant jupe' },
				{ name: 'Dos jupe', quantity: 2 },
				{ name: 'Ceinture' },
				{ name: 'Poche', quantity: 4 },
				{ name: 'Entoilage ceinture' }
			]
		},
		{
			id: 'crochet-bonnet',
			source: 'bundled',
			craft: 'crochet',
			context: `Alors pour ce bonnet au crochet, on va faire trois parties : le corps du bonnet, le pompon et
la bordure. Pour le corps, on monte un cercle magique et on augmente jusqu'à avoir 60 mailles,
puis on crochète tout droit pendant environ 45 tours au total. Pour la bordure, on fait 6 tours
de mailles serrées. Le pompon, pas besoin de rangs, on l'assemble à la fin.`,
			expected: [{ name: 'Corps', rows: 45 }, { name: 'Bordure', rows: 6 }, { name: 'Pompon' }]
		}
	],
	pattern_info: [
		{
			id: 'info-pull-fr',
			source: 'bundled',
			craft: 'tricot',
			context: `Pull Brume — par Laine & Lune
Niveau : intermédiaire (3/5)
Tailles : XS (S, M, L, XL)
Fournitures : 5 (5, 6, 6, 7) pelotes de 50 g / 175 m, soit 875 (875, 1050, 1050, 1225) m
Aiguilles circulaires 3,5 et 4 mm
Échantillon : 22 mailles et 30 rangs = 10 x 10 cm en jersey avec les aiguilles 4 mm
Pull ample tricoté de haut en bas, sans couture, empiècement raglan.`,
			expected: { garmentType: 'Pull', designer: 'Laine & Lune', language: 'fr', difficulty: 3, sizes: 'XS-XL', gaugeStitches: 22, gaugeRows: 30, yardageRequired: 875 }
		},
		{
			id: 'info-socks-en',
			source: 'bundled',
			craft: 'tricot',
			context: `Harbour Socks by Fern Atkinson
Skill level: easy
Sizes: S (M, L) — foot circumference 18 (20, 22) cm
Yarn: 1 skein of fingering weight sock yarn, 400 m / 100 g
Gauge: 32 sts and 44 rnds = 10 cm in stockinette stitch
Top-down socks with a heel flap and gusset.`,
			expected: { garmentType: 'Chaussettes', designer: 'Fern Atkinson', language: 'en', difficulty: 2, sizes: 'S-L', gaugeStitches: 32, gaugeRows: 44, yardageRequired: 400 }
		},
		{
			id: 'info-robe-couture',
			source: 'bundled',
			craft: 'couture',
			context: `ROBE CAPUCINE — Atelier Bobine
Patron de couture, niveau débutant
Tailles 34 à 46
Métrage : 2,10 m de viscose en 140 cm de large
Robe portefeuille à manches courtes, idéale pour l'été.`,
			expected: { garmentType: 'Robe', designer: 'Atelier Bobine', language: 'fr', difficulty: 1, sizes: '34-46' }
		}
	],
	translation: [
		{
			id: 'translate-hat',
			source: 'bundled',
			text: `With 4 mm circular needles, CO 96 sts. Join to work in the round, being careful not to twist.
Rnds 1-12: *k2, p2; rep from * to end.
Change to 4.5 mm needles and knit every rnd until hat measures 18 cm from CO edge.
Crown decreases:
Rnd 1: *k10, k2tog; rep from * to end (88 sts).
Rnd 2: knit.
Rnd 3: *k9, k2tog; rep from * to end (80 sts).
Cut yarn, draw through remaining sts and pull tight.`
		},
		{
			id: 'translate-shawl',
			source: 'bundled',
			text: `Row 1 (RS): k2, yo, k to last 2 sts, yo, k2. (4 sts increased)
Row 2 (WS): k2, p to last 2 sts, k2.
Repeat rows 1-2 until you have 241 sts.
Lace section: Row 1 (RS): k2, *yo, ssk, k1, k2tog, yo, k1; rep from * to last 3 sts, k3.
BO all sts loosely on a WS row.`
		},
		{
			id: 'translate-amigurumi',
			source: 'bundled',
			text: `Using a 3 mm hook, make a magic ring.
Rnd 1: 6 sc in ring (6).
Rnd 2: inc in each st around (12).
Rnd 3: *sc 1, inc* 6 times (18).
Rnds 4-9: sc in each st around (18).
Rnd 10: *sc 1, dec* 6 times (12).
Sl st to the first sc, fasten off. Ch 10 for the hanging loop.`
		}
	]
};

/* ------------------------------------------------------------------ */
/* Harvest: database rows -> cases (pure, tested without a database)  */
/* ------------------------------------------------------------------ */

export type YarnRow = {
	id: string;
	brand: string | null;
	name: string | null;
	colorway: string | null;
	fiber: string | null;
	weightCategory: string | null;
	yardsPerSkein: number | null;
	gramsPerSkein: number | null;
	photoPath: string | null;
	createdAt: Date;
};

export type PatternRow = {
	id: string;
	ownerId?: string;
	title: string;
	craft: string;
	notes: string | null;
	extractedText: string | null;
	tags: string[] | null;
	garmentType: string | null;
	designer: string | null;
	language: string | null;
	difficulty: number | null;
	sizes: string | null;
	gaugeStitches: number | null;
	gaugeRows: number | null;
	yardageRequired: number | null;
	createdAt: Date;
	updatedAt: Date;
};

export type PieceRow = { patternId: string; name: string; position: number; defaultTotalRows: number | null; quantity: number | null };

const LABEL_FIELDS = ['brand', 'name', 'colorway', 'fiber', 'weightCategory', 'yardsPerSkein', 'gramsPerSkein'] as const;
const INFO_FIELDS = ['garmentType', 'designer', 'language', 'difficulty', 'sizes', 'gaugeStitches', 'gaugeRows', 'yardageRequired'] as const;
const EDITED_MS = 5 * 60 * 1000;

const shortId = (id: string) => id.slice(0, 8);
const filled = (v: unknown) => v != null && String(v).trim() !== '';

export function labelExpected(y: YarnRow): LabelExpected | null {
	const expected: LabelExpected = {};
	for (const k of LABEL_FIELDS) if (filled(y[k])) (expected as Record<string, unknown>)[k] = y[k];
	return y.photoPath && Object.keys(expected).length >= 3 ? expected : null;
}

// Newest first; yarns have no "edited" timestamp.
export function orderYarns(rows: YarnRow[]): YarnRow[] {
	return rows
		.filter((y) => labelExpected(y))
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
}

// Edited after creation first (someone looked at it), then newest.
export function orderPatterns(rows: PatternRow[]): PatternRow[] {
	const edited = (p: PatternRow) => p.updatedAt.getTime() - p.createdAt.getTime() > EDITED_MS;
	return [...rows].sort(
		(a, b) =>
			Number(edited(b)) - Number(edited(a)) || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id)
	);
}

// Same context the production routes build (pattern-pieces, pattern-info).
export function patternContext(p: PatternRow): string {
	return [p.title, p.notes, p.extractedText].filter(Boolean).join('\n\n');
}

export function piecesCase(p: PatternRow, pieces: PieceRow[]): PiecesCase | null {
	const own = pieces.filter((x) => x.patternId === p.id).sort((a, b) => a.position - b.position);
	if (!p.extractedText?.trim() || !own.length) return null;
	return {
		id: `pieces-${shortId(p.id)}`,
		source: 'db',
		craft: p.craft,
		context: patternContext(p),
		expected: own.map((x) => ({ name: x.name, rows: x.defaultTotalRows, quantity: x.quantity }))
	};
}

const MAX_VOCAB_ITEMS = 40;   // as getPatternVocabulary()

export function vocabularyFor(p: PatternRow, rows: PatternRow[]): PatternVocabulary {
	const tags = new Set<string>();
	const garmentTypes = new Set<string>();
	const designers = new Set<string>();
	for (const r of rows) {
		if (r.id === p.id || (p.ownerId && r.ownerId !== p.ownerId)) continue;
		for (const t of r.tags ?? []) tags.add(t);
		if (r.garmentType) garmentTypes.add(r.garmentType);
		if (r.designer) designers.add(r.designer);
	}
	return {
		tags: [...tags].slice(0, MAX_VOCAB_ITEMS),
		garmentTypes: [...garmentTypes].slice(0, MAX_VOCAB_ITEMS),
		designers: [...designers].slice(0, MAX_VOCAB_ITEMS)
	};
}

const LEVEL_WORDS = /\b(niveau|difficulte|debutant|intermediaire|avance|facile|skill|level|beginner|intermediate|advanced|easy)\b/;
const SIZE_TOKENS = /\b(xxs|xs|s|m|l|xl|xxl|[2-6]xl|\d{1,3})\b/g;

// A field the person typed in but the text never states (designer, their
// own difficulty rating, sizes or gauge from elsewhere) cannot be found by
// any model: scoring it only adds the same noise to every candidate.
export function groundedInText(key: keyof PatternInfoExpected, value: unknown, context: string): boolean {
	const text = ` ${fold(context)} `;
	switch (key) {
		case 'designer':
			return fold(value).length > 1 && text.includes(` ${fold(value)} `);
		case 'difficulty':
			return LEVEL_WORDS.test(text);
		case 'sizes':
			return (fold(value).match(SIZE_TOKENS) ?? []).some((t) => text.includes(` ${t} `));
		case 'gaugeStitches':
		case 'gaugeRows':
		case 'yardageRequired':
			return text.includes(` ${String(value)} `);
		default:
			return true;
	}
}

export function patternInfoCase(p: PatternRow, rows: PatternRow[] = []): PatternInfoCase | null {
	if (!p.extractedText?.trim()) return null;
	const context = patternContext(p);
	const expected: PatternInfoExpected = {};
	for (const k of INFO_FIELDS) {
		if (filled(p[k]) && groundedInText(k, p[k], context)) (expected as Record<string, unknown>)[k] = p[k];
	}
	if (Object.keys(expected).length < 3) return null;
	// Production drops suggested tags the text doesn't back up (tagGrounding.ts);
	// the same rule decides which of the person's tags a model could find.
	const tags = groundTags(p.tags ?? [], { text: context, garmentType: p.garmentType });
	if (tags.length) expected.tags = tags;
	return { id: `info-${shortId(p.id)}`, source: 'db', craft: p.craft, context, expected, vocabulary: vocabularyFor(p, rows) };
}

export function translationExcerpt(text: string, max = TRANSLATION_EXCERPT_CHARS): string {
	const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
	let out = '';
	for (const line of lines) {
		if (out && out.length + line.length + 1 > max) break;
		out += (out ? '\n' : '') + line.slice(0, max);
	}
	return out;
}

export function translationCase(p: PatternRow): TranslationCase | null {
	if (p.language?.toLowerCase() !== 'en' || (p.extractedText?.trim().length ?? 0) < 300) return null;
	return { id: `translate-${shortId(p.id)}`, source: 'db', text: translationExcerpt(p.extractedText!) };
}

// Fills a task up to MIN_CASES with bundled cases (all of them, up to the
// cap, when the database gave none).
export function withFallback<T extends Base>(fromDb: T[], bundled: T[], maxCases: number): T[] {
	const cases = fromDb.slice(0, maxCases);
	if (cases.length >= MIN_CASES) return cases;
	const room = cases.length ? Math.min(MIN_CASES, maxCases) - cases.length : maxCases;
	return [...cases, ...bundled.slice(0, Math.max(0, room))];
}

export function sourceNote(cases: Base[]): string {
	const db = cases.filter((c) => c.source === 'db').length;
	const bundled = cases.length - db;
	if (!bundled) return `${db} cas de la base`;
	if (!db) return `${bundled} cas fournis (pas assez de données en base)`;
	return `${db} cas de la base + ${bundled} cas fourni(s)`;
}

// Fingerprint of the case set: a cached result is only reused when it matches.
export function casesHash(cases: EvalCases): string {
	const h = createHash('sha256');
	for (const task of TASKS) {
		for (const c of cases[task]) h.update(`${task}|${JSON.stringify(c)}\n`);
	}
	return h.digest('hex').slice(0, 16);
}
