// Couleurs du site tirées d'une seule couleur (« Couleur au choix », ou
// Material You : la couleur du fond d'écran, donnée par l'app Android).
//
// À la manière de Material 3 : une couleur est décrite en LCh (CIELAB :
// luminance perçue L*, chroma, teinte) ; chaque variable du thème garde la
// teinte et prend une luminance fixe (le « ton » de Material 3 est L*). Les
// tons reprennent ceux de la palette violette d'origine (app.css), pour que
// toute couleur choisie donne le même équilibre, en clair comme en sombre.
// Une couleur hors de l'écran (sRGB) perd du chroma, jamais sa teinte.

type Lch = { l: number; c: number; h: number };

const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
const fInv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

export function parseHex(hex: string): [number, number, number] | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const n = parseInt(m[1], 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: number[]) =>
	'#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

export function hexToLch(hex: string): Lch {
	const rgb = parseHex(hex);
	if (!rgb) throw new Error(`Couleur invalide : ${hex}`);
	const [r, g, b] = rgb.map((v) => toLinear(v / 255));
	const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
	const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
	const fx = f(x / XN), fy = f(y / YN), fz = f(z / ZN);
	const a = 500 * (fx - fy);
	const bb = 200 * (fy - fz);
	const h = (Math.atan2(bb, a) * 180) / Math.PI;
	return { l: 116 * fy - 16, c: Math.hypot(a, bb), h: h < 0 ? h + 360 : h };
}

function lchToRgb(l: number, c: number, h: number): number[] | null {
	const a = c * Math.cos((h * Math.PI) / 180);
	const b = c * Math.sin((h * Math.PI) / 180);
	const fy = (l + 16) / 116;
	const x = XN * fInv(fy + a / 500);
	const y = YN * fInv(fy);
	const z = ZN * fInv(fy - b / 200);
	const rgb = [
		3.2406 * x - 1.5372 * y - 0.4986 * z,
		-0.9689 * x + 1.8758 * y + 0.0415 * z,
		0.0557 * x - 0.204 * y + 1.057 * z
	].map(fromLinear);
	return rgb.every((v) => v >= -0.001 && v <= 1.001) ? rgb : null;
}

/** Couleur de luminance `tone` (0 noir … 100 blanc), de teinte `hue`, au plus `chroma`. */
export function tone(hue: number, chroma: number, t: number): string {
	if (t <= 0) return '#000000';
	if (t >= 100) return '#ffffff';
	for (let c = chroma; c >= 0; c -= 1) {
		const rgb = lchToRgb(t, c, hue);
		if (rgb) return toHex(rgb);
	}
	return toHex(lchToRgb(t, 0, hue) ?? [0, 0, 0]);
}

/** Variables CSS d'app.css que la couleur choisie remplace (les couleurs d'état restent). */
export type ThemeVars = Record<
	'--bg' | '--surface' | '--border' | '--text' | '--muted' | '--accent' | '--accent-soft' | '--on-accent' | '--accent-hover',
	string
>;

export function themeVars(seed: string, dark: boolean): ThemeVars {
	const { c, h } = hexToLch(seed);
	// Une couleur presque grise garde un peu de chroma : le thème ne doit pas
	// devenir entièrement gris.
	const accent = (t: number) => tone(h, Math.max(c, 36), t);
	const neutral = (t: number) => tone(h, 4, t);
	const variant = (t: number) => tone(h, 9, t);
	return dark
		? {
				'--bg': neutral(7), '--surface': neutral(11), '--border': variant(22),
				'--text': neutral(92), '--muted': variant(67),
				'--accent': accent(70), '--accent-soft': accent(18), '--on-accent': accent(8),
				'--accent-hover': accent(77)
			}
		: {
				'--bg': neutral(98), '--surface': '#ffffff', '--border': variant(89),
				'--text': neutral(15), '--muted': variant(50),
				'--accent': accent(40), '--accent-soft': accent(92), '--on-accent': '#ffffff',
				'--accent-hover': accent(33)
			};
}

const block = (vars: ThemeVars) =>
	Object.entries(vars)
		.map(([k, v]) => `${k}:${v}`)
		.join(';');

/**
 * Feuille de style du thème, mêmes cas qu'app.css : clair par défaut,
 * sombre si choisi, ou si le système l'est et que le clair n'est pas imposé.
 * Gardée telle quelle dans localStorage : app.html l'applique avant le
 * premier affichage, sans avoir à refaire ce calcul.
 */
export function themeCss(seed: string): string {
	const light = block(themeVars(seed, false));
	const dark = block(themeVars(seed, true));
	// Préfixe html : plus précis que les règles d'app.css, chargées après.
	return (
		`html:root{${light}}` +
		`html:root[data-theme='dark']{${dark}}` +
		`@media (prefers-color-scheme: dark){html:root:not([data-theme='light']){${dark}}}`
	);
}

/** Couleurs proposées (« Couleur au choix »). La première est le violet d'origine. */
export const THEME_SWATCHES = [
	'#7c4d8b', '#c2185b', '#d32f2f', '#e65100', '#827717',
	'#2e7d32', '#00838f', '#1565c0', '#3949ab', '#6d4c41'
];
