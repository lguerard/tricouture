// PES v1 writer (Brother): a small PES header with one CEmbOne/CSewSeg block,
// followed by the PEC section the machines actually sew from. Ported from
// pyembroidery's PesWriter/PecWriter (MIT, https://github.com/EmbroidePy/pyembroidery).
// Coordinates are in 0.1 mm units, y pointing down.

import { PEC_ICON_BLANK } from './threads';

export type Command = { kind: 'stitch' | 'jump' | 'color' | 'end'; x: number; y: number };

class Writer {
	private buf: Uint8Array<ArrayBuffer> = new Uint8Array(1 << 16);
	length = 0;
	private ensure(n: number) {
		if (this.length + n <= this.buf.length) return;
		let size = this.buf.length * 2;
		while (size < this.length + n) size *= 2;
		const next = new Uint8Array(size);
		next.set(this.buf.subarray(0, this.length));
		this.buf = next;
	}
	u8(...v: number[]) {
		this.ensure(v.length);
		for (const b of v) this.buf[this.length++] = b & 0xff;
	}
	bytes(v: ArrayLike<number>) {
		this.ensure(v.length);
		for (let i = 0; i < v.length; i++) this.buf[this.length++] = v[i] & 0xff;
	}
	ascii(s: string) {
		for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i) & 0x7f);
	}
	i16(v: number) {
		this.u8(v, v >> 8);
	}
	i24(v: number) {
		this.u8(v, v >> 8, v >> 16);
	}
	i32(v: number) {
		this.u8(v, v >> 8, v >> 16, v >> 24);
	}
	f32(v: number) {
		const b = new Uint8Array(new Float32Array([v]).buffer);
		this.bytes(b); // little-endian on every platform a browser runs on
	}
	patch16(at: number, v: number) {
		this.buf[at] = v & 0xff;
		this.buf[at + 1] = (v >> 8) & 0xff;
	}
	patch24(at: number, v: number) {
		this.patch16(at, v);
		this.buf[at + 2] = (v >> 16) & 0xff;
	}
	patch32(at: number, v: number) {
		this.patch24(at, v);
		this.buf[at + 3] = (v >>> 24) & 0xff;
	}
	result() {
		return this.buf.slice(0, this.length);
	}
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function bounds(cmds: Command[]): Bounds {
	const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
	for (const c of cmds) {
		b.minX = Math.min(b.minX, c.x);
		b.minY = Math.min(b.minY, c.y);
		b.maxX = Math.max(b.maxX, c.x);
		b.maxY = Math.max(b.maxY, c.y);
	}
	if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	return b;
}

// Stitch values: one byte for -64 < v < 63, else 12 bits on two bytes with
// the long flag (and the jump/trim flag).
function pecValue(w: Writer, v: number, long = false, flag = 0) {
	if (!long && v > -64 && v < 63) w.u8(v & 0x7f);
	else {
		const x = (v & 0xfff) | 0x8000 | (flag << 8);
		w.u8(x >> 8, x);
	}
}

function encodePecStitches(w: Writer, cmds: Command[]) {
	let colorTwo = true;
	let jumping = true;
	let init = true;
	let xx = 0;
	let yy = 0;
	for (const c of cmds) {
		const dx = Math.round(c.x - xx);
		const dy = Math.round(c.y - yy);
		xx += dx;
		yy += dy;
		if (c.kind === 'stitch') {
			if (jumping) {
				if (dx !== 0 && dy !== 0) {
					pecValue(w, 0);
					pecValue(w, 0);
				}
				jumping = false;
			}
			pecValue(w, dx);
			pecValue(w, dy);
		} else if (c.kind === 'jump') {
			jumping = true;
			// The first move is a plain jump; later ones also trim the thread.
			const flag = init ? 0x10 : 0x20;
			pecValue(w, dx, true, flag);
			pecValue(w, dy, true, flag);
		} else if (c.kind === 'color') {
			if (jumping) {
				pecValue(w, 0);
				pecValue(w, 0);
				jumping = false;
			}
			w.u8(0xfe, 0xb0, colorTwo ? 2 : 1);
			colorTwo = !colorTwo;
		} else {
			w.u8(0xff);
			break;
		}
		init = false;
	}
}

// 48×38 monochrome thumbnails: the whole design, then one per colour.
function icon(b: Bounds, points: { x: number; y: number }[], margin: number): number[] {
	const g = [...PEC_ICON_BLANK];
	const W = 48;
	const H = 38;
	const dw = b.maxX - b.minX || 1;
	const dh = b.maxY - b.minY || 1;
	const scale = Math.min((W - margin) / dw, (H - margin) / dh);
	const tx = -((b.maxX + b.minX) / 2) * scale + W / 2;
	const ty = -((b.maxY + b.minY) / 2) * scale + H / 2;
	for (const p of points) {
		const x = Math.floor(p.x * scale + tx);
		const y = Math.floor(p.y * scale + ty);
		if (x < 0 || y < 0 || x >= W || y >= H) continue;
		g[y * 6 + (x >> 3)] |= 1 << (x & 7);
	}
	return g;
}

