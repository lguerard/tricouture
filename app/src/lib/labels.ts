import type { ProjectStatus, Craft } from '$lib/server/db/schema';

export const STATUS_LABELS: Record<ProjectStatus, string> = {
	idee: 'Idée / Queue',
	monte: 'En cours',
	bloque: 'Bloqué / Détricoté',
	fini: 'Terminé'
};

export const STATUS_ORDER: ProjectStatus[] = ['idee', 'monte', 'bloque', 'fini'];

export const CRAFT_LABELS: Record<Craft, string> = {
	couture: 'Couture',
	tricot: 'Tricot',
	crochet: 'Crochet'
};

export const CRAFTS: Craft[] = ['couture', 'tricot', 'crochet'];

// Yarn weight categories (Craft Yarn Council standard).
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

export const TOOL_TYPES: { value: string; label: string }[] = [
	{ value: 'aiguille_droite', label: 'Aiguilles droites' },
	{ value: 'aiguille_circulaire', label: 'Aiguilles circulaires' },
	{ value: 'aiguille_double_pointe', label: 'Aiguilles double-pointe' },
	{ value: 'crochet', label: 'Crochet' },
	{ value: 'autre', label: 'Autre' }
];

export const TOOL_TYPE_LABELS: Record<string, string> = Object.fromEntries(
	TOOL_TYPES.map((t) => [t.value, t.label])
);

export const DIFFICULTY_LABELS: Record<number, string> = {
	1: 'Débutant',
	2: 'Facile',
	3: 'Intermédiaire',
	4: 'Avancé',
	5: 'Expert'
};
