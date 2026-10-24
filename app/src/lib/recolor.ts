// Colorway preview: recolours a yarn photo toward a chosen colour, in the
// browser (canvas), instantly and without any GPU service. Replaces the
// former Stable Diffusion sidecar, which re-imagined a yarn ball from a
// coarse colour word; this keeps the real photo -- its texture, twist and
// shading -- and changes only the colour.
//
// How: the photo's dominant colour (centre of the picture, where the item
// is) is the reference. Every pixel close to it in chromaticity (so shadows
// and highlights of the yarn count, a white background does not) is
// replaced by the target colour scaled to that pixel's luminance relative to
// the reference: the reference itself becomes exactly the target colour,
// darker strands a darker target, highlights a lighter one.

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const n = parseInt(m[1], 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const luminance = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// Chromaticity (r, g share of r+g+b): unchanged by shading, which is what
// tells the yarn's shadows from a differently coloured background.
function chroma(r: number, g: number, b: number): [number, number] {
	const s = r + g + b;
	return s < 1 ? [1 / 3, 1 / 3] : [r / s, g / s];
}

// Most common colour of the centre (20 %-80 %) of an RGBA buffer, bucketed
// 4 bits per channel, the bucket's own average (same idea as the server's
// palette.ts).
export function dominantRgb(data: Uint8ClampedArray, width: number, height: number): Rgb {
	const buckets = new Map<number, [number, number, number, number]>();
	const x0 = Math.floor(width * 0.2);
	const x1 = Math.max(x0 + 1, Math.ceil(width * 0.8));
	const y0 = Math.floor(height * 0.2);
	const y1 = Math.max(y0 + 1, Math.ceil(height * 0.8));
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			const i = (y * width + x) * 4;
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
			const acc = buckets.get(key);
			if (acc) {
				acc[0]++;
				acc[1] += r;
				acc[2] += g;
				acc[3] += b;
			} else buckets.set(key, [1, r, g, b]);
		}
	}
	let best: [number, number, number, number] = [1, 128, 128, 128];
	for (const acc of buckets.values()) if (acc[0] > best[0]) best = acc;
	return [best[1] / best[0], best[2] / best[0], best[3] / best[0]].map(Math.round) as Rgb;
}

// Chromaticity distances: below NEAR a pixel is fully "the yarn", above FAR
// it is left alone, smooth in between (no hard edges on fuzzy fibres).
const NEAR = 0.05;
const FAR = 0.12;
// A reference this close to grey has no usable chromaticity: fall back to
// "everything but a near-white background".
const GREYISH = 0.035;

// Recolours an RGBA buffer in place (alpha untouched).
export function recolorPixels(data: Uint8ClampedArray, reference: Rgb, target: Rgb): void {
	const refY = Math.min(0.98, Math.max(0.02, luminance(...reference)));
	const [rc, gc] = chroma(...reference);
	const refGreyish = Math.hypot(rc - 1 / 3, gc - 1 / 3) < GREYISH;
	const refLight = refY > 0.8;

	for (let i = 0; i + 3 < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const y = luminance(r, g, b);
		const [pc, qc] = chroma(r, g, b);

		let w: number;
		if (refGreyish) {
			const pixelGreyish = Math.hypot(pc - 1 / 3, qc - 1 / 3) < GREYISH * 2;
			w = !refLight && pixelGreyish && y > 0.88 ? 0 : 1;
		} else if (y < 0.08) {
			w = 1; // deep shadow: chromaticity is noise there, and it stays dark anyway
		} else {
			const d = Math.hypot(pc - rc, qc - gc);
			w = d <= NEAR ? 1 : d >= FAR ? 0 : 1 - (d - NEAR) / (FAR - NEAR);
		}
		if (w === 0) continue;

		const k = y / refY;
		for (let c = 0; c < 3; c++) {
			const t = target[c];
			const shaded = k <= 1 ? t * k : t + (255 - t) * Math.min(1, (y - refY) / (1 - refY));
			data[i + c] = Math.round(data[i + c] * (1 - w) + shaded * w);
		}
	}
}

// Browser only: loads `src` (same-origin, e.g. /media/...), recolours it
// toward `targetHex` and returns a PNG data URL. `maxSide` bounds the canvas
// (the card shows a thumbnail; a full-size photo would only cost time).
export async function recolorImage(src: string, targetHex: string, maxSide = 600): Promise<string> {
	const target = hexToRgb(targetHex);
	if (!target) throw new Error(`Invalid colour ${targetHex}`);
	const img = new Image();
	img.decoding = 'async';
	img.src = src;
	await img.decode();
	const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
	const width = Math.max(1, Math.round(img.naturalWidth * scale));
	const height = Math.max(1, Math.round(img.naturalHeight * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Canvas unavailable');
	ctx.drawImage(img, 0, 0, width, height);
	const pixels = ctx.getImageData(0, 0, width, height);
	recolorPixels(pixels.data, dominantRgb(pixels.data, width, height), target);
	ctx.putImageData(pixels, 0, 0);
	return canvas.toDataURL('image/png');
}