function writePec(w: Writer, cmds: Command[], threads: number[], name: string) {
	const b = bounds(cmds);
	w.ascii(`LA:${name.slice(0, 8).padEnd(16, ' ')}\r`);
	w.bytes([0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0xff, 0x00]);
	w.u8(48 / 8, 38);
	if (threads.length) {
		w.bytes(new Array(12).fill(0x20));
		w.u8(threads.length - 1, ...threads);
	} else {
		w.bytes([0x20, 0x20, 0x20, 0x20, 0x64, 0x20, 0x00, 0x20, 0x00, 0x20, 0x20, 0x20, 0xff]);
	}
	w.bytes(new Array(463 - threads.length).fill(0x20));

	const start = w.length;
	w.u8(0, 0);
	w.i24(0);
	w.u8(0x31, 0xff, 0xf0);
	w.i16(Math.round(b.maxX - b.minX));
	w.i16(Math.round(b.maxY - b.minY));
	w.i16(0x1e0);
	w.i16(0x1b0);
	encodePecStitches(w, cmds);
	w.patch24(start + 2, w.length - start);

	const stitches = cmds.filter((c) => c.kind === 'stitch');
	w.bytes(icon(b, stitches, 4));
	let block: Command[] = [];
	for (const c of cmds) {
		if (c.kind === 'stitch') block.push(c);
		if (c.kind === 'color' || c.kind === 'end') {
			if (c.kind === 'color' || block.length) w.bytes(icon(b, block, 5));
			block = [];
			if (c.kind === 'end') break;
		}
	}
}

// `threads` are PEC palette indices (1..64), one per colour block: there must
// be exactly one more than there are 'color' commands.
export function writePes(cmds: Command[], threads: number[], name = 'Tricouture'): Uint8Array<ArrayBuffer> {
	if (!cmds.length || cmds[cmds.length - 1].kind !== 'end') {
		const last = cmds[cmds.length - 1] ?? { x: 0, y: 0 };
		cmds = [...cmds, { kind: 'end', x: last.x, y: last.y }];
	}
	const w = new Writer();
	const b = bounds(cmds);
	const width = b.maxX - b.minX;
	const height = b.maxY - b.minY;
	const hasStitches = cmds.some((c) => c.kind === 'stitch');

	w.ascii('#PES0001');
	const pecOffset = w.length;
	w.i32(0);
	w.i16(1); // scale to fit
	w.i16(1); // hoop: 0 = 100×100
	w.i16(hasStitches ? 1 : 0);
	w.i16(hasStitches ? 0xffff : 0);
	w.i16(0);

	if (hasStitches) {
		w.i16(7);
		w.ascii('CEmbOne');
		for (let i = 0; i < 8; i++) w.i16(0);
		w.f32(1);
		w.f32(0);
		w.f32(0);
		w.f32(1);
		w.f32(350 + 1300 / 2 - width / 2);
		w.f32(100 + height + 1800 / 2 - height / 2);
		w.i16(1);
		w.i16(0);
		w.i16(0);
		w.i16(Math.trunc(width));
		w.i16(Math.trunc(height));
		w.bytes([0, 0, 0, 0, 0, 0, 0, 0]);
		const sectionsAt = w.length;
		w.i16(0);
		w.i16(0xffff);
		w.i16(0);

		w.i16(7);
		w.ascii('CSewSeg');
		// Segments: runs of stitches (flag 0) and jumps (flag 1), relative to
		// the bottom-left corner of the design.
		const adjX = b.minX;
		const adjY = b.maxY;
		let colorIdx = 0;
		let section = 0;
		let started = false;
		let prevColor = -1;
		const colorlog: [number, number][] = [];
		let sx = 0;
		let sy = 0;
		let i = 0;
		while (i < cmds.length) {
			const kind = cmds[i].kind;
			let j = i;
			while (j < cmds.length && cmds[j].kind === kind) j++;
			const run = cmds.slice(i, j);
			i = j;
			if (kind === 'color') {
				colorIdx += run.length;
				continue;
			}
			let pts: { x: number; y: number }[];
			let flag: number;
			if (kind === 'jump') {
				const last = run[run.length - 1];
				pts = [
					{ x: sx, y: sy },
					{ x: last.x, y: last.y }
				];
				flag = 1;
			} else if (kind === 'stitch') {
				pts = run;
				const last = run[run.length - 1];
				sx = last.x;
				sy = last.y;
				flag = 0;
			} else continue;
			if (started) w.i16(0x8003);
			started = true;
			const color = threads[Math.min(colorIdx, threads.length - 1)] ?? 20;
			if (color !== prevColor) {
				colorlog.push([section, color]);
				prevColor = color;
			}
			w.i16(flag);
			w.i16(color);
			w.i16(pts.length);
			for (const p of pts) {
				w.i16(Math.trunc(p.x - adjX));
				w.i16(Math.trunc(p.y - adjY));
			}
			section++;
		}
		w.i16(colorlog.length);
		for (const [s, c] of colorlog) {
			w.i16(s);
			w.i16(c);
		}
		w.patch16(sectionsAt, section);
		w.i16(0);
		w.i16(0);
	}

	w.patch32(pecOffset, w.length);
	writePec(w, cmds, threads, name);
	return w.result();
}
