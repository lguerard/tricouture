import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { extractPalette } from './palette';

// An image made of horizontal bands, `weights` giving each band's height.
async function bands(colors: [number, number, number][], weights: number[]): Promise<Buffer> {
	const width = 40;
	const rows = colors.flatMap((c, i) => Array(weights[i]).fill(c) as [number, number, number][]);
	const raw = Buffer.alloc(width * rows.length * 3);
	rows.forEach((c, y) => {
		for (let x = 0; x < width; x++) raw.set(c, (y * width + x) * 3);
	});
	return sharp(raw, { raw: { width, height: rows.length, channels: 3 } }).png().toBuffer();
}

describe('extractPalette', () => {
	it('returns the dominant colours, most common first', async () => {
		const img = await bands(
			[
				[200, 30, 60],
				[20, 60, 180],
				[240, 230, 200]
			],
			[30, 20, 10]
		);
		expect(await extractPalette(img)).toEqual(['#c81e3c', '#143cb4', '#f0e6c8']);
	});

	it('collapses near-identical shades into one swatch', async () => {
		const img = await bands(
			[
				[20, 60, 180],
				[24, 64, 186],
				[250, 250, 250]
			],
			[20, 20, 20]
		);
		const palette = await extractPalette(img);
		expect(palette).toHaveLength(2);
		expect(palette[1]).toBe('#fafafa');
	});

	it('respects the requested count', async () => {
		const img = await bands(
			[
				[255, 0, 0],
				[0, 255, 0],
				[0, 0, 255],
				[255, 255, 0]
			],
			[10, 10, 10, 10]
		);
		expect(await extractPalette(img, 2)).toHaveLength(2);
	});
});
