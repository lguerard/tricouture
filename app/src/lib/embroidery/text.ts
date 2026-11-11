// Text patches: the text is drawn on a canvas in the chosen font and thread
// colours, then digitized like any picture (digitize.ts). Fonts are bundled
// with the app (Fontsource, open licences), so this works without internet.
//
// Bold, simple letters stitch best: the fill needs strokes of about 2 mm, so
// the fonts offered are all heavy ones, and the text is kept short.

import { PEC_THREADS, threadHex } from './threads';

export type TextFont = { id: string; family: string; weight: number; label: string };

// Loaded by the page (font CSS imports); `id` is what is stored with a patch.
export const TEXT_FONTS: readonly TextFont[] = [
	{ id: 'fredoka', family: 'Fredoka', weight: 700, label: 'Arrondie' },
	{ id: 'anton', family: 'Anton', weight: 400, label: 'Bâton' },
	{ id: 'bebas', family: 'Bebas Neue', weight: 400, label: 'Capitales' },
	{ id: 'alfa', family: 'Alfa Slab One', weight: 400, label: 'Empattements' },
	{ id: 'marker', family: 'Permanent Marker', weight: 400, label: 'Feutre' },
	{ id: 'lobster', family: 'Lobster', weight: 400, label: 'Rétro' },
	{ id: 'pacifico', family: 'Pacifico', weight: 400, label: 'Manuscrite' }
];

export type TextOutline = 'none' | 'thin' | 'thick';
export type TextAlign = 'left' | 'center' | 'right';

export type TextSettings = {
	content: string; // up to MAX_LINES lines
	font: string; // TEXT_FONTS id
	thread: number; // PEC index of the letters
	outlineThread: number; // PEC index of the outline
	outline: TextOutline;
	align: TextAlign;
};

export const MAX_LINES = 3;
export const MAX_CHARS = 60;

export const DEFAULT_TEXT: TextSettings = {
	content: '',
	font: 'fredoka',
	thread: 1, // Prussian Blue (threads.ts)
	outlineThread: 29, // White
	outline: 'none',
	align: 'center'
};

const isThread = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 64;

// Checks stored / submitted text settings; null when unusable.
export function parseTextSettings(raw: unknown): TextSettings | null {
	if (!raw || typeof raw !== 'object') return null;
	const t = raw as Record<string, unknown>;
	const content = cleanText(typeof t.content === 'string' ? t.content : '');
	if (!content.trim()) return null;
	return {
		content,
		font: TEXT_FONTS.some((f) => f.id === t.font) ? (t.font as string) : DEFAULT_TEXT.font,
		thread: isThread(t.thread) ? t.thread : DEFAULT_TEXT.thread,
		outlineThread: isThread(t.outlineThread) ? t.outlineThread : DEFAULT_TEXT.outlineThread,
		outline: t.outline === 'thin' || t.outline === 'thick' ? t.outline : 'none',
		align: t.align === 'left' || t.align === 'right' ? t.align : 'center'
	};
}

// At most MAX_LINES lines and MAX_CHARS characters, no trailing spaces.
export function cleanText(s: string): string {
	return s
		.replace(/\r/g, '')
		.split('\n')
		.slice(0, MAX_LINES)
		.map((l) => l.replace(/\s+$/, ''))
		.join('\n')
		.slice(0, MAX_CHARS);
}

const FONT_PX = 160; // drawing size; the patch size is set when digitizing
const LINE_GAP = 0.12; // extra space between lines, in font sizes
const OUTLINE = { none: 0, thin: 0.06, thick: 0.11 } as const; // stroke width, in font sizes

export const fontOf = (id: string) => TEXT_FONTS.find((f) => f.id === id) ?? TEXT_FONTS[0];
const cssFont = (f: TextFont) => `${f.weight} ${FONT_PX}px "${f.family}"`;
const hexOf = (index: number) => {
	const th = PEC_THREADS.find((t) => t.index === index);
	return th ? threadHex(th) : '#000000';
};

// Waits for the font's file: drawing before it is loaded silently falls back
// on another font.
export async function loadFont(id: string): Promise<void> {
	await document.fonts.load(cssFont(fontOf(id)), 'AÉa');
}

// The text on a transparent canvas cropped to the letters (plus the outline):
// what digitize() turns into stitches. Null when there is nothing to draw.
export function renderText(t: TextSettings): HTMLCanvasElement | null {
	const lines = cleanText(t.content).split('\n');
	if (!lines.some((l) => l.trim())) return null;
	const f = fontOf(t.font);
	const stroke = OUTLINE[t.outline] * FONT_PX;

	const measure = document.createElement('canvas').getContext('2d')!;
	measure.font = cssFont(f);
	const metrics = lines.map((l) => measure.measureText(l || ' '));
	const ascent = Math.max(...metrics.map((m) => m.actualBoundingBoxAscent), FONT_PX * 0.5);
	const descent = Math.max(...metrics.map((m) => m.actualBoundingBoxDescent), 0);
	const lineH = ascent + descent + LINE_GAP * FONT_PX;
	// Script fonts overhang their advance width: use the inked extent.
	const lefts = metrics.map((m) => m.actualBoundingBoxLeft);
	const widths = metrics.map((m) => m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
	const textW = Math.max(...widths, 1);
	const pad = Math.ceil(stroke + 4);
	const w = Math.ceil(textW + 2 * pad);
	const h = Math.ceil(lines.length * lineH - LINE_GAP * FONT_PX + 2 * pad);

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;
	ctx.font = cssFont(f);
	ctx.textBaseline = 'alphabetic';
	ctx.lineJoin = 'round';
	ctx.miterLimit = 2;
	const xOf = (i: number) => {
		const free = textW - widths[i];
		const shift = t.align === 'left' ? 0 : t.align === 'right' ? free : free / 2;
		return pad + shift + lefts[i];
	};
	const yOf = (i: number) => pad + ascent + i * lineH;
	if (stroke > 0) {
		// Twice the width: half of the stroke is hidden under the letters.
		ctx.lineWidth = 2 * stroke;
		ctx.strokeStyle = hexOf(t.outlineThread);
		lines.forEach((l, i) => ctx.strokeText(l, xOf(i), yOf(i)));
	}
	ctx.fillStyle = hexOf(t.thread);
	lines.forEach((l, i) => ctx.fillText(l, xOf(i), yOf(i)));
	return canvas;
}

// Thread colours used by the text: what digitize() should keep apart.
export const textColorCount = (t: TextSettings) => (t.outline !== 'none' && t.outlineThread !== t.thread ? 2 : 1);
