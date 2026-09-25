import sharp from 'sharp';

// Dominant colors of an image, most common first, as "#rrggbb".
//
// The image is sampled down to a few thousand real pixels (nearest-neighbour:
// no blends of neighbouring colours), bucketed 4 bits per channel, and each
// bucket's swatch is the average of its own pixels. Buckets too close to a
// colour already picked are skipped, or a mostly-blue photo would return five
// near-identical blues.
export async function extractPalette(input: Buffer | string, count = 5): Promise<string[]> {
	const { data } = await sharp(input)
		.rotate()
		.resize(64, 64, { fit: 'inside', kernel: 'nearest' })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
	for (let i = 0; i + 2 < data.length; i += 3) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
		const acc = buckets.get(key);
		if (acc) {
			acc.n++;
			acc.r += r;
			acc.g += g;
			acc.b += b;
		} else {
			buckets.set(key, { n: 1, r, g, b });
		}
	}

	const total = data.length / 3;
	const picked: [number, number, number][] = [];
	for (const acc of [...buckets.values()].sort((a, b) => b.n - a.n)) {
		if (acc.n / total < MIN_SHARE) break;
		const rgb: [number, number, number] = [acc.r / acc.n, acc.g / acc.n, acc.b / acc.n].map(Math.round) as [
			number,
			number,
			number
		];
		if (picked.some((p) => Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) < MIN_DISTANCE)) continue;
		picked.push(rgb);
		if (picked.length === count) break;
	}
	return picked.map(([r, g, b]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`);
}

const MIN_DISTANCE = 48;
// A colour covering less than this share of the picture is noise (a stray
// highlight, an edge), not part of its palette.
const MIN_SHARE = 0.02;
