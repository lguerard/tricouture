// Small, exact helpers the assistant calls instead of doing arithmetic in its
// head (a 12B model is unreliable at "how many stitches for 47 cm at 22 sts").
// Pure functions; the gauge is always "per 10 cm", as on a ball band and in
// the pattern fields (patterns.gaugeStitches / gaugeRows).

const round1 = (n: number) => Math.round(n * 10) / 10;

export type GaugeInput = {
	stitchesPer10: number;
	rowsPer10?: number;
	// Optional second gauge (the person's own swatch) to convert counts to.
	targetStitchesPer10?: number;
	targetRowsPer10?: number;
	stitches?: number;
	rows?: number;
	widthCm?: number;
	heightCm?: number;
};

export type GaugeResult = {
	// stitches / rows -> centimetres at the pattern gauge
	widthCm?: number;
	heightCm?: number;
	// centimetres -> stitches / rows at the pattern gauge
	stitches?: number;
	rows?: number;
	// the same dimensions at the target gauge (what to cast on with one's own swatch)
	targetStitches?: number;
	targetRows?: number;
};

export function cmToCount(cm: number, per10: number): number {
	return Math.round((cm * per10) / 10);
}

export function countToCm(count: number, per10: number): number {
	return round1((count * 10) / per10);
}

// Same physical size, other gauge: 100 sts at 20 sts/10 cm = 50 cm = 110 sts at 22.
export function convertCount(count: number, fromPer10: number, toPer10: number): number {
	return Math.round((count * toPer10) / fromPer10);
}

export function gaugeCalc(i: GaugeInput): GaugeResult {
	const r: GaugeResult = {};
	// Width: from a stitch count, or from centimetres.
	const width = i.stitches != null ? countToCm(i.stitches, i.stitchesPer10) : i.widthCm;
	if (i.stitches != null) r.widthCm = width;
	if (i.widthCm != null && i.stitches == null) r.stitches = cmToCount(i.widthCm, i.stitchesPer10);
	if (width != null && i.targetStitchesPer10) r.targetStitches = cmToCount(width, i.targetStitchesPer10);

	if (i.rowsPer10) {
		const height = i.rows != null ? countToCm(i.rows, i.rowsPer10) : i.heightCm;
		if (i.rows != null) r.heightCm = height;
		if (i.heightCm != null && i.rows == null) r.rows = cmToCount(i.heightCm, i.rowsPer10);
		if (height != null && i.targetRowsPer10) r.targetRows = cmToCount(height, i.targetRowsPer10);
	}
	return r;
}

export type YardageInput = {
	widthCm: number;
	heightCm: number;
	pieces?: number;
	// Metres of yarn used by a 10 x 10 cm swatch (unravel it, or weigh it).
	swatchMeters: number;
	metersPerSkein?: number;
	marginPct?: number;
};

export type YardageResult = { areaCm2: number; meters: number; skeins?: number };

// Yarn needed for rectangular pieces, from what one 10 x 10 cm swatch eats,
// plus a safety margin (10 % by default: seams, swatch, gauge drift).
export function estimateYardage(i: YardageInput): YardageResult {
	const pieces = i.pieces ?? 1;
	const margin = i.marginPct ?? 10;
	const areaCm2 = Math.round(i.widthCm * i.heightCm * pieces);
	const meters = Math.ceil((areaCm2 / 100) * i.swatchMeters * (1 + margin / 100));
	const r: YardageResult = { areaCm2, meters };
	if (i.metersPerSkein && i.metersPerSkein > 0) r.skeins = Math.ceil(meters / i.metersPerSkein);
	return r;
}
