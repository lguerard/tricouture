// Turns a picture into an embroidery design for a small single-needle machine
// (Brother Skitch PP1: 100×100 mm hoop). Everything runs in the browser.
//
// Pipeline: resample the picture on a grid (4 cells per mm), reduce it to a
// few colours, snap them to Brother threads, clean up specks, then fill each
// colour area with tatami stitches (with underlay) and optionally finish the
// patch with a satin border.

import { kmeans, nearestIndex, type RGB } from './quantize';
import { nearestThread } from './threads';
import { circlePath, lineTo, roundedRectPath, runAlong, satinAlong, tatamiFill, type ClosedPath, type Pt } from './stitches';
import type { Command } from './pes';

export type RasterImage = { width: number; height: number; data: ArrayLike<number> }; // RGBA
export type PatchShape = 'none' | 'circle' | 'rounded';

export type DigitizeOptions = {
	sizeMm: number; // longest side of the finished design
	colors: number; // thread colours for the picture (1..8)
	removeBackground: boolean; // drop the colour touching the picture's edges
	shape: PatchShape; // patch outline, sewn as a satin border
	borderThread?: number; // PEC index of the border thread
	backgroundThread?: number | null; // PEC index to fill the patch background, or none
	spacing?: number; // mm between fill rows (0.4 normal)
};

export type Design = {
	commands: Command[]; // 0.1 mm units, centred on (0, 0)
	threads: number[]; // PEC index for each colour block, in sewing order
	widthMm: number;
	heightMm: number;
	stitchCount: number;
	jumpCount: number;
};

export const HOOP_MM = 100;
export const MACHINE_SPM = 400; // Skitch PP1 maximum sewing speed
const PPM = 4; // grid cells per mm
const BORDER_WIDTH = 3.5; // satin border, mm
const STITCH_LEN = 3; // tatami stitch length, mm
const MAX_TRAVEL = 25; // mm: longer moves inside a shape become jumps

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const OUTSIDE = -2; // not part of the patch
const EMPTY = -1; // part of the patch but not sewn (background)

type Placement = {
	w: number; // design size, mm
	h: number;
	img: { x: number; y: number; w: number; h: number }; // where the picture goes, mm
	inShape: (x: number, y: number) => boolean; // fill area, mm
	border: ClosedPath | null;
};

function place(imgW: number, imgH: number, o: DigitizeOptions): Placement {
	const S = Math.min(HOOP_MM, Math.max(10, o.sizeMm));
	const aspect = imgW / imgH;
	const B = BORDER_WIDTH;
	// The fill runs half a millimetre under the border so no gap shows.
	const inset = B - 0.5;
	if (o.shape === 'circle') {
		const r = S / 2;
		const fillR = r - inset;
		// The picture fits inside the circle with a small margin.
		const diag = 2 * (r - B - 1);
		const ih = diag / Math.sqrt(aspect * aspect + 1);
		const iw = ih * aspect;
		return {
			w: S,
			h: S,
			img: { x: r - iw / 2, y: r - ih / 2, w: iw, h: ih },
			inShape: (x, y) => Math.hypot(x - r, y - r) <= fillR,
			border: circlePath(r, r, r - B / 2)
		};
	}
	const w = aspect >= 1 ? S : S * aspect;
	const h = aspect >= 1 ? S / aspect : S;
	if (o.shape === 'rounded') {
		const rad = Math.min(w, h) * 0.18;
		const m = B + 1;
		const fr = Math.max(0, rad - inset);
		return {
			w,
			h,
			img: { x: m, y: m, w: w - 2 * m, h: h - 2 * m },
			inShape: (x, y) => {
				// Signed distance to a rounded rectangle.
				const qx = Math.abs(x - w / 2) - (w / 2 - inset - fr);
				const qy = Math.abs(y - h / 2) - (h / 2 - inset - fr);
				return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - fr <= 0;
			},
			border: roundedRectPath(w / 2, h / 2, w / 2 - B / 2, h / 2 - B / 2, Math.max(0.5, rad - B / 2))
		};
	}
	return { w, h, img: { x: 0, y: 0, w, h }, inShape: () => true, border: null };
}

