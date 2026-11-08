// Tool group "patrons": create, import, edit, delete and share patterns,
// their cover and their pieces, and the AI helpers of the pattern page.
import { AiUnavailable } from '$lib/server/ai/ollama';
import { normalizeInfoLanguage } from '$lib/server/ai/patternInfo';
import type { Craft } from '$lib/server/db/schema';
import type { PatternPatch, PatternRecord } from '../data';
import {
	actions,
	ArgError,
	bool,
	canSeePattern,
	compact,
	CONFIRM_PARAM,
	COVERS_PER_CALL,
	done,
	fold,
	id,
	list,
	needsConfirmation,
	NOT_FOUND,
	num,
	oneOf,
	p,
	patternRef,
	str,
	type Args,
	type ToolEnv,
	type ToolOutcome,
	type ToolSpec
} from '../toolkit';

const CRAFTS = ['tricot', 'crochet', 'couture'] as const;
const TEXT_MAX = 20_000;

// The pattern, when it is this account's own; else what to answer the model.
export async function ownPattern(env: ToolEnv, a: Args, key = 'id'): Promise<PatternRecord | ToolOutcome> {
	const pat = await env.data.getPattern(id(a, key));
	if (!pat || !(await canSeePattern(env, pat))) return NOT_FOUND('Patron');
	if (pat.ownerId !== env.uid) {
		return { content: JSON.stringify({ erreur: 'seul·e la personne qui a ajouté ce patron peut le modifier' }), error: true };
	}
	return pat;
}

const isOutcome = (x: unknown): x is ToolOutcome => !!x && typeof x === 'object' && 'content' in x;

const updated = (pat: { id: string; title: string }, result: Record<string, unknown>, refs?: ToolOutcome['refs']) =>
	done({ patron: pat.title, ...result }, { kind: 'updated', what: 'pattern', title: pat.title, href: `/patterns/${pat.id}` }, refs);

const aiDown = (): ToolOutcome => ({ content: JSON.stringify({ erreur: "l'IA d'analyse n'est pas disponible pour le moment" }), error: true });

