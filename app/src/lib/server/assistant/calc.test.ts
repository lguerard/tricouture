import { describe, expect, it } from 'vitest';
import { cmToCount, convertCount, countToCm, estimateYardage, gaugeCalc } from './calc';

describe('gauge helpers', () => {
	it('converts between centimetres and counts', () => {
		expect(cmToCount(50, 22)).toBe(110);
		expect(countToCm(110, 22)).toBe(50);
		expect(countToCm(47, 22)).toBe(21.4);
	});

	it('keeps the same size across two gauges', () => {
		expect(convertCount(100, 20, 22)).toBe(110);
		expect(convertCount(120, 24, 18)).toBe(90);
	});

	it('answers from counts or from centimetres, with an optional target gauge', () => {
		expect(gaugeCalc({ stitchesPer10: 20, rowsPer10: 28, stitches: 100, rows: 140, targetStitchesPer10: 22, targetRowsPer10: 30 })).toEqual({
			widthCm: 50,
			heightCm: 50,
			targetStitches: 110,
			targetRows: 150
		});
		expect(gaugeCalc({ stitchesPer10: 22, rowsPer10: 30, widthCm: 48, heightCm: 10 })).toEqual({ stitches: 106, rows: 30 });
		// No row gauge: rows are left alone.
		expect(gaugeCalc({ stitchesPer10: 22, rows: 40 })).toEqual({});
	});
});

describe('estimateYardage', () => {
	it('scales the swatch to the pieces, with a margin and skeins', () => {
		// 2 x 50 x 60 = 6000 cm2 = 60 swatches x 5 m = 300 m, + 10 % = 330 m
		expect(estimateYardage({ widthCm: 50, heightCm: 60, pieces: 2, swatchMeters: 5, metersPerSkein: 100 })).toEqual({
			areaCm2: 6000,
			meters: 330,
			skeins: 4
		});
	});

	it('honours a custom margin and leaves skeins out without a skein length', () => {
		expect(estimateYardage({ widthCm: 10, heightCm: 10, swatchMeters: 4, marginPct: 0 })).toEqual({ areaCm2: 100, meters: 4 });
	});
});
