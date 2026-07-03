import type { ProjectStatus, Craft } from '$lib/server/db/schema';
import { t, type Locale } from '$lib/i18n';

export const STATUS_ORDER: ProjectStatus[] = ['idee', 'monte', 'bloque', 'fini'];
export function statusLabel(locale: Locale, status: ProjectStatus): string {
	return t(locale, `status.${status}`);
}

export const CRAFTS: Craft[] = ['couture', 'tricot', 'crochet'];
export function craftLabel(locale: Locale, craft: Craft): string {
	return t(locale, `craft.${craft}`);
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
