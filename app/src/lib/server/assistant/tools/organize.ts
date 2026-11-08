// Tool group "organisation": goals, storage bins, recipients, mood boards,
// patches (Écussons), tag colours, and the year's figures. One tool per page,
// each with an "action" argument: fewer tool definitions in the context.
import { readableFg } from '$lib/tagColor';
import {
	actions,
	ArgError,
	clip,
	compact,
	CONFIRM_PARAM,
	date,
	done,
	id,
	list,
	needsConfirmation,
	NOT_FOUND,
	num,
	oneOf,
	p,
	str,
	type ToolSpec
} from '../toolkit';

const GOAL_KINDS = ['projets_an', 'stash_busting', 'defi_mensuel', 'autre'] as const;

export const ORGANIZE_TOOLS: Record<string, ToolSpec> = {
	objectifs: {
		description: "Objectifs de la personne (ex. 12 pulls cette année) : lister, creer, avancer (de +1 ou d'un nombre), supprimer.",
		parameters: {
			action: p('string', '"lister", "creer", "avancer" ou "supprimer"'),
			id: p('string', "id de l'objectif"),
			titre: p('string', 'titre (creer)'),
			cible: p('number', 'valeur à atteindre (creer)'),
			pas: p('number', 'de combien avancer, négatif pour reculer (1 par défaut)'),
			type: p('string', '"projets_an", "stash_busting", "defi_mensuel" ou "autre"'),
			debut: p('string', 'date AAAA-MM-JJ'),
			fin: p('string', 'date AAAA-MM-JJ'),
			...CONFIRM_PARAM
		},
		required: ['action'],
		async run(a, env) {
			const act = actions(env);
			const action = oneOf(a, 'action', ['lister', 'creer', 'avancer', 'supprimer'] as const, true)!;
			const href = '/goals';
			if (action === 'lister') {
				const rows = await act.listGoals(env.uid);
				return { content: JSON.stringify({ objectifs: rows.map((g) => compact({ id: g.id, titre: g.title, type: g.kind, actuel: g.current, cible: g.target, debut: g.start, fin: g.end })) }) };
			}
			if (action === 'creer') {
				const title = str(a, 'titre', 200, true)!;
				await act.createGoal(env.uid, {
					title,
					kind: oneOf(a, 'type', GOAL_KINDS) ?? 'projets_an',
					target: Math.round(num(a, 'cible', 1, 100_000) ?? 1),
					start: date(a, 'debut') ?? null,
					end: date(a, 'fin') ?? null
				});
				return done({ objectif: title }, { kind: 'created', what: 'goal', title, href });
			}
			if (action === 'avancer') {
				const g = await act.stepGoal(env.uid, id(a), Math.round(num(a, 'pas', -100_000, 100_000) ?? 1));
				if (!g) return NOT_FOUND('Objectif');
				return done({ objectif: g.title, actuel: g.current, cible: g.target }, { kind: 'updated', what: 'goal', title: g.title, href });
			}
			const gid = id(a);
			const goal = (await act.listGoals(env.uid)).find((g) => g.id === gid);
			if (!goal) return NOT_FOUND('Objectif');
			const ask = needsConfirmation(a, `l'objectif « ${goal.title} »`);
			if (ask) return ask;
			await act.deleteGoal(env.uid, gid);
			return done({ supprime: goal.title }, { kind: 'deleted', what: 'goal', title: goal.title, href });
		}
	},

	rangements: {
		description: 'Rangements (boîtes, étagères, avec QR code) : lister, creer, supprimer. Pour y ranger un article : gerer_stock avec rangement_id.',
		parameters: {
			action: p('string', '"lister", "creer" ou "supprimer"'),
			id: p('string', 'id du rangement'),
			nom: p('string', 'nom (creer)'),
			lieu: p('string', 'où il se trouve'),
			...CONFIRM_PARAM
		},
		required: ['action'],
		async run(a, env) {
			const act = actions(env);
			const action = oneOf(a, 'action', ['lister', 'creer', 'supprimer'] as const, true)!;
			if (action === 'lister') {
				const rows = await act.listBins(env.uid);
				return { content: JSON.stringify({ rangements: rows.map((b) => compact({ id: b.id, nom: b.label, lieu: b.location })) }) };
			}
			if (action === 'creer') {
				const label = str(a, 'nom', 160, true)!;
				const bid = await act.createBin(env.uid, label, str(a, 'lieu', 160) ?? null);
				return done({ id: bid, rangement: label }, { kind: 'created', what: 'bin', title: label, href: '/bins' });
			}
			const bid = id(a);
			const bin = (await act.listBins(env.uid)).find((b) => b.id === bid);
			if (!bin) return NOT_FOUND('Rangement');
			const ask = needsConfirmation(a, `le rangement « ${bin.label} » (les articles restent dans le stock)`);
			if (ask) return ask;
			await act.deleteBin(env.uid, bid);
			return done({ supprime: bin.label }, { kind: 'deleted', what: 'bin', title: bin.label, href: '/bins' });
		}
	},

	destinataires: {
		description: 'Personnes pour qui la personne tricote ou coud (couleurs préférées, allergies) : lister, creer, modifier, supprimer.',
		parameters: {
			action: p('string', '"lister", "creer", "modifier" ou "supprimer"'),
			id: p('string', 'id du destinataire'),
			nom: p('string', 'nom'),
			couleurs: p('string', 'couleurs préférées, séparées par des virgules'),
			allergies: p('string', 'fibres à éviter'),
			notes: p('string', 'notes (mensurations, goûts...)'),
			...CONFIRM_PARAM
		},
		required: ['action'],
		async run(a, env) {
			const act = actions(env);
			const action = oneOf(a, 'action', ['lister', 'creer', 'modifier', 'supprimer'] as const, true)!;
			const href = '/recipients';
			if (action === 'lister') {
				const rows = await act.listRecipients(env.uid);
				return {
					content: JSON.stringify({
						destinataires: rows.map((r) => compact({ id: r.id, nom: r.name, couleurs: r.colors, allergies: r.allergies, notes: clip(r.notes, 200) }))
					})
				};
			}
			if (action === 'creer') {
				const name = str(a, 'nom', 120, true)!;
				await act.createRecipient(env.uid, { name, colors: list(a, 'couleurs'), allergies: str(a, 'allergies', 500) ?? null, notes: str(a, 'notes', 2_000) ?? null });
				return done({ destinataire: name }, { kind: 'created', what: 'recipient', title: name, href });
			}
			const rid = id(a);
			if (action === 'modifier') {
				const patch = compact({
					name: str(a, 'nom', 120),
					favoriteColors: a.couleurs != null ? list(a, 'couleurs') : undefined,
					fiberAllergies: str(a, 'allergies', 500),
					notes: str(a, 'notes', 2_000)
				});
				if (!Object.keys(patch).length) throw new ArgError('rien à modifier : donne au moins un champ');
				const name = await act.updateRecipient(env.uid, rid, patch);
				if (!name) return NOT_FOUND('Destinataire');
				return done({ destinataire: name }, { kind: 'updated', what: 'recipient', title: name, href });
			}
			const r = (await act.listRecipients(env.uid)).find((x) => x.id === rid);
			if (!r) return NOT_FOUND('Destinataire');
			const ask = needsConfirmation(a, `le destinataire « ${r.name} »`);
			if (ask) return ask;
			await act.deleteRecipient(env.uid, rid);
			return done({ supprime: r.name }, { kind: 'deleted', what: 'recipient', title: r.name, href });
		}
	},

	moodboards: {
		description:
			"Tableaux d'inspiration : lister, voir (ses éléments), creer, renommer, supprimer, ajouter (une note et/ou un lien), retirer_element.",
		parameters: {
			action: p('string', '"lister", "voir", "creer", "renommer", "supprimer", "ajouter" ou "retirer_element"'),
			id: p('string', 'id du tableau'),
			titre: p('string', 'titre (creer, renommer)'),
			note: p('string', 'note à ajouter'),
			lien: p('string', 'lien http(s) à ajouter'),
			element_id: p('string', "id de l'élément à retirer"),
			...CONFIRM_PARAM
		},
		required: ['action'],
		async run(a, env) {
			const act = actions(env);
			const action = oneOf(a, 'action', ['lister', 'voir', 'creer', 'renommer', 'supprimer', 'ajouter', 'retirer_element'] as const, true)!;
			if (action === 'lister') {
				return { content: JSON.stringify({ tableaux: (await act.listBoards(env.uid)).map((b) => ({ id: b.id, titre: b.title, elements: b.items })) }) };
			}
			if (action === 'creer') {
				const title = str(a, 'titre', 200, true)!;
				const bid = await act.createBoard(env.uid, title);
				return done({ id: bid, tableau: title }, { kind: 'created', what: 'moodboard', title, href: `/moodboards/${bid}` });
			}
			const bid = id(a);
			const href = `/moodboards/${bid}`;
			if (action === 'voir') {
				const b = await act.boardItems(env.uid, bid);
				if (!b) return NOT_FOUND('Tableau');
				return {
					content: JSON.stringify({
						tableau: b.title,
						elements: b.items.slice(0, 20).map((i) => compact({ id: i.id, note: clip(i.note, 150), lien: i.url, image: i.image ? 'oui' : undefined, couleurs: i.palette }))
					})
				};
			}
			if (action === 'renommer') {
				const title = await act.renameBoard(env.uid, bid, str(a, 'titre', 200, true)!);
				if (!title) return NOT_FOUND('Tableau');
				return done({ tableau: title }, { kind: 'updated', what: 'moodboard', title, href });
			}
			if (action === 'ajouter') {
				const note = str(a, 'note', 2_000) ?? null;
				const raw = str(a, 'lien', 2_000);
				let url: string | null = null;
				if (raw) {
					try {
						const u = new URL(raw);
						if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
						url = u.href;
					} catch {
						throw new ArgError('argument "lien" : adresse http(s) attendue');
					}
				}
				if (!note && !url) throw new ArgError('donne une note ou un lien');
				const title = await act.addBoardItem(env.uid, bid, { note, url });
				if (!title) return NOT_FOUND('Tableau');
				return done({ tableau: title, ajoute: compact({ note, lien: url }) }, { kind: 'updated', what: 'moodboard', title, href });
			}
			if (action === 'retirer_element') {
				if (!(await act.deleteBoardItem(env.uid, bid, id(a, 'element_id')))) return NOT_FOUND('Élément');
				return done({ retire: true }, { kind: 'updated', what: 'moodboard', title: 'tableau', href });
			}
			const b = await act.boardItems(env.uid, bid);
			if (!b) return NOT_FOUND('Tableau');
			const ask = needsConfirmation(a, `le tableau « ${b.title} » et ses ${b.items.length} éléments`);
			if (ask) return ask;
			await act.deleteBoard(env.uid, bid);
			return done({ supprime: b.title }, { kind: 'deleted', what: 'moodboard', title: b.title, href: '/moodboards' });
		}
	},

	ecussons: {
		description: "Écussons brodés de la bibliothèque (.pes) : lister (ou chercher par nom), renommer, supprimer. Les créer se fait sur la page Écussons, à partir d'une image.",
		parameters: {
			action: p('string', '"lister", "renommer" ou "supprimer"'),
			id: p('string', "id de l'écusson"),
			texte: p('string', 'mot du nom (lister)'),
			titre: p('string', 'nouveau nom'),
			...CONFIRM_PARAM
		},
		required: ['action'],
		async run(a, env) {
			const act = actions(env);
			const action = oneOf(a, 'action', ['lister', 'renommer', 'supprimer'] as const, true)!;
			if (action === 'lister') {
				const rows = await act.listPatches(env.uid, str(a, 'texte', 80));
				return {
					content: JSON.stringify({
						ecussons: rows.map((r) => compact({ id: r.id, nom: r.title, importe: r.source === 'import' || undefined, taille_mm: `${Math.round(r.w)} x ${Math.round(r.h)}`, points: r.stitches }))
					})
				};
			}
			const pid = id(a);
			const href = `/embroidery#design-${pid}`;
			if (action === 'renommer') {
				const title = await act.renamePatch(env.uid, pid, str(a, 'titre', 200, true)!);
				if (!title) return NOT_FOUND('Écusson');
				return done({ ecusson: title }, { kind: 'updated', what: 'patch', title, href });
			}
			const patch = (await act.listPatches(env.uid, undefined)).find((r) => r.id === pid);
			if (!patch) return NOT_FOUND('Écusson');
			const ask = needsConfirmation(a, `l'écusson « ${patch.title} » (image, aperçu et fichier .pes)`);
			if (ask) return ask;
			await act.deletePatch(env.uid, pid);
			return done({ supprime: patch.title }, { kind: 'deleted', what: 'patch', title: patch.title, href: '/embroidery' });
		}
	},

	couleur_tag: {
		description: "Change la couleur d'un tag de patron (#RRGGBB), ou remet la couleur automatique.",
		parameters: { tag: p('string', 'le tag'), couleur: p('string', '#RRGGBB, ou "auto"') },
		required: ['tag', 'couleur'],
		async run(a, env) {
			const tag = str(a, 'tag', 160, true)!;
			const c = str(a, 'couleur', 7, true)!;
			if (/^auto/i.test(c)) {
				await actions(env).setTagColor(env.uid, tag, null);
			} else {
				if (!/^#[0-9a-f]{6}$/i.test(c)) throw new ArgError('argument "couleur" : #RRGGBB ou "auto"');
				await actions(env).setTagColor(env.uid, tag, { bg: c.toLowerCase(), fg: readableFg(c) });
			}
			return done({ tag, couleur: c }, { kind: 'updated', what: 'tag', title: tag, href: '/patterns/tags' });
		}
	},

	bilan: {
		description: "Chiffres de la personne : projets finis cette année et en tout, mètres tricotés, heures, économies, nombre de patrons et laines, succès débloqués.",
		parameters: {},
		async run(_a, env) {
			const act = actions(env);
			const [s, ach] = await Promise.all([act.stats(env.uid), act.achievements(env.uid)]);
			return {
				content: JSON.stringify({
					annee: s.year,
					projets_finis_annee: s.finishedThisYear,
					projets_finis_total: s.finishedLifetime,
					metres_annee: s.metersThisYear,
					heures_annee: s.hoursThisYear,
					economies_annee_eur: s.savingsThisYearEur,
					patrons: s.patternCount,
					laines: s.yarnCount,
					projets_en_cours: s.activeWip,
					succes: `${ach.unlockedCount} / ${ach.totalCount}`,
					points: `${ach.earnedPoints} / ${ach.totalPoints}`,
					derniers_succes: ach.list.filter((x) => x.unlocked).sort((x, y) => +(y.unlockedAt ?? 0) - +(x.unlockedAt ?? 0)).slice(0, 5).map((x) => x.code)
				})
			};
		}
	}
};
