import { describe, expect, it } from 'vitest';
import { parsePieces, parsePiecesResult } from './pieces';

describe('parsePieces', () => {
	it('reads a structured reply', () => {
		const raw = JSON.stringify({ pieces: [{ name: 'Dos', rows: 84 }, { name: 'Manche', rows: 52, quantity: 2 }] });
		expect(parsePiecesResult(raw)).toEqual({
			source: 'json',
			pieces: [
				{ name: 'Dos', rows: 84, quantity: undefined },
				{ name: 'Manche', rows: 52, quantity: 2 }
			]
		});
	});

	it('strips markdown fences', () => {
		expect(parsePieces('```json\n{"pieces": [{"name": "Col"}]}\n```').map((p) => p.name)).toEqual(['Col']);
	});

	it('strips a leading <think> block', () => {
		const raw = '<think>The pattern has a back, a front.\n- So I list them.</think>\n{"pieces": ["Dos", "Devant"]}';
		expect(parsePiecesResult(raw)).toMatchObject({ source: 'json', pieces: [{ name: 'Dos' }, { name: 'Devant' }] });
	});

	it('returns nothing for an unterminated reasoning block', () => {
		expect(parsePiecesResult('<think>First, I need to find every piece of the')).toEqual({ pieces: [], source: 'none' });
	});

	it('finds the JSON behind leading prose', () => {
		const raw = 'Voici les pièces du patron :\n{"pieces": [{"name": "Dos"}, {"name": "Poche", "quantity": 2}]}';
		expect(parsePiecesResult(raw)).toMatchObject({ source: 'json', pieces: [{ name: 'Dos' }, { name: 'Poche', quantity: 2 }] });
	});

	it('keeps only the bulleted list when prose surrounds it', () => {
		const raw = 'Voici les pièces à réaliser pour ce patron :\n- Dos\n- Devant\n- Manche gauche\nBon tricot !';
		expect(parsePiecesResult(raw)).toEqual({
			source: 'lines',
			pieces: [{ name: 'Dos' }, { name: 'Devant' }, { name: 'Manche gauche' }].map((p) => ({ ...p, rows: undefined, quantity: undefined }))
		});
	});

	it('never turns reasoning sentences into pieces', () => {
		const raw =
			'Okay, let me read the pattern carefully.\n1. First, I need to identify the distinct pieces mentioned in the text.\nThe answer should be JSON.';
		expect(parsePiecesResult(raw)).toEqual({ pieces: [], source: 'none' });
	});

	it('does not line-split truncated JSON', () => {
		expect(parsePiecesResult('{"pieces": [{"name": "Dos"}, {"name": "Dev')).toEqual({ pieces: [], source: 'none' });
	});

	it('handles empty replies', () => {
		expect(parsePiecesResult('')).toEqual({ pieces: [], source: 'none' });
		expect(parsePiecesResult('   \n ')).toEqual({ pieces: [], source: 'none' });
		expect(parsePiecesResult('{"pieces": []}')).toEqual({ pieces: [], source: 'none' });
	});

	it('deduplicates case-insensitively and drops non-positive numbers', () => {
		const raw = JSON.stringify({ pieces: [{ name: 'Dos', rows: 0 }, { name: 'dos' }, { name: 'Col', quantity: '2' }] });
		expect(parsePieces(raw)).toEqual([
			{ name: 'Dos', rows: undefined, quantity: undefined },
			{ name: 'Col', rows: undefined, quantity: 2 }
		]);
	});
});
