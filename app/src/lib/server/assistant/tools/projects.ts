// Tool group "projets": create, edit and delete projects, their pieces, the
// yarn and fabric they use (deducted from the stash), and sharing.
import { canEdit } from '$lib/server/access';
import { isUuid } from '$lib/uuid';
import type { ProjectRecord } from '../data';
import type { ProjectEdit } from '../actions';
import {
	actions,
	ArgError,
	canSeePattern,
	compact,
	CONFIRM_PARAM,
	date,
	done,
	fold,
	id,
	needsConfirmation,
	NOT_FOUND,
	num,
	oneOf,
	p,
	projectAccess,
	READ_ONLY,
	status,
	STATUS_FR,
	str,
	type Args,
	type ToolEnv,
	type ToolOutcome,
	type ToolSpec
} from '../toolkit';

const isOutcome = (x: unknown): x is ToolOutcome => !!x && typeof x === 'object' && 'content' in x;

// The project when this account may change it (owner, or shared in "edit").
async function editableProject(env: ToolEnv, a: Args): Promise<ProjectRecord | ToolOutcome> {
	const prj = await env.data.getProject(id(a));
	const access = prj ? await projectAccess(env, prj) : null;
	if (!prj || !access) return NOT_FOUND('Projet');
	if (!canEdit(access)) return READ_ONLY('Ce projet');
	return prj;
}

const updated = (prj: { id: string; title: string }, result: Record<string, unknown>) =>
	done({ projet: prj.title, ...result }, { kind: 'updated', what: 'project', title: prj.title, href: `/projects/${prj.id}` });

const cents = (eur: number | undefined) => (eur == null ? undefined : Math.round(eur * 100));