export const PATTERN_TOOLS: Record<string, ToolSpec> = {
	creer_patron: {
		description:
			"Crée un patron. 'texte' peut contenir un patron complet que tu as rédigé (il sera lisible et cherchable comme un PDF). Uniquement à la demande de la personne.",
		parameters: {
			titre: p('string', 'titre'),
			technique: p('string', '"tricot", "crochet" ou "couture"'),
			createur: p('string', 'créateur·rice'),
			type: p('string', 'type de vêtement'),
			lien: p('string', 'lien web du patron'),
			texte: p('string', 'texte complet du patron'),
			notes: p('string', 'notes'),
			tags: p('string', 'tags séparés par des virgules')
		},
		required: ['titre', 'technique'],
		async run(a, env) {
			const title = str(a, 'titre', 255, true)!;
			const pid = await actions(env).createPattern(env.uid, {
				title,
				craft: oneOf(a, 'technique', CRAFTS, true)! as Craft,
				designer: str(a, 'createur', 160),
				garmentType: str(a, 'type', 120),
				source: str(a, 'lien', 255),
				text: str(a, 'texte', TEXT_MAX),
				notes: str(a, 'notes', 4_000),
				tags: list(a, 'tags')
			});
			return done({ id: pid, patron: title }, { kind: 'created', what: 'pattern', title, href: `/patterns/${pid}` });
		}
	},

	importer_patron_lien: {
		description: "Ajoute un patron à partir de son lien web (Ravelry, boutique...) : titre et créateur lus sur la page, puis une couverture cherchée.",
		parameters: { url: p('string', 'lien http(s)'), technique: p('string', '"tricot", "crochet" ou "couture"') },
		required: ['url', 'technique'],
		async run(a, env) {
			const act = actions(env);
			const page = await act.readPatternPage(str(a, 'url', 2_000, true)!);
			if (!page.ok) {
				const why = { 'unsupported-url': 'lien non pris en charge', unreachable: 'page injoignable', 'not-html': "ce n'est pas une page web" }[page.error];
				return { content: JSON.stringify({ erreur: why }), error: true };
			}
			const title = page.title ?? 'Patron';
			const pid = await act.createPattern(env.uid, {
				title,
				craft: oneOf(a, 'technique', CRAFTS, true)! as Craft,
				designer: page.designer ?? undefined,
				source: page.source.slice(0, 255)
			});
			const cover = await env.data.fillCover(env.uid, pid);
			return done(
				compact({ id: pid, patron: title, createur: page.designer, couverture: cover ? 'trouvée' : undefined }),
				{ kind: 'created', what: 'pattern', title, href: `/patterns/${pid}` }
			);
		}
	},

	modifier_patron: {
		description: "Modifie un patron de la personne : seuls les champs donnés changent. Uniquement à sa demande.",
		parameters: {
			id: p('string', 'id du patron'),
			titre: p('string', 'titre'),
			technique: p('string', '"tricot", "crochet" ou "couture"'),
			createur: p('string', 'créateur·rice'),
			type: p('string', 'type de vêtement'),
			langue: p('string', 'langue, ex. "fr"'),
			difficulte: p('number', 'de 1 à 5'),
			tailles: p('string', 'tailles disponibles'),
			mailles_10cm: p('number', 'jauge : mailles pour 10 cm'),
			rangs_10cm: p('number', 'jauge : rangs pour 10 cm'),
			metrage_m: p('number', 'mètres de fil nécessaires'),
			lien: p('string', 'lien web'),
			notes: p('string', 'nouvelles notes (remplacent les anciennes)'),
			texte: p('string', 'nouveau texte du patron (ex. traduit)'),
			ajouter_tags: p('string', 'tags à ajouter, séparés par des virgules'),
			retirer_tags: p('string', 'tags à retirer, séparés par des virgules')
		},
		required: ['id'],
		async run(a, env) {
			const pat = await ownPattern(env, a);
			if (isOutcome(pat)) return pat;
			const patch: PatternPatch = compact({
				title: str(a, 'titre', 255),
				designer: str(a, 'createur', 160),
				garmentType: str(a, 'type', 120),
				difficulty: num(a, 'difficulte', 1, 5),
				sizes: str(a, 'tailles', 500),
				gaugeStitches: num(a, 'mailles_10cm', 1, 100),
				gaugeRows: num(a, 'rangs_10cm', 1, 150),
				yardageRequired: num(a, 'metrage_m', 1, 100_000)
			});
			if (patch.difficulty != null) patch.difficulty = Math.round(patch.difficulty);
			if (patch.yardageRequired != null) patch.yardageRequired = Math.round(patch.yardageRequired);
			const add = list(a, 'ajouter_tags');
			const drop = new Set(list(a, 'retirer_tags').map(fold));
			if (add.length || drop.size) {
				const kept = pat.tags.filter((t) => !drop.has(fold(t)));
				patch.tags = [...kept, ...add.filter((t) => !kept.some((k) => fold(k) === fold(t)))];
			}
			const text = compact({
				craft: oneOf(a, 'technique', CRAFTS) as Craft | undefined,
				language: str(a, 'langue', 16),
				source: str(a, 'lien', 255),
				notes: str(a, 'notes', 4_000),
				text: str(a, 'texte', TEXT_MAX)
			});
			if (!Object.keys(patch).length && !Object.keys(text).length) throw new ArgError('rien à modifier : donne au moins un champ');
			if (Object.keys(patch).length) await env.data.updatePattern(pat.id, patch);
			if (Object.keys(text).length) await actions(env).editPatternText(pat.id, text);
			const now = { ...pat, ...patch };
			return updated(now, { modifie: [...Object.keys(patch), ...Object.keys(text)] }, [patternRef(now)]);
		}
	},

	supprimer_patron: {
		description: 'Supprime définitivement un patron de la personne (fichiers, couverture, pièces).',
		parameters: { id: p('string', 'id du patron'), ...CONFIRM_PARAM },
		required: ['id'],
		async run(a, env) {
			const pat = await ownPattern(env, a);
			if (isOutcome(pat)) return pat;
			const ask = needsConfirmation(a, `le patron « ${pat.title} »`);
			if (ask) return ask;
			await actions(env).deletePattern(pat);
			return done({ supprime: pat.title }, { kind: 'deleted', what: 'pattern', title: pat.title, href: '/patterns' });
		}
	},

	chercher_couvertures: {
		description:
			"Trouve une image de couverture pour un patron qui n'en a pas (sa première image, sinon une recherche web sur créateur + titre). Sans id : les patrons de la personne sans couverture, quelques-uns par appel. Ne dessine pas d'image.",
		parameters: { id: p('string', 'id du patron (facultatif)') },
		async run(a, env) {
			let targets: { id: string; title: string }[];
			let total: number;
			if (a.id != null && a.id !== '') {
				const pat = await ownPattern(env, a);
				if (isOutcome(pat)) return pat;
				if (pat.coverPath) return { content: JSON.stringify({ ok: true, patron: pat.title, note: 'ce patron a déjà une couverture' }) };
				targets = [{ id: pat.id, title: pat.title }];
				total = 1;
			} else {
				({ items: targets, total } = await env.data.missingCovers(env.uid, COVERS_PER_CALL));
				if (!total) return { content: JSON.stringify({ ok: true, note: 'tous les patrons ont déjà une couverture' }) };
			}
			const found: string[] = [];
			const missed: string[] = [];
			let firstId = '';
			for (const t of targets) {
				if (await env.data.fillCover(env.uid, t.id)) {
					found.push(t.title);
					firstId ||= t.id;
				} else missed.push(t.title);
			}
			const content = JSON.stringify(
				compact({
					trouvees: found,
					sans_resultat: missed,
					restants: total - targets.length || undefined,
					conseil: missed.length ? 'sans résultat : renseigner le créateur aide la recherche ; on peut aussi donner un lien d’image (couverture_patron)' : undefined
				})
			);
			if (!found.length) return { content };
			const title = found.length > 1 ? `${found.length} patrons` : found[0];
			return { content, action: { kind: 'cover_found', what: 'pattern', title, href: found.length > 1 ? '/patterns' : `/patterns/${firstId}` } };
		}
	},

	couverture_patron: {
		description: "Met comme couverture d'un patron l'image d'un lien (image ou page web), ou retire la couverture.",
		parameters: { id: p('string', 'id du patron'), url: p('string', "lien de l'image ou de la page"), retirer: p('boolean', 'true pour retirer la couverture') },
		required: ['id'],
		async run(a, env) {
			const pat = await ownPattern(env, a);
			if (isOutcome(pat)) return pat;
			if (bool(a, 'retirer')) {
				await actions(env).removeCover(pat);
				return updated(pat, { couverture: 'retirée' });
			}
			const url = str(a, 'url', 2_000, true)!;
			if (!(await actions(env).setCoverFromUrl(env.uid, pat, url))) {
				return { content: JSON.stringify({ erreur: "aucune image utilisable à ce lien" }), error: true };
			}
			return done({ patron: pat.title, couverture: 'changée' }, { kind: 'cover_found', what: 'pattern', title: pat.title, href: `/patterns/${pat.id}` });
		}
	},

	pieces_patron: {
		description:
			"Pièces d'un patron (Dos, Devant, Manche...) : lister, ajouter, modifier (rangs, quantité, nom), retirer, ou detecter (l'IA les lit dans le texte du patron).",
		parameters: {
			id: p('string', 'id du patron'),
			action: p('string', '"lister", "ajouter", "modifier", "retirer" ou "detecter"'),
			nom: p('string', 'nom de la pièce'),
			nouveau_nom: p('string', 'nouveau nom (modifier)'),
			rangs: p('number', 'nombre de rangs (tricot/crochet)'),
			quantite: p('number', 'nombre à couper (couture)')
		},
		required: ['id', 'action'],
		async run(a, env) {
			const action = oneOf(a, 'action', ['lister', 'ajouter', 'modifier', 'retirer', 'detecter'] as const, true)!;
			const act = actions(env);
			if (action === 'lister') {
				const pat = await env.data.getPattern(id(a));
				if (!pat || !(await canSeePattern(env, pat))) return NOT_FOUND('Patron');
				const pieces = await act.listPieces(pat.id);
				return { content: JSON.stringify({ patron: pat.title, pieces: pieces.map((x) => compact({ nom: x.name, rangs: x.rows, quantite: x.quantity })) }) };
			}
			const pat = await ownPattern(env, a);
			if (isOutcome(pat)) return pat;
			if (action === 'detecter') {
				let found;
				try {
					found = await act.detectPieces(pat);
				} catch (e) {
					if (e instanceof AiUnavailable) return aiDown();
					throw e;
				}
				if (found === 'no-text') return { content: JSON.stringify({ erreur: "ce patron n'a pas de texte à analyser (pas de PDF lisible)" }), error: true };
				if (found === 'empty') return { content: JSON.stringify({ erreur: 'aucune pièce trouvée dans le texte' }), error: true };
				return updated(pat, { pieces: found.map((x) => compact({ nom: x.name, rangs: x.defaultTotalRows, quantite: x.quantity })) });
			}
			const name = str(a, 'nom', 120, true)!;
			const rows = num(a, 'rangs', 0, 100_000);
			const qty = num(a, 'quantite', 0, 1_000);
			if (action === 'ajouter') {
				await act.addPiece(pat.id, name, rows != null ? Math.round(rows) || null : null, qty != null ? Math.round(qty) || null : null);
				return updated(pat, { piece_ajoutee: name });
			}
			const piece = (await act.listPieces(pat.id)).find((x) => fold(x.name) === fold(name));
			if (!piece) return { content: JSON.stringify({ erreur: `pièce "${name}" introuvable sur ce patron` }), error: true };
			if (action === 'retirer') {
				await act.removePiece(piece.id);
				return updated(pat, { piece_retiree: piece.name });
			}
			const patch = compact({
				name: str(a, 'nouveau_nom', 120),
				defaultTotalRows: rows != null ? Math.round(rows) || null : undefined,
				quantity: qty != null ? Math.round(qty) || null : undefined
			});
			if (!Object.keys(patch).length) throw new ArgError('rien à modifier : donne rangs, quantite ou nouveau_nom');
			await act.updatePiece(piece.id, patch);
			return updated(pat, { piece: piece.name, ...patch });
		}
	},

	remplir_infos_patron: {
		description: "L'IA lit le texte du patron et remplit ses infos vides (type, créateur, tailles, jauge, métrage, tags).",
		parameters: { id: p('string', 'id du patron'), langue: p('string', '"fr" ou "en" pour les tags') },
		required: ['id'],
		async run(a, env) {
			const pat = await ownPattern(env, a);
			if (isOutcome(pat)) return pat;
			let filled;
			try {
				filled = await actions(env).fillPatternInfo(env.uid, pat.id, normalizeInfoLanguage(a.langue));
			} catch (e) {
				if (e instanceof AiUnavailable) return aiDown();
				throw e;
			}
			if (!filled || !Object.keys(filled.updates).length) return { content: JSON.stringify({ ok: true, note: 'rien de nouveau trouvé dans le texte' }) };
			return updated(pat, { rempli: filled.updates });
		}
	}
};
