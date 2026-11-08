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
			expect.arrayContaining(['chercher_patrons', 'lire_patron', 'chercher_laines', 'lire_projet', 'projets_en_cours', 'calculer_jauge', 'estimer_metrage', 'ajouter_note_projet', 'modifier_patron', 'chercher_couvertures', 'modifier_projet', 'creer_projet', 'modifier_laine'])
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

describe('write tools', () => {
	it('edit my own pattern only, merging tags', async () => {
		const { f, env: e } = env();
		const r = await runTool(call('modifier_patron', { id: T.ALICE_PATTERN, createur: 'PetiteKnit', difficulte: '3', ajouter_tags: 'raglan, Hiver', retirer_tags: ['HIVER'] }), e);
		expect(r.error).toBeFalsy();
		expect(f.patterns[0]).toMatchObject({ designer: 'PetiteKnit', difficulty: 3, tags: ['raglan', 'Hiver'] });
		expect(r.action).toEqual({ kind: 'pattern_updated', title: 'Pull Aran', href: `/patterns/${T.ALICE_PATTERN}` });

		const pub = await runTool(call('modifier_patron', { id: T.BOB_PUBLIC_PATTERN, titre: 'Volé' }), e);
		expect(pub.content).toContain('seul·e');
		expect((await runTool(call('modifier_patron', { id: T.BOB_PATTERN, titre: 'Volé' }), e)).content).toContain('introuvable');
		expect(f.patterns.map((p) => p.title)).not.toContain('Volé');
		expect((await runTool(call('modifier_patron', { id: T.ALICE_PATTERN }), e)).content).toContain('rien à modifier');
	});

	it('find covers for my patterns without one, a few per call', async () => {
		const { f, env: e } = env();
		f.covers.push(T.ALICE_PATTERN);
		const r = await runTool(call('chercher_couvertures', {}), e);
		expect(JSON.parse(r.content)).toEqual({ trouvees: ['Pull Aran'] });
		expect(r.action).toMatchObject({ kind: 'cover_found', title: 'Pull Aran' });
		expect(f.patterns[0].coverPath).toBeTruthy();
		expect(JSON.parse((await runTool(call('chercher_couvertures', {}), e)).content).note).toContain('déjà');
		expect((await runTool(call('chercher_couvertures', { id: T.BOB_PUBLIC_PATTERN }), e)).error).toBe(true);
	});

	it('edit a project where I may, with French statuses', async () => {
		const { f, env: e } = env();
		const r = await runTool(call('modifier_projet', { id: T.ALICE_PROJECT, statut: 'Terminé', rang_actuel: 120, echeance: '2026-12-24' }), e);
		expect(JSON.parse(r.content)).toMatchObject({ statut: 'terminé', rang: 120, echeance: '2026-12-24' });
		expect(f.projects[0]).toMatchObject({ status: 'fini', currentRow: 120, deadline: '2026-12-24' });
		expect((await runTool(call('modifier_projet', { id: T.ALICE_PROJECT, statut: 'perdu' }), e)).content).toContain('statut');
		expect((await runTool(call('modifier_projet', { id: T.ALICE_PROJECT, echeance: 'Noël' }), e)).content).toContain('AAAA-MM-JJ');

		expect((await runTool(call('modifier_projet', { id: T.BOB_PROJECT, rang_actuel: 1 }), e)).content).toContain('introuvable');
		f.shares.push({ type: 'project', id: T.BOB_PROJECT, userId: T.ALICE, role: 'view' });
		expect((await runTool(call('modifier_projet', { id: T.BOB_PROJECT, rang_actuel: 1 }), e)).content).toContain('lecture seule');
		f.shares[0].role = 'edit';
		expect((await runTool(call('modifier_projet', { id: T.BOB_PROJECT, rang_actuel: 1 }), e)).error).toBeFalsy();
	});

	it('create a project from a visible pattern, titled after it by default', async () => {
		const { f, env: e } = env();
		const r = await runTool(call('creer_projet', { titre: '', patron_id: T.BOB_PUBLIC_PATTERN, statut: 'en cours' }), e);
		expect(r.error).toBeFalsy();
		expect(f.projects.at(-1)).toMatchObject({ ownerId: T.ALICE, title: 'Bonnet public', patternId: T.BOB_PUBLIC_PATTERN, status: 'monte' });
		expect(r.action?.kind).toBe('project_created');
		expect((await runTool(call('creer_projet', { titre: 'X', patron_id: T.BOB_PATTERN }), e)).content).toContain('introuvable');
		expect(f.projects).toHaveLength(3);
	});

	it('change skeins of my own yarn only, and find projects by title', async () => {
		const { f, env: e } = env();
		const r = await runTool(call('modifier_laine', { id: T.ALICE_YARN, pelotes: 4 }), e);
		expect(JSON.parse(r.content)).toMatchObject({ pelotes_avant: 6, pelotes: 4 });
		expect(f.yarns[0].skeins).toBe(4);
		f.shares.push({ type: 'yarn', id: T.BOB_YARN, userId: T.ALICE, role: 'edit' });
		expect((await runTool(call('modifier_laine', { id: T.BOB_YARN, pelotes: 0 }), e)).error).toBe(true);
		expect(f.yarns[1].skeins).toBe(6);

		const found = JSON.parse((await runTool(call('projets_en_cours', { texte: 'pull' }), e)).content);
		expect(found.projets.map((p: { titre: string }) => p.titre)).toEqual(['Mon pull']);
	});
});