// Average colour (and coverage) of the picture under each grid cell.
function resample(image: RasterImage, p: Placement, gw: number, gh: number) {
	const rgb = new Float32Array(gw * gh * 3);
	const alpha = new Float32Array(gw * gh);
	const inImg = new Uint8Array(gw * gh);
	const sx = image.width / p.img.w; // source pixels per mm
	const sy = image.height / p.img.h;
	const d = image.data;
	for (let cy = 0; cy < gh; cy++) {
		for (let cx = 0; cx < gw; cx++) {
			const mx = (cx + 0.5) / PPM - p.img.x;
			const my = (cy + 0.5) / PPM - p.img.y;
			if (mx < 0 || my < 0 || mx >= p.img.w || my >= p.img.h) continue;
			const i = cy * gw + cx;
			inImg[i] = 1;
			const x0 = Math.max(0, Math.floor((cx / PPM - p.img.x) * sx));
			const y0 = Math.max(0, Math.floor((cy / PPM - p.img.y) * sy));
			const x1 = Math.min(image.width, Math.max(x0 + 1, Math.floor(((cx + 1) / PPM - p.img.x) * sx)));
			const y1 = Math.min(image.height, Math.max(y0 + 1, Math.floor(((cy + 1) / PPM - p.img.y) * sy)));
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let n = 0;
			for (let y = y0; y < y1; y++) {
				for (let x = x0; x < x1; x++) {
					const k = (y * image.width + x) * 4;
					const al = d[k + 3] / 255;
					r += d[k] * al;
					g += d[k + 1] * al;
					b += d[k + 2] * al;
					a += al;
					n++;
				}
			}
			alpha[i] = n ? a / n : 0;
			if (a > 0) {
				rgb[i * 3] = r / a;
				rgb[i * 3 + 1] = g / a;
				rgb[i * 3 + 2] = b / a;
			}
		}
	}
	return { rgb, alpha, inImg };
}

const N4 = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1]
];

// Connected components (4-neighbourhood) of cells for which `same(i, j)`.
function components(gw: number, gh: number, keep: (i: number) => boolean, same: (i: number, j: number) => boolean) {
	const comp = new Int32Array(gw * gh).fill(-1);
	const list: number[][] = [];
	const stack: number[] = [];
	for (let s = 0; s < gw * gh; s++) {
		if (comp[s] !== -1 || !keep(s)) continue;
		const id = list.length;
		const cells: number[] = [];
		comp[s] = id;
		stack.push(s);
		while (stack.length) {
			const i = stack.pop()!;
			cells.push(i);
			const x = i % gw;
			const y = (i - x) / gw;
			for (const [dx, dy] of N4) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
				const j = ny * gw + nx;
				if (comp[j] === -1 && keep(j) && same(i, j)) {
					comp[j] = id;
					stack.push(j);
				}
			}
		}
		list.push(cells);
	}
	return { comp, list };
}

// Majority filter: each cell takes the most common label around it, which
// removes the stair-step noise quantization leaves along edges.
function majority(labels: Int16Array, gw: number, gh: number) {
	const out = labels.slice();
	const counts = new Map<number, number>();
	for (let y = 0; y < gh; y++) {
		for (let x = 0; x < gw; x++) {
			const i = y * gw + x;
			if (labels[i] === OUTSIDE) continue;
			counts.clear();
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
					const l = labels[ny * gw + nx];
					if (l === OUTSIDE) continue;
					counts.set(l, (counts.get(l) ?? 0) + (dx === 0 && dy === 0 ? 1.5 : 1));
				}
			}
			let best = labels[i];
			let bestN = 0;
			for (const [l, n] of counts) if (n > bestN) [best, bestN] = [l, n];
			out[i] = best;
		}
	}
	labels.set(out);
}

