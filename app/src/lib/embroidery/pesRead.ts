// PES reader: enough of a .pes file (any version) to show and catalogue a
// patch made elsewhere. Only the PEC section is read -- every PES version
// carries it, and it is what the machines sew from. Ported from pyembroidery's
// PecReader (MIT, https://github.com/EmbroidePy/pyembroidery).
// Coordinates come out in 0.1 mm units, y pointing down, like writePes takes.

import type { Command } from './pes';

export type PesDesign = {
	commands: Command[];
	threads: number[]; // PEC palette indices (1..64), one per colour block
	stitchCount: number;
	widthMm: number;
	heightMm: number;
};

export class PesReadError extends Error {}

const MAX_COMMANDS = 1_000_000;

const signed7 = (v: number) => (v > 63 ? v - 128 : v);
const signed12 = (v: number) => {
	v &= 0xfff;
	return v > 2047 ? v - 4096 : v;
};

export function readPes(bytes: Uint8Array): PesDesign {
	const ascii = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
	if (bytes.length < 12 || !/^#PES\d{4}$/.test(ascii(0, 8))) throw new PesReadError('not a PES file');
	const pec = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
	// LA:label(16), 15 bytes, icon stride and height, 12 bytes, colour count.
	let p = pec + 3 + 16 + 15 + 2 + 12;
	if (pec < 12 || p + 1 >= bytes.length) throw new PesReadError('no PEC section');
	const colorCount = bytes[p++] + 1;
	const palette = [...bytes.subarray(p, p + colorCount)].map((i) => (i >= 1 && i <= 64 ? i : 20));
	p += 0x1d1; // the colours, then padding up to the stitch block
	// The stitch block starts 2 bytes before its 3-byte length (which counts
	// from that start), then 0x31 0xff 0xf0 and four shorts.
	const end = Math.min(bytes.length, p - 2 + (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16)));
	p += 3 + 0x0b;

	const commands: Command[] = [];
	let x = 0;
	let y = 0;
	let colorBlocks = 1;
	const next = () => (p < end ? bytes[p++] : -1);
	while (p < end && commands.length < MAX_COMMANDS) {
		const v1 = next();
		if (v1 === 0xff || v1 < 0) break;
		let v2 = next();
		if (v2 < 0) break;
		if (v1 === 0xfe && v2 === 0xb0) {
			p++; // which of the two colour slots: not needed
			commands.push({ kind: 'color', x, y });
			colorBlocks++;
			continue;
		}
		let move = false;
		let dx: number;
		if (v1 & 0x80) {
			move = (v1 & 0x30) !== 0; // jump or trim
			dx = signed12((v1 << 8) | v2);
			v2 = next();
			if (v2 < 0) break;
		} else dx = signed7(v1);
		let dy: number;
		if (v2 & 0x80) {
			move ||= (v2 & 0x30) !== 0;
			const v3 = next();
			if (v3 < 0) break;
			dy = signed12((v2 << 8) | v3);
		} else dy = signed7(v2);
		x += dx;
		y += dy;
		commands.push({ kind: move ? 'jump' : 'stitch', x, y });
	}
	commands.push({ kind: 'end', x, y });

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let stitchCount = 0;
	for (const c of commands) {
		if (c.kind !== 'stitch') continue;
		stitchCount++;
		minX = Math.min(minX, c.x);
		minY = Math.min(minY, c.y);
		maxX = Math.max(maxX, c.x);
		maxY = Math.max(maxY, c.y);
	}
	if (!stitchCount) throw new PesReadError('no stitches');
	// One thread per colour block; a file listing too few repeats the last one.
	const threads = Array.from({ length: colorBlocks }, (_, i) => palette[Math.min(i, palette.length - 1)] ?? 20);
	return { commands, threads, stitchCount, widthMm: (maxX - minX) / 10, heightMm: (maxY - minY) / 10 };
}