export const PROJECT_TOOLS: Record<string, ToolSpec> = {
	creer_projet: {
		description: "Crée un projet, éventuellement à partir d'un patron (id de chercher_patrons). Uniquement à la demande de la personne.",
		parameters: {
			titre: p('string', 'titre (par défaut celui du patron)'),
			patron_id: p('string', 'id du patron (facultatif)'),
			statut: p('string', '"idée" (par défaut), "en cours", "en pause" ou "terminé"'),
			echeance: p('string', 'date AAAA-MM-JJ')
		},
		async run(a, env) {
			let patternId: string | null = null;
			let title = str(a, 'titre', 255);
			if (a.patron_id != null && a.patron_id !== '') {
				const pat = await env.data.getPattern(id(a, 'patron_id'));
				if (!pat || !(await canSeePattern(env, pat))) return NOT_FOUND('Patron');
				patternId = pat.id;
				title ??= pat.title;
			}
			if (!title) throw new ArgError('argument "titre" manquant');
			const st = status(a) ?? 'idee';
			const pid = await actions(env).createProject(env.uid, { title, patternId, status: st, deadline: date(a, 'echeance') });
			return done({ id: pid, projet: title, statut: STATUS_FR[st] }, { kind: 'created', what: 'project', title, href: `/projects/${pid}` });
		}
	},

	modifier_projet: {
		description:
			"Modifie un projet : titre, statut, compteur de rangs (valeur ou rangs_en_plus), rangs totaux, avancement, échéance, emplacement, coût, destinataire, temps passé. Uniquement à la demande de la personne.",
		parameters: {
			id: p('string', 'id du projet'),
			titre: p('string', 'titre'),
			statut: p('string', '"idée", "en cours", "en pause" ou "terminé"'),
			rang_actuel: p('number', 'nouvelle valeur du compteur'),
			rangs_en_plus: p('number', 'rangs à ajouter au compteur (négatif pour retirer)'),
			rangs_total: p('number', 'nombre total de rangs'),
			avancement_pct: p('number', 'avancement en % (0-100)'),
			echeance: p('string', 'date AAAA-MM-JJ, ou "aucune"'),
			emplacement: p('string', 'où le projet est rangé'),
			cout_eur: p('number', 'coût des matières en euros'),
			prix_magasin_eur: p('number', 'prix équivalent en magasin, en euros'),
			destinataire_id: p('string', 'id du destinataire (outil destinataires)'),
			temps_min: p('number', 'minutes de travail à ajouter'),
			rangs_faits: p('number', 'rangs faits pendant ce temps')
		},
		required: ['id'],
		async run(a, env) {
			const prj = await editableProject(env, a);
			if (isOutcome(prj)) return prj;
			const delta = num(a, 'rangs_en_plus', -100_000, 100_000);
			const row = num(a, 'rang_actuel', 0, 1_000_000);
			const recipient = str(a, 'destinataire_id', 64);
			if (recipient && (!isUuid(recipient) || !(await actions(env).ownsRecipient(env.uid, recipient)))) return NOT_FOUND('Destinataire');
			const edit: ProjectEdit = compact({
				title: str(a, 'titre', 255),
				status: status(a),
				currentRow: row != null ? Math.round(row) : delta != null ? Math.max(0, prj.currentRow + Math.round(delta)) : undefined,
				totalRows: num(a, 'rangs_total', 1, 1_000_000),
				progressPct: num(a, 'avancement_pct', 0, 100),
				location: str(a, 'emplacement', 160),
				costCents: cents(num(a, 'cout_eur', 0, 1_000_000)),
				retailPriceCents: cents(num(a, 'prix_magasin_eur', 0, 1_000_000)),
				recipientId: recipient,
				addMinutes: num(a, 'temps_min', 1, 100_000),
				rowsDone: num(a, 'rangs_faits', 0, 100_000)
			});
			const deadline = date(a, 'echeance');
			if (deadline !== undefined) edit.deadline = deadline;
			for (const k of ['totalRows', 'progressPct', 'addMinutes', 'rowsDone'] as const) if (edit[k] != null) edit[k] = Math.round(edit[k]!);
			if (!Object.keys(edit).length) throw new ArgError('rien à modifier : donne au moins un champ');
			await actions(env).editProject(prj.id, edit);
			return updated(
				{ id: prj.id, title: edit.title ?? prj.title },
				compact({
					statut: edit.status && STATUS_FR[edit.status],
					rang: edit.currentRow,
					rangs_total: edit.totalRows,
					echeance: edit.deadline,
					temps_ajoute_min: edit.addMinutes,
					modifie: Object.keys(edit)
				})
			);
		}
	},

	supprimer_projet: {
		description: 'Supprime définitivement un projet de la personne (photos et suivi compris).',
		parameters: { id: p('string', 'id du projet'), ...CONFIRM_PARAM },
		required: ['id'],
		async run(a, env) {
			const prj = await env.data.getProject(id(a));
			const access = prj ? await projectAccess(env, prj) : null;
			if (!prj || !access) return NOT_FOUND('Projet');
			if (access !== 'owner') return { content: JSON.stringify({ erreur: 'seul·e la propriétaire du projet peut le supprimer' }), error: true };
			const ask = needsConfirmation(a, `le projet « ${prj.title} »`);
			if (ask) return ask;
			await actions(env).deleteProject(prj.id);
			return done({ supprime: prj.title }, { kind: 'deleted', what: 'project', title: prj.title, href: '/projects/board' });
		}
	},

	matiere_projet: {
		description:
			"Note la laine (pelotes) ou le tissu (cm) utilisés par un projet : c'est déduit du stock. 'rendre' annule et remet tout dans le stock.",
		parameters: {
			id: p('string', 'id du projet'),
			action: p('string', '"utiliser" ou "rendre"'),
			laine_id: p('string', 'id de la laine (chercher_laines)'),
			tissu_id: p('string', 'id du tissu (chercher_stock)'),
			quantite: p('number', 'pelotes de laine, ou cm de tissu')
		},
		required: ['id', 'action'],
		async run(a, env) {
			const prj = await editableProject(env, a);
			if (isOutcome(prj)) return prj;
			const action = oneOf(a, 'action', ['utiliser', 'rendre'] as const, true)!;
			const yarnId = a.laine_id ? id(a, 'laine_id') : undefined;
			const fabricId = !yarnId && a.tissu_id ? id(a, 'tissu_id') : undefined;
			if (!yarnId && !fabricId) throw new ArgError('donne laine_id ou tissu_id');
			const act = actions(env);
			let ok: boolean;
			if (action === 'utiliser') {
				const qty = num(a, 'quantite', 0.01, 100_000, true)!;
				ok = yarnId ? await act.useYarn(env.uid, prj.id, yarnId, qty) : await act.useFabric(env.uid, prj.id, fabricId!, Math.round(qty));
				if (!ok) return NOT_FOUND(yarnId ? 'Laine (dans ton stock)' : 'Tissu (dans ton stock)');
				return updated(prj, { [yarnId ? 'pelotes_utilisees' : 'cm_utilises']: qty, stock: 'déduit' });
			}
			ok = yarnId ? await act.returnYarn(env.uid, prj.id, yarnId) : await act.returnFabric(env.uid, prj.id, fabricId!);
			if (!ok) return { content: JSON.stringify({ erreur: "rien n'était noté pour cette matière sur ce projet" }), error: true };
			return updated(prj, { stock: 'remis' });
		}
	},

	piece_projet: {
		description:
			"Suivi d'une pièce du patron dans un projet : finie / a_faire, rangs_en_plus, rangs_total, ou etape (couture : a_couper, coupe, cousu, fini).",
		parameters: {
			id: p('string', 'id du projet'),
			piece: p('string', 'nom de la pièce, ex. "Dos"'),
			action: p('string', '"finie", "a_faire", "rangs_en_plus", "rangs_total" ou "etape"'),
			valeur: p('number', 'nombre de rangs (rangs_en_plus, rangs_total)'),
			etape: p('string', '"a_couper", "coupe", "cousu" ou "fini"')
		},
		required: ['id', 'piece', 'action'],
		async run(a, env) {
			const prj = await editableProject(env, a);
			if (isOutcome(prj)) return prj;
			if (!prj.patternId) return { content: JSON.stringify({ erreur: "ce projet n'est lié à aucun patron, donc n'a pas de pièces" }), error: true };
			const name = str(a, 'piece', 120, true)!;
			const act = actions(env);
			const piece = (await act.listPieces(prj.patternId)).find((x) => fold(x.name) === fold(name));
			if (!piece) return { content: JSON.stringify({ erreur: `pièce "${name}" introuvable (vois lire_projet)` }), error: true };
			const action = oneOf(a, 'action', ['finie', 'a_faire', 'rangs_en_plus', 'rangs_total', 'etape'] as const, true)!;
			if (action === 'finie' || action === 'a_faire') await act.setPieceCompleted(prj.id, piece.id, action === 'finie');
			else if (action === 'rangs_en_plus') await act.stepPieceRow(prj.id, piece.id, Math.round(num(a, 'valeur', -100_000, 100_000, true)!));
			else if (action === 'rangs_total') await act.setPieceProgress(prj.id, piece.id, { totalRows: Math.round(num(a, 'valeur', 0, 1_000_000, true)!) || null });
			else await act.setPieceProgress(prj.id, piece.id, { status: oneOf(a, 'etape', ['a_couper', 'coupe', 'cousu', 'fini'] as const, true)! });
			return updated(prj, { piece: piece.name, action });
		}
	}
};