// Areas too small to sew (specks) melt into their most common neighbour.
function removeSpecks(labels: Int16Array, gw: number, gh: number, minCells: number) {
	for (let pass = 0; pass < 3; pass++) {
		const { list } = components(
			gw,
			gh,
			(i) => labels[i] !== OUTSIDE,
			(i, j) => labels[i] === labels[j]
		);
		let changed = false;
		for (const cells of list) {
			if (cells.length >= minCells) continue;
			const own = labels[cells[0]];
			const counts = new Map<number, number>();
			for (const i of cells) {
				const x = i % gw;
				const y = (i - x) / gw;
				for (const [dx, dy] of N4) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
					const l = labels[ny * gw + nx];
					if (l !== OUTSIDE && l !== own) counts.set(l, (counts.get(l) ?? 0) + 1);
				}
			}
			let best = own;
			let bestN = 0;
			for (const [l, n] of counts) if (n > bestN) [best, bestN] = [l, n];
			if (best !== own) {
				for (const i of cells) labels[i] = best;
				changed = true;
			}
		}
		if (!changed) break;
	}
}

type Mask = { mask: Uint8Array; w: number; h: number; ox: number; oy: number };

function erode(m: Mask, times: number): Mask {
	let cur = m.mask;
	for (let t = 0; t < times; t++) {
		const next = new Uint8Array(cur.length);
		for (let y = 1; y < m.h - 1; y++) {
			for (let x = 1; x < m.w - 1; x++) {
				const i = y * m.w + x;
				next[i] = cur[i] & cur[i - 1] & cur[i + 1] & cur[i - m.w] & cur[i + m.w];
			}
		}
		cur = next;
	}
	return { ...m, mask: cur };
}

// A path between two points that stays inside the mask, preferring cells not
// sewn yet (`sewn`) so the travel stitches end up hidden under the fill
// sewn next: Dijkstra on the grid, then shortcuts while the straight line
// stays inside and crosses no more sewn cells. Null when there is none or
// it's too long (better jump then).
function travel(m: Mask, a: Pt, b: Pt, sewn?: Uint8Array): Pt[] | null {
	const cell = (p: Pt) => {
		const cx = Math.floor(p.x * PPM) - m.ox;
		const cy = Math.floor(p.y * PPM) - m.oy;
		// End points sit on the edge of the area; look a cell or two around.
		for (let r = 0; r <= 2; r++) {
			for (let dy = -r; dy <= r; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					const x = cx + dx;
					const y = cy + dy;
					if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.mask[y * m.w + x]) return y * m.w + x;
				}
			}
		}
		return -1;
	};
	const s = cell(a);
	const t = cell(b);
	if (s < 0 || t < 0) return null;
	const SEWN_COST = 8;
	const cost = new Float64Array(m.w * m.h).fill(Infinity);
	const prev = new Int32Array(m.w * m.h).fill(-1);
	const heap = new MinHeap();
	cost[s] = 0;
	prev[s] = s;
	heap.push(0, s);
	const limit = MAX_TRAVEL * PPM * SEWN_COST;
	while (heap.size) {
		const [c, i] = heap.pop();
		if (i === t || c > limit) break;
		if (c > cost[i]) continue;
		const x = i % m.w;
		const y = (i - x) / m.w;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
				const j = ny * m.w + nx;
				if (!m.mask[j]) continue;
				// No diagonal squeeze between two outside cells.
				if (dx && dy && !m.mask[y * m.w + nx] && !m.mask[ny * m.w + x]) continue;
				const nc = c + (dx && dy ? Math.SQRT2 : 1) * (sewn?.[j] ? SEWN_COST : 1);
				if (nc < cost[j]) {
					cost[j] = nc;
					prev[j] = i;
					heap.push(nc, j);
				}
			}
		}
	}
	if (prev[t] === -1) return null;
	const ids: number[] = [];
	for (let i = t; ; i = prev[i]) {
		ids.push(i);
		if (i === s) break;
	}
	ids.reverse();
	const at = (i: number): Pt => {
		const x = i % m.w;
		return { x: (x + m.ox + 0.5) / PPM, y: ((i - x) / m.w + m.oy + 0.5) / PPM };
	};
	// Sewn cells crossed by the cell path up to each step.
	const sewnBefore = [0];
	for (let k = 1; k < ids.length; k++) sewnBefore.push(sewnBefore[k - 1] + (sewn?.[ids[k]] ?? 0));
	const crossing = (p: Pt, q: Pt) => {
		const n = Math.ceil((Math.hypot(q.x - p.x, q.y - p.y) * PPM) / 0.5);
		let count = 0;
		for (let k = 1; k < n; k++) {
			const x = Math.floor((p.x + ((q.x - p.x) * k) / n) * PPM) - m.ox;
			const y = Math.floor((p.y + ((q.y - p.y) * k) / n) * PPM) - m.oy;
			if (x < 0 || y < 0 || x >= m.w || y >= m.h || !m.mask[y * m.w + x]) return Infinity;
			if (sewn?.[y * m.w + x]) count++;
		}
		return count / 2; // two samples per cell
	};
	const path: Pt[] = [a];
	let i = 0;
	const ok = (i: number, j: number) => crossing(at(ids[i]), at(ids[j])) <= sewnBefore[j] - sewnBefore[i] + 1;
	while (i < ids.length - 1) {
		// Extend the straight line as far as it stays acceptable (up to 8 mm).
		let j = i + 1;
		while (j + 1 < ids.length && j + 1 - i <= 8 * PPM && ok(i, j + 1)) j++;
		path.push(at(ids[j]));
		i = j;
	}
	path.push(b);
	let len = 0;
	for (let k = 1; k < path.length; k++) len += dist(path[k], path[k - 1]);
	if (len > MAX_TRAVEL) return null;
	// Short running stitches: they lie flat under (or on) the fill.
	const out: Pt[] = [path[0]];
	for (const p of path.slice(1)) lineTo(out, p, 2);
	return out;
}

