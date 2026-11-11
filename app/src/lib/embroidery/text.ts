// Text patches: the text is drawn on a canvas in the chosen font and thread
// colours, then digitized like any picture (digitize.ts). Fonts are bundled
// with the app (Fontsource, open licences), so this works without internet.
//
// Bold, simple letters stitch best: the fill needs strokes of about 2 mm, so
// the fonts offered are all heavy ones, and the text is kept short.

import { PEC_THREADS, threadHex } from './threads';

export const FONT_CATEGORIES = ['baton', 'arrondie', 'serif', 'script', 'fantaisie'] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];
export type TextFont = { id: string; family: string; weight: number; cat: FontCategory };

// Loaded by the page (fonts.ts); `id` is what is stored with a patch, so an
// id never changes. Each in its heaviest weight: thin strokes don't stitch.
export const TEXT_FONTS: readonly TextFont[] = [
	{ id: 'anton', family: 'Anton', weight: 400, cat: 'baton' },
	{ id: 'bebas', family: 'Bebas Neue', weight: 400, cat: 'baton' },
	{ id: 'oswald', family: 'Oswald', weight: 700, cat: 'baton' },
	{ id: 'montserrat', family: 'Montserrat', weight: 900, cat: 'baton' },
	{ id: 'poppins', family: 'Poppins', weight: 900, cat: 'baton' },
	{ id: 'archivo', family: 'Archivo Black', weight: 400, cat: 'baton' },
	{ id: 'russo', family: 'Russo One', weight: 400, cat: 'baton' },
	{ id: 'fjalla', family: 'Fjalla One', weight: 400, cat: 'baton' },
	{ id: 'staatliches', family: 'Staatliches', weight: 400, cat: 'baton' },
	{ id: 'squada', family: 'Squada One', weight: 400, cat: 'baton' },
	{ id: 'passion', family: 'Passion One', weight: 900, cat: 'baton' },
	{ id: 'changa', family: 'Changa One', weight: 400, cat: 'baton' },
	{ id: 'fugaz', family: 'Fugaz One', weight: 400, cat: 'baton' },
	{ id: 'fredoka', family: 'Fredoka', weight: 700, cat: 'arrondie' },
	{ id: 'nunito', family: 'Nunito', weight: 900, cat: 'arrondie' },
	{ id: 'rubik', family: 'Rubik', weight: 900, cat: 'arrondie' },
	{ id: 'baloo', family: 'Baloo 2', weight: 800, cat: 'arrondie' },
	{ id: 'lilita', family: 'Lilita One', weight: 400, cat: 'arrondie' },
	{ id: 'titan', family: 'Titan One', weight: 400, cat: 'arrondie' },
	{ id: 'concert', family: 'Concert One', weight: 400, cat: 'arrondie' },
	{ id: 'cherrybomb', family: 'Cherry Bomb One', weight: 400, cat: 'arrondie' },
	{ id: 'paytone', family: 'Paytone One', weight: 400, cat: 'arrondie' },
	{ id: 'righteous', family: 'Righteous', weight: 400, cat: 'arrondie' },
	{ id: 'alfa', family: 'Alfa Slab One', weight: 400, cat: 'serif' },
	{ id: 'robotoslab', family: 'Roboto Slab', weight: 900, cat: 'serif' },
	{ id: 'arvo', family: 'Arvo', weight: 700, cat: 'serif' },
	{ id: 'bree', family: 'Bree Serif', weight: 400, cat: 'serif' },
	{ id: 'ultra', family: 'Ultra', weight: 400, cat: 'serif' },
	{ id: 'abril', family: 'Abril Fatface', weight: 400, cat: 'serif' },
	{ id: 'playfair', family: 'Playfair Display', weight: 900, cat: 'serif' },
	{ id: 'cinzel', family: 'Cinzel', weight: 900, cat: 'serif' },
	{ id: 'bevan', family: 'Bevan', weight: 400, cat: 'serif' },
	{ id: 'holtwood', family: 'Holtwood One SC', weight: 400, cat: 'serif' },
	{ id: 'graduate', family: 'Graduate', weight: 400, cat: 'serif' },
	{ id: 'rye', family: 'Rye', weight: 400, cat: 'serif' },
	{ id: 'pacifico', family: 'Pacifico', weight: 400, cat: 'script' },
	{ id: 'lobster', family: 'Lobster', weight: 400, cat: 'script' },
	{ id: 'kaushan', family: 'Kaushan Script', weight: 400, cat: 'script' },
	{ id: 'yellowtail', family: 'Yellowtail', weight: 400, cat: 'script' },
	{ id: 'dancing', family: 'Dancing Script', weight: 700, cat: 'script' },
	{ id: 'courgette', family: 'Courgette', weight: 400, cat: 'script' },
	{ id: 'shrikhand', family: 'Shrikhand', weight: 400, cat: 'script' },
	{ id: 'caveat', family: 'Caveat Brush', weight: 400, cat: 'script' },
	{ id: 'marker', family: 'Permanent Marker', weight: 400, cat: 'script' },
	{ id: 'bungee', family: 'Bungee', weight: 400, cat: 'fantaisie' },
	{ id: 'luckiest', family: 'Luckiest Guy', weight: 400, cat: 'fantaisie' },
	{ id: 'chewy', family: 'Chewy', weight: 400, cat: 'fantaisie' },
	{ id: 'bangers', family: 'Bangers', weight: 400, cat: 'fantaisie' },
	{ id: 'blackops', family: 'Black Ops One', weight: 400, cat: 'fantaisie' },
	{ id: 'knewave', family: 'Knewave', weight: 400, cat: 'fantaisie' },
	{ id: 'sigmar', family: 'Sigmar One', weight: 400, cat: 'fantaisie' },
	{ id: 'bowlby', family: 'Bowlby One SC', weight: 400, cat: 'fantaisie' },
	{ id: 'carter', family: 'Carter One', weight: 400, cat: 'fantaisie' },
	{ id: 'creepster', family: 'Creepster', weight: 400, cat: 'fantaisie' },
	{ id: 'pixel', family: 'Press Start 2P', weight: 400, cat: 'fantaisie' }
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
	// A small picture next to the text (the picture itself is the patch's
	// stored source image).
	picture?: TextPicture;
};

