// Score a model's pieces extraction against a golden test case.
//
// Heuristic, not an LLM judge: deterministic, free, and fast enough to run
// against several candidate models in one evaluation pass. It doesn't try to
// capture everything that makes an extraction "good" — it captures the parts
// that break the app when wrong (a usable, non-empty pieces list, the right
// pieces present, a plausible piece count, and — the actual point of this
// feature — the right numeric field read off the right piece).

import type { ParsedPiece } from '../pieces';
import type { ModelWatchCase } from './cases';

function findPiece(pieces: ParsedPiece[], keyword: string): ParsedPiece | undefined {
	const kw = keyword.toLowerCase();
	return pieces.find((p) => p.name.toLowerCase().includes(kw));
}

export function scoreExtraction(
	pieces: ParsedPiece[],
	expected: ModelWatchCase['expected']
): { score: number; notes: string[] } {
	if (!Array.isArray(pieces) || pieces.length === 0) {
		return { score: 0, notes: ["Aucune pièce extraite."] };
	}

	const notes: string[] = [];
	let score = 35;
	notes.push('Liste de pièces exploitable (+35)');

	const names = pieces.map((p) => p.name.toLowerCase());
	const foundKw = expected.nameKeywords.filter((kw) => names.some((n) => n.includes(kw.toLowerCase())));
	const kwScore = expected.nameKeywords.length ? 30 * (foundKw.length / expected.nameKeywords.length) : 30;
	score += kwScore;
	notes.push(`Pièces attendues trouvées ${foundKw.length}/${expected.nameKeywords.length} (+${kwScore.toFixed(1)})`);

	const n = pieces.length;
	if (n >= expected.minPieces && n <= expected.maxPieces) {
		score += 15;
		notes.push(`Nombre de pièces plausible : ${n} (+15)`);
	} else {
		const diff = Math.min(Math.abs(n - expected.minPieces), Math.abs(n - expected.maxPieces));
		const partial = Math.max(0, 15 - diff * 3);
		score += partial;
		notes.push(`Nombre de pièces ${n}, attendu ${expected.minPieces}-${expected.maxPieces} (+${partial.toFixed(1)})`);
	}

	if (expected.rowsPiece) {
		const { keyword, rows, tolerance } = expected.rowsPiece;
		const piece = findPiece(pieces, keyword);
		if (piece?.rows != null && Math.abs(piece.rows - rows) <= tolerance) {
			score += 20;
			notes.push(`Rangs de "${keyword}" corrects : ${piece.rows} (+20)`);
		} else {
			notes.push(`Rangs de "${keyword}" : ${piece?.rows ?? 'absent'}, attendu ~${rows}`);
		}
	} else if (expected.quantityPiece) {
		const { keyword, quantity } = expected.quantityPiece;
		const piece = findPiece(pieces, keyword);
		if (piece?.quantity === quantity) {
			score += 20;
			notes.push(`Quantité de "${keyword}" correcte : ${piece.quantity} (+20)`);
		} else {
			notes.push(`Quantité de "${keyword}" : ${piece?.quantity ?? 'absente'}, attendu ${quantity}`);
		}
	}

	return { score: Math.round(Math.min(score, 100) * 10) / 10, notes };
}