class MinHeap {
	private k: number[] = [];
	private v: number[] = [];
	get size() {
		return this.k.length;
	}
	push(key: number, val: number) {
		const { k, v } = this;
		let i = k.length;
		k.push(key);
		v.push(val);
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (k[p] <= key) break;
			k[i] = k[p];
			v[i] = v[p];
			i = p;
		}
		k[i] = key;
		v[i] = val;
	}
	pop(): [number, number] {
		const { k, v } = this;
		const top: [number, number] = [k[0], v[0]];
		const lk = k.pop()!;
		const lv = v.pop()!;
		if (k.length) {
			let i = 0;
			for (;;) {
				let c = 2 * i + 1;
				if (c >= k.length) break;
				if (c + 1 < k.length && k[c + 1] < k[c]) c++;
				if (k[c] >= lk) break;
				k[i] = k[c];
				v[i] = v[c];
				i = c;
			}
			k[i] = lk;
			v[i] = lv;
		}
		return top;
	}
}

// Collects stitches, jumps and colour changes with lock stitches around every
// jump so the thread doesn't unravel once the jump is cut.
class Sewer {
	cmds: Command[] = [];
	threads: number[] = [];
	private pts: Pt[] = []; // current run, mm
	private pos: Pt = { x: 0, y: 0 };

	thread(t: number) {
		if (this.threads.length && this.threads[this.threads.length - 1] === t) return;
		this.flush();
		if (this.threads.length) this.cmds.push({ kind: 'color', x: this.pos.x, y: this.pos.y });
		this.threads.push(t);
	}

	// Sews `poly`: straight on from the current run when `join`, else after a
	// jump.
	sew(poly: Pt[], join: boolean) {
		if (!poly.length) return;
		if (!join || !this.pts.length) {
			this.flush();
			this.pts = [poly[0]];
		}
		for (const p of poly) lineTo(this.pts, p, 4);
	}

	// End of the run being sewn, if any.
	get last(): Pt | null {
		return this.pts[this.pts.length - 1] ?? null;
	}

	// Where the needle is.
	get here(): Pt {
		return this.last ?? this.pos;
	}

	flush() {
		const run = this.pts;
		this.pts = [];
		if (run.length < 2) return;
		const lock = (at: Pt, toward: Pt): Pt[] => {
			const d = Math.hypot(toward.x - at.x, toward.y - at.y) || 1;
			const k = Math.min(0.7, d) / d;
			const q = { x: at.x + (toward.x - at.x) * k, y: at.y + (toward.y - at.y) * k };
			return [q, at, q, at];
		};
		const out = [run[0], ...lock(run[0], run[1]), ...run.slice(1)];
		out.push(...lock(run[run.length - 1], run[run.length - 2]));
		this.cmds.push({ kind: 'jump', x: out[0].x, y: out[0].y });
		for (const p of out) this.cmds.push({ kind: 'stitch', x: p.x, y: p.y });
		this.pos = out[out.length - 1];
	}

