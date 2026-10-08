// Stitch geometry, in millimetres: tatami fill of a pixel region and satin
// columns along a closed path.

export type Pt = { x: number; y: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// Appends a straight move to `out`, split so no stitch is longer than
// `maxLen` (a long stitch snags and is not held down).
export function lineTo(out: Pt[], to: Pt, maxLen: number) {
	const from = out[out.length - 1];
	if (!from) {
		out.push(to);
		return;
	}
	const len = dist(from, to);
	if (len < 1e-6) return;
	const n = Math.ceil(len / maxLen);
	for (let i = 1; i <= n; i++) out.push({ x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
}

// A region: `mask[y * w + x]` is 1 for cells to fill, at `ppm` cells per mm,
// the mask's (0,0) cell sitting at (`ox`, `oy`) cells in design space.
export type Region = { mask: Uint8Array; w: number; h: number; ox: number; oy: number; ppm: number };

export type FillOptions = {
	angle: number; // radians, direction of the stitch rows
	spacing: number; // mm between rows
	stitchLen: number; // mm, nominal stitch length along a row
	minRun?: number; // mm, shorter runs are skipped
};

type Segment = { v: number; a: number; b: number; row: number };

// Tatami fill: parallel rows of running stitches, sewn back and forth, with
// the needle points of each row offset by a third of a stitch from the
// previous one (the brick pattern that keeps the surface smooth instead of
// forming visible furrows). Returns continuous polylines; each one can be
// sewn without leaving the region, and separate polylines need a jump.
export function tatamiFill(r: Region, o: FillOptions): Pt[][] {
	const { mask, w, h, ox, oy, ppm } = r;
	const minRun = o.minRun ?? 0.5;
	const U = { x: Math.cos(o.angle), y: Math.sin(o.angle) };
	const V = { x: -U.y, y: U.x };
	const inside = (u: number, v: number) => {
		const x = u * U.x + v * V.x;
		const y = u * U.y + v * V.y;
		const cx = Math.floor(x * ppm) - ox;
		const cy = Math.floor(y * ppm) - oy;
		return cx >= 0 && cy >= 0 && cx < w && cy < h && mask[cy * w + cx] === 1;
	};

	// Extent of the region in (u, v).
	const corners = [
		[ox, oy],
		[ox + w, oy],
		[ox, oy + h],
		[ox + w, oy + h]
	].map(([x, y]) => ({ x: x / ppm, y: y / ppm }));
	const us = corners.map((c) => c.x * U.x + c.y * U.y);
	const vs = corners.map((c) => c.x * V.x + c.y * V.y);
	const [u0, u1] = [Math.min(...us), Math.max(...us)];
	const [v0, v1] = [Math.min(...vs), Math.max(...vs)];
	const du = 0.5 / ppm;

	// Rows are anchored on a global grid (multiples of the spacing), so two
	// neighbouring regions of the same colour get aligned rows.
	const rows: Segment[][] = [];
	const firstRow = Math.ceil(v0 / o.spacing);
	for (let k = firstRow; k * o.spacing <= v1; k++) {
		const v = k * o.spacing;
		const segs: Segment[] = [];
		let start: number | null = null;
		for (let u = u0; u <= u1 + du; u += du) {
			const isIn = u <= u1 && inside(u, v);
			if (isIn && start === null) start = u;
			if (!isIn && start !== null) {
				const end = u - du;
				if (end - start >= minRun) segs.push({ v, a: start, b: end, row: k });
				start = null;
			}
		}
		rows.push(segs);
	}

	// Chain overlapping segments of consecutive rows into blocks: each block
	// is sewn as one serpentine without leaving the shape.
	type Block = Segment[];
	const blocks: Block[] = [];
	let open: { block: Block; last: Segment }[] = [];
	for (const segs of rows) {
		const next: typeof open = [];
		const used = new Set<number>();
		for (const s of segs) {
			const idx = open.findIndex((ob, i) => !used.has(i) && s.a <= ob.last.b && s.b >= ob.last.a);
			if (idx >= 0) {
				used.add(idx);
				open[idx].block.push(s);
				next.push({ block: open[idx].block, last: s });
			} else {
				const block: Block = [s];
				blocks.push(block);
				next.push({ block, last: s });
			}
		}
		open = next;
	}

	const toXY = (u: number, v: number): Pt => ({ x: u * U.x + v * V.x, y: u * U.y + v * V.y });
	return blocks.map((block) => {
		const out: Pt[] = [];
		block.forEach((s, i) => {
			const forward = i % 2 === 0;
			const [from, to] = forward ? [s.a, s.b] : [s.b, s.a];
			// Brick offset: needle positions on a grid shifted by a third of a
			// stitch every row.
			const offset = (((s.row % 3) + 3) % 3) * (o.stitchLen / 3);
			const pts = [from];
			const first = Math.ceil((Math.min(from, to) - offset) / o.stitchLen);
			const grid: number[] = [];
			for (let g = first; offset + g * o.stitchLen < Math.max(from, to); g++) grid.push(offset + g * o.stitchLen);
			if (!forward) grid.reverse();
			for (const g of grid) if (Math.abs(g - pts[pts.length - 1]) >= o.stitchLen * 0.3 && Math.abs(to - g) >= o.stitchLen * 0.3) pts.push(g);
			pts.push(to);
			for (const u of pts) lineTo(out, toXY(u, s.v), o.stitchLen * 1.5);
		});
		return out;
	});
}

// A closed path given as a function of the arc length `s` (0..length):
// position and outward unit normal.
export type ClosedPath = { length: number; at: (s: number) => { p: Pt; n: Pt } };

export function circlePath(cx: number, cy: number, r: number): ClosedPath {
	return {
		length: 2 * Math.PI * r,
		at: (s) => {
			const t = s / r;
			const n = { x: Math.cos(t), y: Math.sin(t) };
			return { p: { x: cx + r * n.x, y: cy + r * n.y }, n };
		}
	};
}

// Rounded rectangle centred on (cx, cy), half sizes hw/hh, corner radius r.
export function roundedRectPath(cx: number, cy: number, hw: number, hh: number, r: number): ClosedPath {
	r = Math.max(0.01, Math.min(r, hw, hh));
	const sx = 2 * (hw - r);
	const sy = 2 * (hh - r);
	const arc = (Math.PI / 2) * r;
	// Pieces, clockwise from the top edge's left end (screen coordinates).
	const pieces: { len: number; at: (t: number) => { p: Pt; n: Pt } }[] = [
		{ len: sx, at: (t) => ({ p: { x: cx - hw + r + t, y: cy - hh }, n: { x: 0, y: -1 } }) },
		{ len: arc, at: (t) => corner(cx + hw - r, cy - hh + r, -Math.PI / 2 + t / r) },
		{ len: sy, at: (t) => ({ p: { x: cx + hw, y: cy - hh + r + t }, n: { x: 1, y: 0 } }) },
		{ len: arc, at: (t) => corner(cx + hw - r, cy + hh - r, t / r) },
		{ len: sx, at: (t) => ({ p: { x: cx + hw - r - t, y: cy + hh }, n: { x: 0, y: 1 } }) },
		{ len: arc, at: (t) => corner(cx - hw + r, cy + hh - r, Math.PI / 2 + t / r) },
		{ len: sy, at: (t) => ({ p: { x: cx - hw, y: cy + hh - r - t }, n: { x: -1, y: 0 } }) },
		{ len: arc, at: (t) => corner(cx - hw + r, cy - hh + r, Math.PI + t / r) }
	];
	function corner(ccx: number, ccy: number, a: number) {
		const n = { x: Math.cos(a), y: Math.sin(a) };
		return { p: { x: ccx + r * n.x, y: ccy + r * n.y }, n };
	}
	const length = pieces.reduce((s, p) => s + p.len, 0);
	return {
		length,
		at: (s) => {
			s = ((s % length) + length) % length;
			for (const piece of pieces) {
				if (s <= piece.len) return piece.at(s);
				s -= piece.len;
			}
			return pieces[0].at(0);
		}
	};
}

// Running stitch along a closed path (used as satin underlay).
export function runAlong(path: ClosedPath, offset: number, stitchLen: number): Pt[] {
	const n = Math.max(3, Math.ceil(path.length / stitchLen));
	const out: Pt[] = [];
	for (let i = 0; i <= n; i++) {
		const { p, n: nn } = path.at((path.length * i) / n);
		out.push({ x: p.x + nn.x * offset, y: p.y + nn.y * offset });
	}
	return out;
}

// Satin column `width` wide centred on the path: a zigzag between its two
// edges, one stitch every `spacing` mm along the path. Closes on itself with
// a little overlap so the start doesn't show a gap.
export function satinAlong(path: ClosedPath, width: number, spacing: number): Pt[] {
	const n = Math.ceil(path.length / spacing);
	const out: Pt[] = [];
	for (let i = 0; i <= n + 2; i++) {
		const { p, n: nn } = path.at((path.length * i) / n);
		const side = i % 2 === 0 ? 1 : -1;
		out.push({ x: p.x + nn.x * side * (width / 2), y: p.y + nn.y * side * (width / 2) });
	}
	return out;
}
