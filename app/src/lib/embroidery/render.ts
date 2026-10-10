// Draws a design's stitches on a canvas, each in its thread colour.
import type { Command } from './pes';
import { PEC_THREADS, threadHex } from './threads';

const hexByIndex = new Map(PEC_THREADS.map((th) => [th.index, threadHex(th)]));

// `scale` is canvas pixels per 0.1 mm; (ox, oy) is where design (0, 0) lands.
export function drawStitches(ctx: CanvasRenderingContext2D, commands: Command[], threads: number[], scale: number, ox: number, oy: number) {
	ctx.save();
	ctx.translate(ox, oy);
	ctx.scale(scale, scale);
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = 3.5; // ~0.35 mm thread
	let block = 0;
	let prev = false;
	const stroke = () => {
		ctx.strokeStyle = hexByIndex.get(threads[block] ?? 20) ?? '#000';
		ctx.stroke();
		ctx.beginPath();
	};
	ctx.beginPath();
	for (const c of commands) {
		if (c.kind === 'stitch') {
			if (prev) ctx.lineTo(c.x, c.y);
			else ctx.moveTo(c.x, c.y);
			prev = true;
		} else if (c.kind === 'jump') {
			prev = false;
		} else if (c.kind === 'color') {
			stroke();
			block++;
			prev = false;
		}
	}
	stroke();
	ctx.restore();
}

// A square picture of the design alone (transparent around it), for the
// library: `size` pixels, the design fitted with a small margin.
export function renderThumbnail(commands: Command[], threads: number[], size = 480): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const c of commands) {
		if (c.kind !== 'stitch') continue;
		minX = Math.min(minX, c.x);
		minY = Math.min(minY, c.y);
		maxX = Math.max(maxX, c.x);
		maxY = Math.max(maxY, c.y);
	}
	if (!Number.isFinite(minX)) return canvas;
	const scale = (size * 0.94) / Math.max(maxX - minX, maxY - minY, 1);
	const ctx = canvas.getContext('2d')!;
	drawStitches(ctx, commands, threads, scale, size / 2 - ((minX + maxX) / 2) * scale, size / 2 - ((minY + maxY) / 2) * scale);
	return canvas;
}

// WebP when the browser can encode it (much smaller), PNG otherwise.
export async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.9));
	if (webp && webp.type === 'image/webp') return webp;
	const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
	if (!png) throw new Error('canvas encoding failed');
	return png;
}