	finish(): Command[] {
		this.flush();
		this.cmds.push({ kind: 'end', x: this.pos.x, y: this.pos.y });
		return this.cmds;
	}
}

// Sews a set of polylines in a short order (nearest end first, reversing
// polylines when that's shorter), travelling inside `m` between them. With
// `sewn`, marks the cells each polyline covers so later travels avoid them.
function sewPolylines(sewer: Sewer, polys: Pt[][], m: Mask, sewn?: Uint8Array) {
	const left = polys.filter((p) => p.length > 1);
	while (left.length) {
		const here = sewer.here;
		let best = 0;
		let rev = false;
		let bestD = Infinity;
		left.forEach((p, i) => {
			const ds = dist(here, p[0]);
			const de = dist(here, p[p.length - 1]);
			if (ds < bestD) [best, rev, bestD] = [i, false, ds];
			if (de < bestD) [best, rev, bestD] = [i, true, de];
		});
		const poly = left.splice(best, 1)[0];
		if (rev) poly.reverse();
		const at = sewer.last;
		const path = at ? (bestD < 1 ? [at, poly[0]] : travel(m, at, poly[0], sewn)) : null;
		if (path) sewer.sew([...path.slice(1, -1), ...poly], true);
		else sewer.sew(poly, false);
		if (sewn) markSewn(sewn, m, poly);
	}
}

function markSewn(sewn: Uint8Array, m: Mask, poly: Pt[]) {
	for (let k = 1; k < poly.length; k++) {
		const [p, q] = [poly[k - 1], poly[k]];
		const n = Math.max(1, Math.ceil(dist(p, q) * PPM * 2));
		for (let j = 0; j <= n; j++) {
			const cx = Math.floor((p.x + ((q.x - p.x) * j) / n) * PPM) - m.ox;
			const cy = Math.floor((p.y + ((q.y - p.y) * j) / n) * PPM) - m.oy;
			// Rows are farther apart than a cell: cover the cells between them.
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const x = cx + dx;
					const y = cy + dy;
					if (x >= 0 && y >= 0 && x < m.w && y < m.h) sewn[y * m.w + x] = 1;
				}
			}
		}
	}
}

// Crops the picture to its subject: what differs from the colour along its
// edges (or isn't transparent), so the subject fills the patch instead of
// the empty margin around it.
function cropToContent(image: RasterImage): RasterImage {
	const { width: w, height: h, data: d } = image;
	let r = 0;
	let g = 0;
	let b = 0;
	let n = 0;
	let clear = 0;
	const edge = (x: number, y: number) => {
		const k = (y * w + x) * 4;
		if (d[k + 3] < 128) return clear++;
		r += d[k];
		g += d[k + 1];
		b += d[k + 2];
		n++;
	};
	for (let x = 0; x < w; x++) {
		edge(x, 0);
		edge(x, h - 1);
	}
	for (let y = 0; y < h; y++) {
		edge(0, y);
		edge(w - 1, y);
	}
	const bg = n > clear ? [r / n, g / n, b / n] : null;
	let x0 = w;
	let y0 = h;
	let x1 = -1;
	let y1 = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const k = (y * w + x) * 4;
			if (d[k + 3] < 128) continue;
			if (bg && Math.hypot(d[k] - bg[0], d[k + 1] - bg[1], d[k + 2] - bg[2]) < 60) continue;
			x0 = Math.min(x0, x);
			y0 = Math.min(y0, y);
			x1 = Math.max(x1, x);
			y1 = Math.max(y1, y);
		}
	}
	if (x1 < 0) return image;
	const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
	x0 = Math.max(0, x0 - m);
	y0 = Math.max(0, y0 - m);
	x1 = Math.min(w - 1, x1 + m);
	y1 = Math.min(h - 1, y1 + m);
	const cw = x1 - x0 + 1;
	const ch = y1 - y0 + 1;
	if (cw === w && ch === h) return image;
	const out = new Uint8ClampedArray(cw * ch * 4);
	for (let y = 0; y < ch; y++) {
		for (let x = 0; x < cw; x++) {
			const k = ((y + y0) * w + x + x0) * 4;
			out.set([d[k], d[k + 1], d[k + 2], d[k + 3]], (y * cw + x) * 4);
		}
	}
	return { width: cw, height: ch, data: out };
}

