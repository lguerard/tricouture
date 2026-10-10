// Checks the metadata the patch editor sends with a design (no database or
// file access here, so it can be unit-tested on its own).
import type { EmbroiderySettings } from '$lib/server/db/schema';

const SHAPES = ['none', 'circle', 'rounded'] as const;
const DENSITIES = ['light', 'normal', 'dense'] as const;

const isThread = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 64;
const clamp = (v: unknown, lo: number, hi: number, dflt: number) =>
	typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;

export type DesignMeta = {
	title: string;
	settings: EmbroiderySettings;
	threads: number[];
	widthMm: number;
	heightMm: number;
	stitchCount: number;
};

// Checks the JSON the editor sends along with the files; null when unusable.
export function parseMeta(raw: unknown): DesignMeta | null {
	let m: Record<string, unknown>;
	try {
		m = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
	} catch {
		return null;
	}
	if (!m || typeof m !== 'object') return null;
	const s = (m.settings ?? {}) as Record<string, unknown>;
	const threads = Array.isArray(m.threads) ? m.threads : [];
	if (!threads.length || threads.length > 64 || !threads.every(isThread)) return null;
	const swaps: Record<string, number> = {};
	if (s.swaps && typeof s.swaps === 'object') {
		for (const [k, v] of Object.entries(s.swaps as Record<string, unknown>)) if (isThread(Number(k)) && isThread(v)) swaps[k] = v;
	}
	const title = (typeof m.title === 'string' ? m.title : '').trim().slice(0, 200) || 'Écusson';
	return {
		title,
		settings: {
			sizeMm: clamp(s.sizeMm, 10, 100, 70),
			colors: Math.round(clamp(s.colors, 1, 8, 4)),
			removeBackground: s.removeBackground !== false,
			shape: SHAPES.includes(s.shape as never) ? (s.shape as EmbroiderySettings['shape']) : 'circle',
			borderThread: isThread(s.borderThread) ? s.borderThread : 20,
			backgroundThread: isThread(s.backgroundThread) ? s.backgroundThread : 0,
			density: DENSITIES.includes(s.density as never) ? (s.density as EmbroiderySettings['density']) : 'normal',
			fabric: typeof s.fabric === 'string' && /^#[0-9a-f]{6}$/i.test(s.fabric) ? s.fabric : '#f3efe7',
			swaps
		},
		threads,
		widthMm: clamp(m.widthMm, 0, 100, 0),
		heightMm: clamp(m.heightMm, 0, 100, 0),
		stitchCount: Math.round(clamp(m.stitchCount, 0, 1_000_000, 0))
	};
}

