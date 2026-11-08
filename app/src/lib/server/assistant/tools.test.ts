import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const { runTool, describeContext, TOOLS, TOOL_NAMES, toolsFor, preopenDomains, DOMAINS, capResult, patternExcerpt, TOOL_RESULT_CHARS } = await import('./tools');
const T = await import('./testing');

const now = new Date('2026-10-25T10:00:00Z');
const call = (name: string, args: unknown) => ({ function: { name, arguments: args as Record<string, unknown> } });

function env(uid = T.ALICE, answers: Record<string, unknown> = {}) {
	const f = T.fakeData();
	const a = T.fakeActions(answers);
	return { f, a, env: { uid, data: f.data, act: a.act, now, domains: new Set<string>() } };
}

describe('tool definitions', () => {
	it('declares every tool as an Ollama function with an object schema', () => {
		const names = TOOLS.map((t) => t.function.name);
		expect(names).toEqual(
			expect.arrayContaining(['chercher_patrons', 'lire_patron', 'chercher_laines', 'lire_projet', 'projets_en_cours', 'calculer_jauge', 'estimer_metrage', 'ajouter_note_projet', 'ouvrir_outils'])
		);
		for (const t of toolsFor(Object.keys(DOMAINS))) expect(t.function.parameters.type).toBe('object');
	});

	it('has a label in the chat for every tool', async () => {
		const { dict } = await import('$lib/i18n/dict');
		for (const name of TOOL_NAMES) {
			expect(dict.fr[`chat.tool.${name}`], name).toBeTruthy();
			expect(dict.en[`chat.tool.${name}`], name).toBeTruthy();
		}
	});

	it('sends only the base tools until a group is opened', () => {
		const base = TOOLS.map((t) => t.function.name);
		expect(base).not.toContain('gerer_stock');
		expect(toolsFor(['stock']).map((t) => t.function.name)).toEqual([...base, 'chercher_stock', 'gerer_stock']);
		// "partager" belongs to two groups but is sent once.
		const both = toolsFor(['patrons', 'projets']).map((t) => t.function.name);
		expect(both.filter((n) => n === 'partager')).toHaveLength(1);
	});

	it('opens groups the question needs only when it asks to act', () => {
		expect([...preopenDomains('Ajoute 3 pelotes de Drops à mon stock')]).toEqual(['stock']);
		expect([...preopenDomains('Passe mon projet en terminé')]).toEqual(['projets']);
		expect([...preopenDomains('Quelle laine pour ce patron ?')]).toEqual([]);
		expect([...preopenDomains('Change le titre', 'pattern')]).toEqual(['patrons']);
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
		expect(ok.action).toEqual({ kind: 'note_added', what: 'project', title: 'Mon pull', href: `/projects/${T.ALICE_PROJECT}` });
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

describe('ouvrir_outils', () => {
	it('opens groups for the rest of the turn, and refuses unknown ones', async () => {
		const { env: e } = env();
		const r = await runTool(call('ouvrir_outils', { domaine: 'Stock, organisation' }), e);
		expect(JSON.parse(r.content).outils).toEqual(expect.arrayContaining(['gerer_stock', 'objectifs']));
		expect([...e.domains]).toEqual(['stock', 'organisation']);
		expect((await runTool(call('ouvrir_outils', { domaine: 'cuisine' }), e)).content).toContain('domaine inconnu');
	});
});

describe('pattern tools', () => {
	it('edit my own pattern only, merging tags', async () => {
		const { f, a, env: e } = env();
		const r = await runTool(call('modifier_patron', { id: T.ALICE_PATTERN, createur: 'PetiteKnit', difficulte: '3', ajouter_tags: 'raglan, Hiver', retirer_tags: ['HIVER'], texte: 'Dos : 100 m' }), e);
		expect(r.error).toBeFalsy();
		expect(f.patterns[0]).toMatchObject({ designer: 'PetiteKnit', difficulty: 3, tags: ['raglan', 'Hiver'] });
		expect(a.called('editPatternText')[0].args).toEqual([T.ALICE_PATTERN, { text: 'Dos : 100 m' }]);
		expect(r.action).toEqual({ kind: 'updated', what: 'pattern', title: 'Pull Aran', href: `/patterns/${T.ALICE_PATTERN}` });

		expect((await runTool(call('modifier_patron', { id: T.BOB_PUBLIC_PATTERN, titre: 'Volé' }), e)).content).toContain('seul·e');
		expect((await runTool(call('modifier_patron', { id: T.BOB_PATTERN, titre: 'Volé' }), e)).content).toContain('introuvable');
		expect(f.patterns.map((p) => p.title)).not.toContain('Volé');
		expect((await runTool(call('modifier_patron', { id: T.ALICE_PATTERN }), e)).content).toContain('rien à modifier');
	});

	it('create a pattern, with a written text, checking the craft', async () => {
		const { a, env: e } = env(T.ALICE, { createPattern: 'p-new' });
		const r = await runTool(call('creer_patron', { titre: 'Bonnet côtes', technique: 'Tricot', texte: 'Monter 96 m...', tags: 'bonnet, côtes' }), e);
		expect(a.called('createPattern')[0].args[1]).toMatchObject({ title: 'Bonnet côtes', craft: 'tricot', text: 'Monter 96 m...', tags: ['bonnet', 'côtes'] });
		expect(r.action).toMatchObject({ kind: 'created', what: 'pattern', href: '/patterns/p-new' });
		expect((await runTool(call('creer_patron', { titre: 'X', technique: 'macramé' }), e)).content).toContain('tricot');
	});

	it('delete only after an explicit confirmation, and only my own', async () => {
		const { a, env: e } = env();
		const ask = await runTool(call('supprimer_patron', { id: T.ALICE_PATTERN }), e);
		expect(JSON.parse(ask.content).confirmation_requise).toContain('Pull Aran');
		expect(a.called('deletePattern')).toHaveLength(0);
		const r = await runTool(call('supprimer_patron', { id: T.ALICE_PATTERN, confirme: true }), e);
		expect(r.action?.kind).toBe('deleted');
		expect(a.called('deletePattern')).toHaveLength(1);
		expect((await runTool(call('supprimer_patron', { id: T.BOB_PUBLIC_PATTERN, confirme: true }), e)).error).toBe(true);
		expect(a.called('deletePattern')).toHaveLength(1);
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

	it('manage pieces by name', async () => {
		const pieces = [{ id: 'pc1', name: 'Dos', rows: 120, quantity: null }];
		const { a, env: e } = env(T.ALICE, { listPieces: pieces });
		await runTool(call('pieces_patron', { id: T.ALICE_PATTERN, action: 'modifier', nom: 'dos', rangs: 130 }), e);
		expect(a.called('updatePiece')[0].args).toEqual(['pc1', { defaultTotalRows: 130 }]);
		expect((await runTool(call('pieces_patron', { id: T.ALICE_PATTERN, action: 'retirer', nom: 'Manche' }), e)).content).toContain('introuvable');
	});
});

describe('project tools', () => {
	it('edit a project where I may, with French statuses and a row step', async () => {
		const { f, a, env: e } = env();
		const r = await runTool(call('modifier_projet', { id: T.ALICE_PROJECT, statut: 'Terminé', rangs_en_plus: 3, echeance: '2026-12-24', temps_min: 45 }), e);
		expect(JSON.parse(r.content)).toMatchObject({ statut: 'terminé', rang: 45, echeance: '2026-12-24', temps_ajoute_min: 45 });
		expect(a.called('editProject')[0].args).toEqual([T.ALICE_PROJECT, { status: 'fini', currentRow: 45, deadline: '2026-12-24', addMinutes: 45 }]);
		expect((await runTool(call('modifier_projet', { id: T.ALICE_PROJECT, statut: 'perdu' }), e)).content).toContain('statut');
		expect((await runTool(call('modifier_projet', { id: T.ALICE_PROJECT, echeance: 'Noël' }), e)).content).toContain('AAAA-MM-JJ');

		expect((await runTool(call('modifier_projet', { id: T.BOB_PROJECT, rang_actuel: 1 }), e)).content).toContain('introuvable');
		f.shares.push({ type: 'project', id: T.BOB_PROJECT, userId: T.ALICE, role: 'view' });
		expect((await runTool(call('modifier_projet', { id: T.BOB_PROJECT, rang_actuel: 1 }), e)).content).toContain('lecture seule');
		f.shares[0].role = 'edit';
		expect((await runTool(call('modifier_projet', { id: T.BOB_PROJECT, rang_actuel: 1 }), e)).error).toBeFalsy();
		// Deleting stays the owner's.
		expect((await runTool(call('supprimer_projet', { id: T.BOB_PROJECT, confirme: true }), e)).content).toContain('propriétaire');
	});

	it('create a project from a visible pattern, titled after it by default', async () => {
		const { a, env: e } = env(T.ALICE, { createProject: 'prj-new' });
		const r = await runTool(call('creer_projet', { patron_id: T.BOB_PUBLIC_PATTERN, statut: 'en cours' }), e);
		expect(r.error).toBeFalsy();
		expect(a.called('createProject')[0].args).toEqual([T.ALICE, { title: 'Bonnet public', patternId: T.BOB_PUBLIC_PATTERN, status: 'monte', deadline: undefined }]);
		expect(r.action).toMatchObject({ kind: 'created', what: 'project', href: '/projects/prj-new' });
		expect((await runTool(call('creer_projet', { titre: 'X', patron_id: T.BOB_PATTERN }), e)).content).toContain('introuvable');
	});

	it('log yarn used from my own stash', async () => {
		const { a, env: e } = env(T.ALICE, { useYarn: (_u: string, _p: string, y: string) => y === T.ALICE_YARN });
		const ok = await runTool(call('matiere_projet', { id: T.ALICE_PROJECT, action: 'utiliser', laine_id: T.ALICE_YARN, quantite: 1.5 }), e);
		expect(JSON.parse(ok.content)).toMatchObject({ pelotes_utilisees: 1.5, stock: 'déduit' });
		expect(a.called('useYarn')[0].args).toEqual([T.ALICE, T.ALICE_PROJECT, T.ALICE_YARN, 1.5]);
		expect((await runTool(call('matiere_projet', { id: T.ALICE_PROJECT, action: 'utiliser', laine_id: T.BOB_YARN, quantite: 1 }), e)).error).toBe(true);
	});

	it('find projects by title, any status', async () => {
		const { env: e } = env();
		const found = JSON.parse((await runTool(call('projets_en_cours', { texte: 'pull' }), e)).content);
		expect(found.projets.map((p: { titre: string }) => p.titre)).toEqual(['Mon pull']);
	});
});

describe('stash and organisation tools', () => {
	it('add, edit and delete stash items, mapping French fields', async () => {
		const item = { id: T.ALICE_YARN, kind: 'laine', label: 'Drops Merino', details: { skeins: 4 } };
		const { a, env: e } = env(T.ALICE, { addStock: item, updateStock: (_u: string, _k: string, id: string) => (id === T.ALICE_YARN ? item : null), getStock: item });
		await runTool(call('gerer_stock', { action: 'ajouter', type: 'laine', marque: 'Drops', nom: 'Merino', pelotes: 4, couleur_hex: '#112233' }), e);
		expect(a.called('addStock')[0].args).toEqual([T.ALICE, 'laine', { brand: 'Drops', name: 'Merino', skeins: 4, colorHex: '#112233' }]);
		await runTool(call('gerer_stock', { action: 'ajouter', type: 'outil', type_article: 'aiguille circulaire', taille_mm: 4 }), e);
		expect(a.called('addStock')[1].args[2]).toEqual({ type: 'aiguille_circulaire', sizeMm: 4 });
		expect((await runTool(call('gerer_stock', { action: 'ajouter', type: 'outil' }), e)).content).toContain('type_article');

		expect((await runTool(call('gerer_stock', { action: 'modifier', type: 'laine', id: T.BOB_YARN, pelotes: 0 }), e)).content).toContain('introuvable');
		const del = await runTool(call('gerer_stock', { action: 'supprimer', type: 'laine', id: T.ALICE_YARN }), e);
		expect(del.content).toContain('confirmation_requise');
		expect(a.called('deleteStock')).toHaveLength(0);
	});

	it('share only my own things, with a clear answer for ambiguous names', async () => {
		const { a, env: e } = env(T.ALICE, { findPerson: (_u: string, who: string) => (who === 'Cam' ? 'ambiguous' : { id: 'u-bob', name: 'Bob' }) });
		expect((await runTool(call('partager', { type: 'projet', id: T.ALICE_PROJECT, action: 'modification', personne: 'Cam' }), e)).content).toContain('plusieurs');
		const ok = await runTool(call('partager', { type: 'projet', id: T.ALICE_PROJECT, action: 'modification', personne: 'bob' }), e);
		expect(ok.error).toBeFalsy();
		expect(a.called('share')[0].args.slice(1)).toEqual([{ id: 'u-bob', name: 'Bob' }, 'edit']);
		expect((await runTool(call('partager', { type: 'patron', id: T.BOB_PUBLIC_PATTERN, action: 'lecture', personne: 'bob' }), e)).content).toContain('propriétaire');
	});

	it('step a goal and refuse a bad colour', async () => {
		const { a, env: e } = env(T.ALICE, { stepGoal: { title: '12 pulls', current: 3, target: 12 } });
		const r = await runTool(call('objectifs', { action: 'avancer', id: T.ALICE_PROJECT }), e);
		expect(JSON.parse(r.content)).toMatchObject({ objectif: '12 pulls', actuel: 3 });
		expect(a.called('stepGoal')[0].args).toEqual([T.ALICE, T.ALICE_PROJECT, 1]);
		expect((await runTool(call('couleur_tag', { tag: 'hiver', couleur: 'bleu' }), e)).content).toContain('#RRGGBB');
	});
});
