import { describe, expect, it } from 'vitest';
import { dominantRgb, hexToRgb, recolorPixels, type Rgb } from './recolor';

function buffer(pixels: Rgb[]): Uint8ClampedArray {
	const data = new Uint8ClampedArray(pixels.length * 4);
	pixels.forEach((p, i) => data.set([...p, 255], i * 4));
	return data;
}
const px = (data: Uint8ClampedArray, i: number) => [...data.slice(i * 4, i * 4 + 3)];

describe('recolor', () => {
	it('parses hex colours', () => {
		expect(hexToRgb('#1e90ff')).toEqual([30, 144, 255]);
		expect(hexToRgb('nope')).toBeNull();
	});

	it('maps the reference exactly to the target and keeps shading', () => {
		const red: Rgb = [200, 40, 40];
		const darkRed: Rgb = [100, 20, 20];
		const data = buffer([red, darkRed, [255, 255, 255]]);
		recolorPixels(data, red, [40, 80, 200]);
		expect(px(data, 0)).toEqual([40, 80, 200]);
		// Half the luminance -> half the target, same hue.
		expect(px(data, 1)).toEqual([20, 40, 100]);
		// The white background is left alone.
		expect(px(data, 2)).toEqual([255, 255, 255]);
		// Alpha untouched.
		expect(data[3]).toBe(255);
	});

	it('recolours a grey yarn but not its white background', () => {
		const grey: Rgb = [120, 120, 120];
		const data = buffer([grey, [250, 250, 250]]);
		recolorPixels(data, grey, [200, 30, 60]);
		expect(px(data, 0)).toEqual([200, 30, 60]);
		expect(px(data, 1)).toEqual([250, 250, 250]);
	});

	it('finds the dominant colour in the centre of the picture', () => {
		// 5x5: white border, blue centre.
		const pixels: Rgb[] = [];
		for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) pixels.push(x > 0 && x < 4 && y > 0 && y < 4 ? [20, 60, 180] : [255, 255, 255]);
		expect(dominantRgb(buffer(pixels), 5, 5)).toEqual([20, 60, 180]);
	});
});
