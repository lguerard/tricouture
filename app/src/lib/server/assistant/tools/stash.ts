// Tool group "stock": the four kinds of stash items (yarn, fabric, notions,
// tools), searched, added, edited -- the stash page can only add and delete,
// the assistant can also correct an item or file it in a storage bin -- and
// deleted. The stash is personal: only the account's own items.
import { isUuid } from '$lib/uuid';
import { TOOL_TYPES, type StockFields, type StockItem, type StockKind } from '../actions';
import {
	actions,
	ArgError,
	compact,
	CONFIRM_PARAM,
	done,
	id,
	needsConfirmation,
	NOT_FOUND,
	num,
	oneOf,
	p,
	str,
	type Args,
	type ToolEnv,
	type ToolOutcome,
	type ToolSpec
} from '../toolkit';

const KINDS = ['laine', 'tissu', 'mercerie', 'outil'] as const;
const WHAT = { laine: 'yarn', tissu: 'fabric', mercerie: 'notion', outil: 'tool' } as const;
const TAB = { laine: 'yarn', tissu: 'fabric', mercerie: 'notion', outil: 'tool' } as const;

const hex = (a: Args) => {
	const v = str(a, 'couleur_hex', 7);
	if (v && !/^#[0-9a-f]{6}$/i.test(v)) throw new ArgError('argument "couleur_hex" : couleur #RRGGBB attendue');
	return v;
};
const int = (v: number | undefined) => (v == null ? undefined : Math.round(v));

// The columns to write for `kind`, from the French arguments given.
function fieldsFor(kind: StockKind, a: Args): StockFields[StockKind] {
	const common = { notes: str(a, 'notes', 2_000) };
	switch (kind) {
		case 'laine':
			return compact({
				...common,
				brand: str(a, 'marque', 160),
				name: str(a, 'nom', 160),
				colorway: str(a, 'coloris', 160),
				colorHex: hex(a),
				dyeLot: str(a, 'bain', 80),
				weightCategory: str(a, 'poids', 40),
				fiber: str(a, 'fibre', 160),
				yardsPerSkein: int(num(a, 'metres_par_pelote', 1, 100_000)),
				gramsPerSkein: int(num(a, 'grammes_par_pelote', 1, 10_000)),
				skeins: num(a, 'pelotes', 0, 10_000)
			});
		case 'tissu':
			return compact({
				...common,
				name: str(a, 'nom', 160),
				fabricType: str(a, 'type', 120),
				composition: str(a, 'composition', 160),
				colorHex: hex(a),
				lengthCm: int(num(a, 'longueur_cm', 0, 100_000)),
				widthCm: int(num(a, 'largeur_cm', 0, 1_000))
			});
		case 'mercerie':
			return compact({ ...common, name: str(a, 'nom', 160), category: str(a, 'categorie', 80), quantity: int(num(a, 'quantite', 0, 1_000_000)) });
		case 'outil':
			return compact({
				...common,
				type: oneOf(a, 'type', TOOL_TYPES),
				sizeMm: num(a, 'taille_mm', 0.5, 50),
				lengthCm: int(num(a, 'longueur_cm', 0, 1_000)),
				quantity: int(num(a, 'quantite', 0, 1_000))
			});
	}
}

// Column names back to the argument names of gerer_stock, so the model reads
// what it would write.
const FR: Record<string, string> = {
	brand: 'marque',
	colorway: 'coloris',
	colorHex: 'couleur_hex',
	dyeLot: 'bain',
	weightCategory: 'poids',
	fiber: 'fibre',
	motif: 'motif',
	yardsPerSkein: 'metres_par_pelote',
	gramsPerSkein: 'grammes_par_pelote',
	skeins: 'pelotes',
	fabricType: 'type_article',
	type: 'type_article',
	composition: 'composition',
	lengthCm: 'longueur_cm',
	widthCm: 'largeur_cm',
	category: 'categorie',
	quantity: 'quantite',
	sizeMm: 'taille_mm',
	notes: 'notes',
	binId: 'rangement_id'
};

const brief = (it: StockItem) => ({
	id: it.id,
	type: it.kind,
	nom: it.label,
	...Object.fromEntries(Object.entries(compact(it.details)).flatMap(([k, v]) => (FR[k] ? [[FR[k], v]] : [])))
});
const hrefOf = (kind: StockKind, it: StockItem) => `/stash?tab=${TAB[kind]}&q=${encodeURIComponent(it.label)}`;

async function binArg(env: ToolEnv, a: Args): Promise<string | null | undefined | ToolOutcome> {
	const v = str(a, 'rangement_id', 64);
	if (v === undefined) return undefined;
	if (/^(aucun|none|null)$/i.test(v)) return null;
	if (!isUuid(v) || !(await actions(env).ownsBin(env.uid, v))) return NOT_FOUND('Rangement');
	return v;
}

export const STASH_TOOLS: Record<string, ToolSpec> = {
	chercher_stock: {
		description: 'Cherche dans le stock de la personne : laine, tissu, mercerie ou outil (aiguilles, crochets). Sans texte, liste les derniers ajoutés.',
		parameters: { type: p('string', '"laine", "tissu", "mercerie" ou "outil"'), texte: p('string', 'mots cherchés (facultatif)') },
		required: ['type'],
		async run(a, env) {
			const kind = oneOf(a, 'type', KINDS, true)!;
			const rows = await actions(env).listStock(env.uid, kind, str(a, 'texte', 120), 12);
			return { content: JSON.stringify({ resultats: rows.map(brief) }) };
		}
	},

	gerer_stock: {
		description:
			"Ajoute, modifie ou supprime un article du stock (laine, tissu, mercerie, outil). Pour modifier ou supprimer, donne son id (chercher_stock / chercher_laines). Uniquement à la demande de la personne.",
		parameters: {
			action: p('string', '"ajouter", "modifier" ou "supprimer"'),
			type: p('string', '"laine", "tissu", "mercerie" ou "outil"'),
			id: p('string', "id de l'article (modifier, supprimer)"),
			nom: p('string', 'nom'),
			marque: p('string', 'laine : marque'),
			coloris: p('string', 'laine : coloris'),
			couleur_hex: p('string', 'couleur #RRGGBB'),
			bain: p('string', 'laine : numéro de bain'),
			poids: p('string', 'laine : catégorie, ex. "DK"'),
			fibre: p('string', 'laine : fibre'),
			metres_par_pelote: p('number', 'laine'),
			grammes_par_pelote: p('number', 'laine'),
			pelotes: p('number', 'laine : nombre de pelotes'),
			composition: p('string', 'tissu'),
			type_article: p('string', 'tissu : jersey, lin... ; outil : aiguille_droite, aiguille_circulaire, aiguille_double_pointe, crochet, autre'),
			longueur_cm: p('number', 'tissu : longueur ; outil : longueur du câble'),
			largeur_cm: p('number', 'tissu : laize'),
			taille_mm: p('number', 'outil : diamètre'),
			categorie: p('string', 'mercerie : catégorie'),
			quantite: p('number', 'mercerie, outil : quantité'),
			notes: p('string', 'notes'),
			rangement_id: p('string', 'id du rangement (outil rangements), ou "aucun"'),
			...CONFIRM_PARAM
		},
		required: ['action', 'type'],
		async run(a, env) {
			const action = oneOf(a, 'action', ['ajouter', 'modifier', 'supprimer'] as const, true)!;
			const kind = oneOf(a, 'type', KINDS, true)!;
			const act = actions(env);
			// One "type" argument for the kind of item; the item's own type
			// (fabric type, kind of needle) comes as type_article.
			const fields = fieldsFor(kind, { ...a, type: a.type_article });

			if (action === 'supprimer') {
				const item = await act.getStock(env.uid, kind, id(a));
				if (!item) return NOT_FOUND('Article');
				const ask = needsConfirmation(a, `« ${item.label} » (${kind}) du stock`);
				if (ask) return ask;
				await act.deleteStock(env.uid, kind, item.id);
				return done({ supprime: item.label }, { kind: 'deleted', what: WHAT[kind], title: item.label, href: `/stash?tab=${TAB[kind]}` });
			}

			const bin = await binArg(env, a);
			if (bin && typeof bin === 'object') return bin;
			if (bin !== undefined) (fields as { binId?: string | null }).binId = bin;

			if (action === 'ajouter') {
				if (kind === 'mercerie' && !(fields as StockFields['mercerie']).name) throw new ArgError('argument "nom" manquant');
				if (kind === 'outil' && !(fields as StockFields['outil']).type) throw new ArgError('argument "type_article" manquant pour un outil');
				const item = await act.addStock(env.uid, kind, fields);
				return done({ ajoute: brief(item) }, { kind: 'created', what: WHAT[kind], title: item.label, href: hrefOf(kind, item) });
			}

			if (!Object.keys(fields).length) throw new ArgError('rien à modifier : donne au moins un champ');
			const item = await act.updateStock(env.uid, kind, id(a), fields);
			if (!item) return NOT_FOUND('Article');
			return done({ modifie: brief(item) }, { kind: 'updated', what: WHAT[kind], title: item.label, href: hrefOf(kind, item) });
		}
	}
};
