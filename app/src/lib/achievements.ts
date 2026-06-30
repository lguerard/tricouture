// Achievement presentation metadata — safe client-side (no DB access).
export type Tier = 'bronze' | 'argent' | 'or' | 'platine';

export const TIER_POINTS: Record<Tier, number> = {
	bronze: 10,
	argent: 25,
	or: 50,
	platine: 100
};

export const TIER_LABEL: Record<Tier, string> = {
	bronze: 'Bronze',
	argent: 'Argent',
	or: 'Or',
	platine: 'Platine'
};

export const TIER_COLOR: Record<Tier, string> = {
	bronze: '#a9712f',
	argent: '#8a8f98',
	or: '#c9a227',
	platine: '#5bb6c9'
};
