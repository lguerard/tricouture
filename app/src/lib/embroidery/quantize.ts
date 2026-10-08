// Colour quantization: k-means (k-means++ seeding) on RGB, deterministic so
// the same picture always gives the same design.

export type RGB = [number, number, number];

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const dist2 = (a: readonly number[], b: readonly number[]) =>
	(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export function nearestIndex(c: readonly number[], centers: readonly RGB[]): number {
	let best = 0;
	let bestD = Infinity;
	for (let i = 0; i < centers.length; i++) {
		const d = dist2(c, centers[i]);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}

// `pixels` is a flat list of colours (3 numbers each). Returns at most `k`
// centres, fewer when the picture has fewer distinct colours.
export function kmeans(pixels: ArrayLike<number>, k: number, iterations = 12): RGB[] {
	const n = Math.floor(pixels.length / 3);
	if (n === 0) return [];
	const rand = mulberry32(1234567);
	// Subsample: k-means on a few thousand pixels gives the same palette.
	const step = Math.max(1, Math.floor(n / 6000));
	const pts: RGB[] = [];
	for (let i = 0; i < n; i += step) pts.push([pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2]]);

	const centers: RGB[] = [pts[Math.floor(rand() * pts.length)]];
	const d = pts.map((p) => dist2(p, centers[0]));
	while (centers.length < k) {
		const total = d.reduce((s, v) => s + v, 0);
		if (total === 0) break; // fewer distinct colours than k
		let r = rand() * total;
		let pick = 0;
		for (; pick < pts.length - 1; pick++) {
			r -= d[pick];
			if (r <= 0) break;
		}
		const c = pts[pick];
		centers.push([c[0], c[1], c[2]]);
		for (let i = 0; i < pts.length; i++) d[i] = Math.min(d[i], dist2(pts[i], c));
	}

	for (let it = 0; it < iterations; it++) {
		const sums = centers.map(() => [0, 0, 0, 0]);
		for (const p of pts) {
			const s = sums[nearestIndex(p, centers)];
			s[0] += p[0];
			s[1] += p[1];
			s[2] += p[2];
			s[3]++;
		}
		let moved = false;
		for (let i = 0; i < centers.length; i++) {
			const s = sums[i];
			if (s[3] === 0) continue;
			const c: RGB = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
			if (dist2(c, centers[i]) > 0.25) moved = true;
			centers[i] = c;
		}
		if (!moved) break;
	}
	return centers.map((c) => c.map(Math.round) as RGB);
}