export type PicturePosition = 'below' | 'above' | 'left' | 'right';
export type TextPicture = {
	position: PicturePosition;
	scale: number; // picture height, in heights of the text block
	colors: number; // thread colours for the picture (1..6)
	removeBackground: boolean;
};

export const DEFAULT_PICTURE: TextPicture = { position: 'below', scale: 1.2, colors: 3, removeBackground: true };
export const PICTURE_SCALE = { min: 0.4, max: 3 } as const;

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
		align: t.align === 'left' || t.align === 'right' ? t.align : 'center',
		...(t.picture && typeof t.picture === 'object' ? { picture: parsePicture(t.picture as Record<string, unknown>) } : {})
	};
}

function parsePicture(p: Record<string, unknown>): TextPicture {
	const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
	return {
		position: (['below', 'above', 'left', 'right'] as const).find((x) => x === p.position) ?? DEFAULT_PICTURE.position,
		scale: num(p.scale, PICTURE_SCALE.min, PICTURE_SCALE.max, DEFAULT_PICTURE.scale),
		colors: Math.round(num(p.colors, 1, 6, DEFAULT_PICTURE.colors)),
		removeBackground: p.removeBackground !== false
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

// The picture's background made transparent: the colour along its edges,
// flood-filled from the edges (so the same colour enclosed in the subject,
// like the white of an eye, stays), then cropped to what is left.
export function cutBackground(src: HTMLCanvasElement): HTMLCanvasElement {
	const w = src.width;
	const h = src.height;
	const img = src.getContext('2d')!.getImageData(0, 0, w, h);
	const d = img.data;
	let r = 0;
	let g = 0;
	let b = 0;
	let n = 0;
	const border: number[] = [];
	for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
	for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
	for (const i of border) {
		if (d[i * 4 + 3] < 128) continue;
		r += d[i * 4];
		g += d[i * 4 + 1];
		b += d[i * 4 + 2];
		n++;
	}
	if (n) {
		const bg = [r / n, g / n, b / n];
		const isBg = (i: number) => d[i * 4 + 3] < 128 || Math.hypot(d[i * 4] - bg[0], d[i * 4 + 1] - bg[1], d[i * 4 + 2] - bg[2]) < 60;
		const seen = new Uint8Array(w * h);
		const stack = border.filter(isBg);
		for (const i of stack) seen[i] = 1;
		while (stack.length) {
			const i = stack.pop()!;
			d[i * 4 + 3] = 0;
			const x = i % w;
			for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
				if (j < 0 || j >= w * h || seen[j] || !isBg(j)) continue;
				seen[j] = 1;
				stack.push(j);
			}
		}
	}
	// Crop to the opaque pixels.
	let x0 = w;
	let y0 = h;
	let x1 = -1;
	let y1 = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (d[(y * w + x) * 4 + 3] < 128) continue;
			x0 = Math.min(x0, x);
			y0 = Math.min(y0, y);
			x1 = Math.max(x1, x);
			y1 = Math.max(y1, y);
		}
	}
	const out = document.createElement('canvas');
	if (x1 < 0) return out; // nothing left
	out.width = x1 - x0 + 1;
	out.height = y1 - y0 + 1;
	const tmp = document.createElement('canvas');
	tmp.width = w;
	tmp.height = h;
	tmp.getContext('2d')!.putImageData(img, 0, 0);
	out.getContext('2d')!.drawImage(tmp, -x0, -y0);
	return out;
}

