import { describe, expect, it } from 'vitest';
import { addDay } from '$lib/server/advent';
import { yarnWeightCode } from '$lib/labels';

describe('advent yarn in the stash', () => {
	it('lists every day a stash line came from', () => {
		expect(addDay("Calendrier de l'Avent 2026, jour 1", 2026, 6)).toBe("Calendrier de l'Avent 2026, jours 1, 6");
		expect(addDay("Calendrier de l'Avent 2026, jours 1, 6", 2026, 13)).toBe("Calendrier de l'Avent 2026, jours 1, 6, 13");
		expect(addDay("Calendrier de l'Avent 2026, jours 1, 6", 2026, 6)).toBe("Calendrier de l'Avent 2026, jours 1, 6");
	});

	it('keeps her own notes when she edited them', () => {
		expect(addDay("Calendrier de l'Avent 2026, jour 1 — pour le pull", 2026, 6)).toBe("Calendrier de l'Avent 2026, jour 1 — pour le pull · jour 6");
	});

	it('turns a weight typed by hand into the stash code', () => {
		expect(yarnWeightCode('DK')).toBe('dk');
		expect(yarnWeightCode(' Aran ')).toBe('aran');
		expect(yarnWeightCode('Lace')).toBe('lace');
		expect(yarnWeightCode('Super Bulky')).toBe('super-bulky');
		expect(yarnWeightCode('chunky')).toBe('bulky');
		expect(yarnWeightCode('Mohair fin')).toBe('Mohair fin');
		expect(yarnWeightCode('')).toBe('');
	});
});
