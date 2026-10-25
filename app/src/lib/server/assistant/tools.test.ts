import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const { runTool, describeContext, TOOLS, capResult, patternExcerpt, TOOL_RESULT_CHARS } = await import('./tools');
const T = await import('./testing');

const now = new Date('2026-10-25T10:00:00Z');
const call = (name: string, args: unknown) => ({ function: { name, arguments: args as Record<string, unknown> } });

function env(uid = T.ALICE) {
	const f = T.fakeData();
	return { f, env: { uid, data: f.data, now } };
}

describe('tool definitions', () => {
	it('declares every tool as an Ollama function with an object schema', () => {
		const names = TOOLS.map((t) => t.function.name);
		expect(names).toEqual(
			expect.arrayContaining(['chercher_patrons', 'lire_patron', 'chercher_laines', 'lire_projet', 'projets_en_cours', 'calculer_jauge', 'estimer_metrage', 'ajouter_note_projet'])
		);
		for (const t of TOOLS) expect(t.function.parameters.type).toBe('object');
	});
});

describe('scoping', () => {
	it('reads my own pattern, a public one, but not someone else\'s private pattern', async () => {
		const { env: e } = env();
		const mine = await runTool(call('lire_patron', { id: T.ALICE_PATTERN }), e);
		expect(mine.error).toBeFalsy();
		expect(JSON.parse(mine.content).titre).toBe('Pull Aran');

		const pub = await runTool(call('lire_patron', { id: T.BOB_PUBLIC_PATTERN }), e);
		expect(pub.error).toBeFalsy();

		const other = await runTool(call('lire_patron', { id: T.BOB_PATTERN }), e);
		expect(other.error).toBe(true);
		expect(other.content).toContain('introuvable');
		expect(other.content).not.toContain('Secret');
		expect(other.refs).toBeUndefined();
	});

	it('opens a private pattern once it is shared with me', async () => {
		const { f, env: e } = env();
		f.shares.push({ type: 'pattern', id: T.BOB_PATTERN, userId: T.ALICE, role: 'view' });
		const r = await runTool(call('lire_patron', { id: T.BOB_PATTERN }), e);
		expect(JSON.parse(r.content).titre).toBe('Secret de Bob');
	});

	it('hides other accounts\' projects and yarns, also as screen context', async () => {
		const { env: e } = env();
		expect((await runTool(call('lire_projet', { id: T.BOB_PROJECT }), e)).error).toBe(true);
		expect(await describeContext({ kind: 'project', id: T.BOB_PROJECT }, e)).toBeNull();
		expect(await describeContext({ kind: 'pattern', id: T.BOB_PATTERN }, e)).toBeNull();
		expect(await describeContext({ kind: 'yarn', id: T.BOB_YARN }, e)).toBeNull();
		const mine = await describeContext({ kind: 'project', id: T.ALICE_PROJECT, row: 43 }, e);
		expect(mine?.text).toContain('rang 43');
		expect(mine?.text).toContain('Mon pull');
	});

	it('only appends a note where the account may edit, and reports the action', async () => {
		const { f, env: e } = env();
		const denied = await runTool(call('ajouter_note_projet', { id: T.BOB_PROJECT, texte: 'coucou' }), e);
		expect(denied.error).toBe(true);
		f.shares.push({ type: 'project', id: T.BOB_PROJECT, userId: T.ALICE, role: 'view' });
		const readOnly = await runTool(call('ajouter_note_projet', { id: T.BOB_PROJECT, texte: 'coucou' }), e);
		expect(readOnly.content).toContain('lecture seule');
		expect(f.notes).toEqual([]);

		const ok = await runTool(call('ajouter_note_projet', { id: T.ALICE_PROJECT, texte: 'Changé d\'aiguilles : 4 mm' }), e);
		expect(ok.action).toEqual({ kind: 'note_added', title: 'Mon pull', href: `/projects/${T.ALICE_PROJECT}` });
		expect(f.notes).toEqual([{ id: T.ALICE_PROJECT, note: '[2026-10-25] Changé d\'aiguilles : 4 mm' }]);
	});
});

describe('argument validation', () => {
	it('answers the model with an error instead of throwing', async () => {
		const { env: e } = env();
		const cases: [string, unknown, string][] = [
			['lire_patron', {}, 'manquant'],
			['lire_patron', { id: 'pull-aran' }, 'identifiant invalide'],
			['chercher_patrons', { texte: '   ' }, 'manquant'],
			['calculer_jauge', { mailles_10cm: 'beaucoup' }, 'nombre'],
			['calculer_jauge', { mailles_10cm: 22 }, 'rien à calculer'],
			['estimer_metrage', { largeur_cm: 50, hauteur_cm: 60 }, 'metres_echantillon'],
			['outil_bidon', {}, 'outil inconnu'],
			['lire_patron', '{pas du json', 'illisibles'],
			['lire_patron', [1, 2], 'objet JSON']
		];
		for (const [name, args, expected] of cases) {
			const r = await runTool(call(name, args), e);
			expect(r.error, name).toBe(true);
			expect(JSON.parse(r.content).erreur, `${name} ${JSON.stringify(args)}`).toContain(expected);
		}
	});

	it('accepts arguments as a JSON string and numbers as strings', async () => {
		const { env: e } = env();
		const r = await runTool(call('calculer_jauge', '{"mailles_10cm":"20","largeur_cm":"50,5","cible_mailles_10cm":22}'), e);
		expect(JSON.parse(r.content)).toEqual({ mailles: 101, mailles_cible: 111 });
		const m = await runTool(call('estimer_metrage', { largeur_cm: 50, hauteur_cm: 60, nombre_pieces: 2, metres_echantillon: 5, metres_par_pelote: 100 }), e);
		expect(JSON.parse(m.content)).toEqual({ surface_cm2: 6000, metres: 330, pelotes: 4 });
	});
});

describe('results', () => {
	it('are capped', () => {
		expect(capResult('x'.repeat(10_000)).length).toBeLessThanOrEqual(TOOL_RESULT_CHARS);
		expect(capResult({ a: 1 })).toBe('{"a":1}');
	});

	it('read the requested section of a pattern, accent-insensitive', () => {
		const text = `${'intro '.repeat(400)}EMPIÈCEMENT : augmenter 8 m tous les 2 rangs. ${'suite '.repeat(400)}`;
		const r = patternExcerpt(text, 'empiecement', 300);
		expect(r.trouve).toBe(true);
		expect(r.texte).toContain('EMPIÈCEMENT : augmenter');
		expect(r.texte!.length).toBeLessThanOrEqual(302);
		expect(patternExcerpt(text, 'les manches', 100).trouve).toBe(false);
	});

	it('list my yarns with totals and give cards', async () => {
		const { env: e } = env();
		const r = await runTool(call('chercher_laines', { couleur: 'bleu' }), e);
		expect(JSON.parse(r.content).resultats).toEqual([
			expect.objectContaining({ id: T.ALICE_YARN, nom: 'Drops Merino Extra Fine', pelotes: 6, metres_total: 660 })
		]);
		expect(r.refs?.[0]).toMatchObject({ kind: 'yarn', title: 'Drops Merino Extra Fine' });
	});

	it('give the row counter of a project', async () => {
		const { env: e } = env();
		const r = JSON.parse((await runTool(call('lire_projet', { id: T.ALICE_PROJECT }), e)).content);
		expect(r).toMatchObject({ titre: 'Mon pull', statut: 'en cours', rang_actuel: 42, rangs_total: 120 });
		expect(r.pieces[0]).toEqual({ nom: 'Dos', rang: 42, rangs_total: 120 });
	});
});
