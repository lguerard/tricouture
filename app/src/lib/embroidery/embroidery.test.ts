import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { kmeans } from './quantize';
import { tatamiFill } from './stitches';
import { digitize, type RasterImage } from './digitize';
import { writePes, type Command } from './pes';
import { nearestThread } from './threads';

// A test picture: white background, red disc, blue square with a white hole.
function picture(w = 200, h = 160): RasterImage {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let c = [255, 255, 255];
			if (Math.hypot(x - 60, y - 80) < 45) c = [230, 20, 30];
			if (x > 110 && x < 180 && y > 40 && y < 120) c = Math.hypot(x - 145, y - 80) < 12 ? [255, 255, 255] : [20, 40, 160];
			data.set([...c, 255], (y * w + x) * 4);
		}
	}
	return { width: w, height: h, data };
}

const stitches = (cmds: Command[]) => cmds.filter((c) => c.kind === 'stitch');

describe('kmeans', () => {
	it('finds the distinct colours', () => {
		const px = [...Array(300)].flatMap((_, i) => (i % 3 === 0 ? [255, 0, 0] : i % 3 === 1 ? [0, 0, 255] : [255, 255, 255]));
		const c = kmeans(px, 3).map((x) => x.join(',')).sort();
		expect(c).toEqual(['0,0,255', '255,0,0', '255,255,255']);
	});
	it('returns fewer centres when there are fewer colours', () => {
		expect(kmeans([1, 2, 3, 1, 2, 3], 4)).toHaveLength(1);
	});
});

describe('nearestThread', () => {
	it('picks Brother threads', () => {
		expect(nearestThread([0, 0, 0]).name).toBe('Black');
		expect(nearestThread([255, 255, 255]).name).toBe('White');
	});
});

describe('tatamiFill', () => {
	it('stays inside the region and keeps stitches short', () => {
		const ppm = 4;
		const w = 80;
		const h = 60;
		const mask = new Uint8Array(w * h);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 40, y - 30) < 25) mask[y * w + x] = 1;
		const polys = tatamiFill({ mask, w, h, ox: 0, oy: 0, ppm }, { angle: Math.PI / 4, spacing: 0.4, stitchLen: 3 });
		expect(polys.length).toBeGreaterThan(0);
		for (const poly of polys) {
			for (let i = 0; i < poly.length; i++) {
				const p = poly[i];
				expect(mask[Math.floor(p.y * ppm) * w + Math.floor(p.x * ppm)]).toBe(1);
				if (i) expect(Math.hypot(p.x - poly[i - 1].x, p.y - poly[i - 1].y)).toBeLessThanOrEqual(4.5 + 1e-9);
			}
		}
	});
});

describe('digitize', () => {
	it('makes a design that fits the hoop with short stitches', () => {
		const d = digitize(picture(), { sizeMm: 70, colors: 2, removeBackground: true, shape: 'circle', borderThread: 20, backgroundThread: 9 });
		expect(d.widthMm).toBe(70);
		const s = stitches(d.commands);
		expect(s.length).toBeGreaterThan(1000);
		for (const c of d.commands) {
			expect(Math.abs(c.x)).toBeLessThanOrEqual(350);
			expect(Math.abs(c.y)).toBeLessThanOrEqual(350);
		}
		let prev: Command | null = null;
		for (const c of d.commands) {
			if (c.kind === 'stitch' && prev?.kind === 'stitch') expect(Math.hypot(c.x - prev.x, c.y - prev.y)).toBeLessThanOrEqual(45);
			prev = c;
		}
		// background, red, blue, white hole (kept: enclosed), border
		expect(d.threads[0]).toBe(9);
		expect(d.threads[d.threads.length - 1]).toBe(20);
		expect(d.commands.filter((c) => c.kind === 'color')).toHaveLength(d.threads.length - 1);
		if (process.env.PES_OUT) writeFileSync(`${process.env.PES_OUT}/circle.pes`, writePes(d.commands, d.threads, 'circle'));
	});

	it('drops the background without a patch shape', () => {
		const d = digitize(picture(), { sizeMm: 50, colors: 2, removeBackground: true, shape: 'none' });
		expect(d.threads.length).toBeGreaterThanOrEqual(2);
		// Nothing sewn in the picture's (white) top-left corner.
		const corner = stitches(d.commands).filter((c) => c.x < -200 && c.y < -150);
		expect(corner).toHaveLength(0);
		if (process.env.PES_OUT) writeFileSync(`${process.env.PES_OUT}/none.pes`, writePes(d.commands, d.threads, 'none'));
	});

	it('handles a rounded patch', () => {
		const d = digitize(picture(), { sizeMm: 90, colors: 3, removeBackground: false, shape: 'rounded', borderThread: 5 });
		expect(d.widthMm).toBe(90);
		expect(d.heightMm).toBeCloseTo(72);
		if (process.env.PES_OUT) writeFileSync(`${process.env.PES_OUT}/rounded.pes`, writePes(d.commands, d.threads, 'rounded'));
	});
});

describe('writePes', () => {
	it('writes a PES v1 header pointing at the PEC section', () => {
		const cmds: Command[] = [
			{ kind: 'jump', x: -100, y: -100 },
			{ kind: 'stitch', x: -100, y: -100 },
			{ kind: 'stitch', x: 100, y: -100 },
			{ kind: 'stitch', x: 100, y: 100 },
			{ kind: 'color', x: 100, y: 100 },
			{ kind: 'jump', x: -100, y: 100 },
			{ kind: 'stitch', x: -100, y: 100 },
			{ kind: 'stitch', x: -50, y: 100 }
		];
		const b = writePes(cmds, [20, 5], 'test');
		expect(new TextDecoder().decode(b.slice(0, 8))).toBe('#PES0001');
		const pec = b[8] | (b[9] << 8) | (b[10] << 16) | (b[11] << 24);
		expect(new TextDecoder().decode(b.slice(pec, pec + 3))).toBe('LA:');
		// colour count - 1, then the thread indices
		expect([b[pec + 48], b[pec + 49], b[pec + 50]]).toEqual([1, 20, 5]);
		// stitch block length, then the end marker before the thumbnails
		const block = pec + 512;
		const len = b[block + 2] | (b[block + 3] << 8) | (b[block + 4] << 16);
		expect(b[block + len - 1]).toBe(0xff);
		expect(b.length).toBe(block + len + 228 * 3);
	});
});