// The text and the picture side by side (or one above the other), centred
// on each other, on a transparent canvas.
export function composeWithPicture(textCanvas: HTMLCanvasElement | null, picture: HTMLCanvasElement, p: TextPicture): HTMLCanvasElement | null {
	const pic = p.removeBackground ? cutBackground(picture) : picture;
	if (!pic.width || !pic.height) return textCanvas;
	if (!textCanvas) return pic;
	const ph = Math.max(1, Math.round(textCanvas.height * p.scale));
	const pw = Math.max(1, Math.round((pic.width * ph) / pic.height));
	const gap = Math.round(FONT_PX * 0.15);
	const vertical = p.position === 'below' || p.position === 'above';
	const w = vertical ? Math.max(textCanvas.width, pw) : textCanvas.width + gap + pw;
	const h = vertical ? textCanvas.height + gap + ph : Math.max(textCanvas.height, ph);
	const out = document.createElement('canvas');
	out.width = w;
	out.height = h;
	const ctx = out.getContext('2d')!;
	const tPos = {
		below: [(w - textCanvas.width) / 2, 0],
		above: [(w - textCanvas.width) / 2, ph + gap],
		left: [pw + gap, (h - textCanvas.height) / 2],
		right: [0, (h - textCanvas.height) / 2]
	}[p.position];
	const pPos = {
		below: [(w - pw) / 2, textCanvas.height + gap],
		above: [(w - pw) / 2, 0],
		left: [0, (h - ph) / 2],
		right: [textCanvas.width + gap, (h - ph) / 2]
	}[p.position];
	ctx.drawImage(textCanvas, tPos[0], tPos[1]);
	ctx.drawImage(pic, pPos[0], pPos[1], pw, ph);
	return out;
}

// Thread colours used by the text: what digitize() should keep apart.
export const textColorCount = (t: TextSettings) => (t.outline !== 'none' && t.outlineThread !== t.thread ? 2 : 1);
