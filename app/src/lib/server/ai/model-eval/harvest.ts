// Reads the evaluation cases from the database (see cases.ts for what is
// used as ground truth and why). Server-wide: every account's records count,
// the evaluation never writes anything.

import { readFile } from 'node:fs/promises';
import { desc, inArray, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patternPieces, patterns, yarns } from '$lib/server/db/schema';
import { absolutePath } from '$lib/server/storage';
import {
	BUNDLED,
	orderPatterns,
	orderYarns,
	labelExpected,
	patternInfoCase,
	piecesCase,
	translationCase,
	withFallback,
	type EvalCases,
	type LabelCase,
	type PatternRow,
	type PieceRow
} from './cases';

// Enough rows to fill every task after filtering.
const HARVEST_LIMIT = 300;

async function labelCases(maxCases: number, warnings: string[]): Promise<LabelCase[]> {
	const rows = await db
		.select({
			id: yarns.id,
			brand: yarns.brand,
			name: yarns.name,
			colorway: yarns.colorway,
			fiber: yarns.fiber,
			weightCategory: yarns.weightCategory,
			yardsPerSkein: yarns.yardsPerSkein,
			gramsPerSkein: yarns.gramsPerSkein,
			photoPath: yarns.photoPath,
			createdAt: yarns.createdAt
		})
		.from(yarns)
		.where(isNotNull(yarns.photoPath))
		.orderBy(desc(yarns.createdAt))
		.limit(HARVEST_LIMIT);
	const cases: LabelCase[] = [];
	for (const y of orderYarns(rows)) {
		if (cases.length >= maxCases) break;
		try {
			const image = (await readFile(absolutePath(y.photoPath!))).toString('base64');
			cases.push({ id: `label-${y.id.slice(0, 8)}`, source: 'db', image, expected: labelExpected(y)! });
		} catch {
			warnings.push(`photo illisible pour la laine ${y.id.slice(0, 8)}`);
		}
	}
	return cases;
}

async function patternRows(): Promise<PatternRow[]> {
	return db
		.select({
			id: patterns.id,
			ownerId: patterns.ownerId,
			title: patterns.title,
			craft: patterns.craft,
			notes: patterns.notes,
			extractedText: patterns.extractedText,
			tags: patterns.tags,
			garmentType: patterns.garmentType,
			designer: patterns.designer,
			language: patterns.language,
			difficulty: patterns.difficulty,
			sizes: patterns.sizes,
			gaugeStitches: patterns.gaugeStitches,
			gaugeRows: patterns.gaugeRows,
			yardageRequired: patterns.yardageRequired,
			createdAt: patterns.createdAt,
			updatedAt: patterns.updatedAt
		})
		.from(patterns)
		.where(isNotNull(patterns.extractedText))
		.orderBy(desc(patterns.createdAt))
		.limit(HARVEST_LIMIT);
}

function take<T>(rows: PatternRow[], build: (p: PatternRow) => T | null, maxCases: number): T[] {
	const out: T[] = [];
	for (const p of rows) {
		if (out.length >= maxCases) break;
		const c = build(p);
		if (c) out.push(c);
	}
	return out;
}

export async function harvestCases(maxCases: number): Promise<{ cases: EvalCases; warnings: string[] }> {
	const warnings: string[] = [];
	let label: LabelCase[] = [];
	let rows: PatternRow[] = [];
	let pieces: PieceRow[] = [];
	try {
		label = await labelCases(maxCases, warnings);
		rows = orderPatterns(await patternRows());
		const ids = rows.map((p) => p.id);
		if (ids.length) {
			pieces = await db
				.select({
					patternId: patternPieces.patternId,
					name: patternPieces.name,
					position: patternPieces.position,
					defaultTotalRows: patternPieces.defaultTotalRows,
					quantity: patternPieces.quantity
				})
				.from(patternPieces)
				.where(inArray(patternPieces.patternId, ids));
		}
	} catch (e) {
		warnings.push(`base indisponible (${(e as Error).message}) : cas fournis seulement`);
	}
	return {
		warnings,
		cases: {
			label: withFallback(label, BUNDLED.label, maxCases),
			pieces: withFallback(take(rows, (p) => piecesCase(p, pieces), maxCases), BUNDLED.pieces, maxCases),
			pattern_info: withFallback(take(rows, (p) => patternInfoCase(p, rows), maxCases), BUNDLED.pattern_info, maxCases),
			translation: withFallback(take(rows, translationCase, maxCases), BUNDLED.translation, maxCases)
		}
	};
}
