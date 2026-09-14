import type { ProjectStatus, Craft, PieceStatus } from '$lib/server/db/schema';
import { t, type Locale } from '$lib/i18n';

export const STATUS_ORDER: ProjectStatus[] = ['idee', 'monte', 'bloque', 'fini'];
export function statusLabel(locale: Locale, status: ProjectStatus): string {
	return t(locale, `status.${status}`);
}

export const CRAFTS: Craft[] = ['couture', 'tricot', 'crochet'];
export function craftLabel(locale: Locale, craft: Craft): string {
	return t(locale, `craft.${craft}`);
}

// Couture piece progress: cutting/sewing stage.
export const PIECE_STATUS_ORDER: PieceStatus[] = ['a_couper', 'coupe', 'cousu', 'fini'];
export function pieceStatusLabel(locale: Locale, status: PieceStatus): string {
	return t(locale, `pieceStatus.${status}`);
}

// Yarn weight categories (Craft Yarn Council standard) — codes are locale-invariant.
export const YARN_WEIGHTS = [
	'lace',
	'fingering',
	'sport',
	'dk',
	'worsted',
	'aran',
	'bulky',
	'super-bulky'
];

// Color name -> representative hex, FR+EN. Used both for client-side stash
// search (name/hex -> nearest colorHex) and server-side color guessing from
// scraped product text (lib/server/ai/product-lookup.ts).
export const COLOR_NAMES: Record<string, string> = {
	rouge: '#e63946', red: '#e63946',
	bleu: '#1d3557', blue: '#1d3557',
	vert: '#2a9d8f', green: '#2a9d8f',
	jaune: '#ffd60a', yellow: '#ffd60a',
	noir: '#000000', black: '#000000',
	blanc: '#ffffff', white: '#ffffff',
	gris: '#808080', grey: '#808080', gray: '#808080',
	marron: '#8b4513', brown: '#8b4513',
	rose: '#ffc0cb', pink: '#ffc0cb',
	orange: '#ffa500',
	violet: '#8a2be2', purple: '#8a2be2', mauve: '#8a2be2',
	beige: '#f5f5dc',
	turquoise: '#40e0d0',
	bordeaux: '#800020', maroon: '#800020',
	kaki: '#78866b', khaki: '#78866b',
	corail: '#ff7f50', coral: '#ff7f50',
	ivoire: '#fffff0', ivory: '#fffff0',
	moutarde: '#ffdb58', mustard: '#ffdb58',
	taupe: '#483c32',
	naturel: '#f0e6d2', natural: '#f0e6d2', ecru: '#f0e6d2'
};

// Yarn/fabric print pattern — codes are locale-invariant, labels via motif.<code>.
export const MOTIF_VALUES = [
	'solid',
	'stripes',
	'floral',
	'dots',
	'chevron',
	'plaid',
	'jacquard',
	'animal',
	'geometric',
	'print',
	'other'
];
export function motifLabel(locale: Locale, value: string): string {
	return t(locale, `motif.${value}`);
}

export const TOOL_TYPE_VALUES = [
	'aiguille_droite',
	'aiguille_circulaire',
	'aiguille_double_pointe',
	'crochet',
	'autre'
];
export function toolTypeLabel(locale: Locale, value: string): string {
	return t(locale, `tool.${value}`);
}
export function toolTypeOptions(locale: Locale): { value: string; label: string }[] {
	return TOOL_TYPE_VALUES.map((value) => ({ value, label: toolTypeLabel(locale, value) }));
}

export function difficultyLabel(locale: Locale, level: number): string {
	return t(locale, `difficulty.${level}`);
}