export function digitize(image: RasterImage, o: DigitizeOptions): Design {
	if (o.removeBackground) image = cropToContent(image);
	const p = place(image.width, image.height, o);
	const gw = Math.ceil(p.w * PPM);
	const gh = Math.ceil(p.h * PPM);
	const n = gw * gh;
	const { rgb, alpha, inImg } = resample(image, p, gw, gh);

	// Shape mask, then picture cells (opaque) to quantize.
	const labels = new Int16Array(n).fill(OUTSIDE);
	const opaque: number[] = [];
	for (let cy = 0; cy < gh; cy++) {
		for (let cx = 0; cx < gw; cx++) {
			const i = cy * gw + cx;
			if (!p.inShape((cx + 0.5) / PPM, (cy + 0.5) / PPM)) continue;
			labels[i] = EMPTY;
			if (inImg[i] && alpha[i] >= 0.5) opaque.push(i);
		}
	}

	const k = Math.max(1, Math.min(8, Math.round(o.colors))) + (o.removeBackground ? 1 : 0);
	const flat = new Float32Array(opaque.length * 3);
	opaque.forEach((i, j) => flat.set(rgb.subarray(i * 3, i * 3 + 3), j * 3));
	const centers = kmeans(flat, k);
	for (const i of opaque) labels[i] = nearestIndex(rgb.subarray(i * 3, i * 3 + 3) as unknown as RGB, centers);

	if (o.removeBackground && centers.length > 1) {
		// The background is the colour most present along the picture's edges,
		// removed where it connects to those edges (so enclosed areas of the
		// same colour, like the white of an eye, are kept).
		const edge: number[] = [];
		for (const i of opaque) {
			const x = i % gw;
			const y = (i - x) / gw;
			const atEdge = N4.some(([dx, dy]) => {
				const nx = x + dx;
				const ny = y + dy;
				return nx < 0 || ny < 0 || nx >= gw || ny >= gh || !inImg[ny * gw + nx];
			});
			if (atEdge) edge.push(i);
		}
		const counts = new Array(centers.length).fill(0);
		for (const i of edge) counts[labels[i]]++;
		const bg = counts.indexOf(Math.max(...counts));
		const seen = new Uint8Array(n);
		const stack = edge.filter((i) => labels[i] === bg);
		for (const i of stack) seen[i] = 1;
		while (stack.length) {
			const i = stack.pop()!;
			labels[i] = EMPTY;
			const x = i % gw;
			const y = (i - x) / gw;
			for (const [dx, dy] of N4) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
				const j = ny * gw + nx;
				if (!seen[j] && labels[j] === bg) {
					seen[j] = 1;
					stack.push(j);
				}
			}
		}
	}

	// Colours → Brother threads; colours that land on the same thread merge.
	const threadOf = centers.map((c) => nearestThread(c).index);
	const firstWith = new Map<number, number>();
	const remap = threadOf.map((t, i) => {
		if (!firstWith.has(t)) firstWith.set(t, i);
		return firstWith.get(t)!;
	});
	for (let i = 0; i < n; i++) if (labels[i] >= 0) labels[i] = remap[labels[i]];

	majority(labels, gw, gh);
	removeSpecks(labels, gw, gh, Math.round(1.2 * PPM * PPM));

	// The patch background, when asked for, is one more colour.
	const BG = centers.length;
	const layers: { label: number; thread: number; area: number }[] = [];
	if (o.backgroundThread && o.shape !== 'none') {
		for (let i = 0; i < n; i++) if (labels[i] === EMPTY) labels[i] = BG;
	}
	const area = new Map<number, number>();
	for (let i = 0; i < n; i++) if (labels[i] >= 0) area.set(labels[i], (area.get(labels[i]) ?? 0) + 1);
	for (const [label, a] of area) {
		layers.push({ label, thread: label === BG ? o.backgroundThread! : threadOf[label], area: a });
	}
	// Background first, then the largest areas, details last (on top).
	layers.sort((a, b) => (a.label === BG ? -1 : b.label === BG ? 1 : b.area - a.area));
	const order = new Map(layers.map((l, i) => [l.label, i]));

	const sewer = new Sewer();
	const spacing = Math.min(0.8, Math.max(0.3, o.spacing ?? 0.4));
	layers.forEach((layer, li) => {
		// Each area extends a cell under the areas sewn after it, so fabric
		// doesn't show between them once the stitches pull in.
		const fill = new Uint8Array(n);
		for (let i = 0; i < n; i++) {
			if (labels[i] === layer.label) {
				fill[i] = 1;
				continue;
			}
			const later = labels[i] >= 0 && order.get(labels[i])! > li;
			if (!later) continue;
			const x = i % gw;
			const y = (i - x) / gw;
			const touches = N4.some(([dx, dy]) => {
				const nx = x + dx;
				const ny = y + dy;
				return nx >= 0 && ny >= 0 && nx < gw && ny < gh && labels[ny * gw + nx] === layer.label;
			});
			if (touches) fill[i] = 1;
		}
		const { list } = components(
			gw,
			gh,
			(i) => fill[i] === 1,
			() => true
		);
		const angle = ((li % 2 === 0 ? 45 : 135) * Math.PI) / 180;
		const parts = list.map((cells) => {
			let x0 = gw;
			let y0 = gh;
			let x1 = 0;
			let y1 = 0;
			for (const i of cells) {
				const x = i % gw;
				const y = (i - x) / gw;
				x0 = Math.min(x0, x);
				y0 = Math.min(y0, y);
				x1 = Math.max(x1, x);
				y1 = Math.max(y1, y);
			}
			// One cell of margin so erosion and lookups stay simple.
			x0--;
			y0--;
			const w = x1 - x0 + 2;
			const h = y1 - y0 + 2;
			const mask = new Uint8Array(w * h);
			for (const i of cells) {
				const x = i % gw;
				const y = (i - x) / gw;
				mask[(y - y0) * w + (x - x0)] = 1;
			}
			const m: Mask = { mask, w, h, ox: x0, oy: y0 };
			const areaMm2 = cells.length / (PPM * PPM);
			const under =
				areaMm2 > 20 ? tatamiFill({ ...erode(m, 2), ppm: PPM }, { angle: angle + Math.PI / 2, spacing: 2, stitchLen: STITCH_LEN }) : [];
			const top = tatamiFill({ ...m, ppm: PPM }, { angle, spacing, stitchLen: STITCH_LEN });
			return { m, under, top };
		});
		const todo = parts.filter((pt) => pt.top.length);
		if (!todo.length) return;
		sewer.thread(layer.thread);
		while (todo.length) {
			const at = sewer.here;
			let best = 0;
			let bestD = Infinity;
			todo.forEach((pt, i) => {
				for (const poly of [...pt.under, ...pt.top]) {
					const d = Math.min(dist(at, poly[0]), dist(at, poly[poly.length - 1]));
					if (d < bestD) [best, bestD] = [i, d];
				}
			});
			const pt = todo.splice(best, 1)[0];
			sewer.flush(); // a new area starts after a jump
			sewPolylines(sewer, pt.under, pt.m);
			sewPolylines(sewer, pt.top, pt.m, new Uint8Array(pt.m.w * pt.m.h));
		}
	});

	if (p.border) {
		sewer.thread(o.borderThread ?? 20);
		sewer.flush();
		const under = runAlong(p.border, 0, 2.5);
		const satin = satinAlong(p.border, BORDER_WIDTH, 0.2);
		sewer.sew(under, false);
		sewer.sew(satin, true);
	}

	const mm = sewer.finish();
	// Centre on (0, 0), in 0.1 mm.
	const commands = mm.map((c) => ({ kind: c.kind, x: Math.round((c.x - p.w / 2) * 10), y: Math.round((c.y - p.h / 2) * 10) }));
	return {
		commands,
		threads: sewer.threads.length ? sewer.threads : [20],
		widthMm: p.w,
		heightMm: p.h,
		stitchCount: commands.filter((c) => c.kind === 'stitch').length,
		jumpCount: commands.filter((c) => c.kind === 'jump').length
	};
}

// Sewing time in minutes at the machine's top speed, plus a minute per
// thread change.
export function sewingMinutes(d: Design): number {
	return d.stitchCount / MACHINE_SPM + (d.threads.length - 1);
}
