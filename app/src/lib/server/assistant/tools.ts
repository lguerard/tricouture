// The assistant's tools: what the model may call, how its arguments are
// checked, and what it gets back. Results are compact JSON with French keys
// (the conversation is in French), always capped -- the whole exchange has to
// fit the shared 8192-token context. A bad argument or a missing object is
// answered to the MODEL as {"erreur": ...}, so it can correct itself or tell
// the person, rather than failing the request.
//
// Scoping: searches are scoped in SQL (data.ts); every lookup by id checks
// access on the row with the same rules as the pages (owner, a share, or a
// public pattern) and answers "introuvable" otherwise -- never "forbidden",
// which would confirm that the id exists.
//
// Only the base tools (reading, calculating, a project note) are sent with
// every model call: the definitions of ~40 tools would not fit the 8192-token
// context next to the conversation. The others come in groups ("domaines"),
// added for the rest of the turn when the model calls ouvrir_outils -- or
// right away when the question obviously needs them (preopenDomains).
import type { ChatTool, ChatToolCall } from '$lib/server/ai/ollama';
import type { AssistantRef } from '$lib/assistant/events';
import { isUuid } from '$lib/uuid';
import { canEdit } from '$lib/server/access';
import { estimateYardage, gaugeCalc } from './calc';
import {
	ArgError,
	canSeePattern,
	capResult,
	clip,
	compact,
	fold,
	id,
	NOT_FOUND,
	NOTE_MAX_CHARS,
	NOTES_CHARS,
	num,
	p,
	patternExcerpt,
	patternRef,
	projectAccess,
	projectRef,
	SEARCH_LIMIT,
	STATUS_FR,
	str,
	visibleYarn,
	yarnRef,
	yarnSummary,
	type Args,
	type ToolEnv,
	type ToolOutcome,
	type ToolSpec
} from './toolkit';
import { PATTERN_TOOLS } from './tools/patterns';
import { PROJECT_TOOLS } from './tools/projects';
import { STASH_TOOLS } from './tools/stash';
import { ORGANIZE_TOOLS } from './tools/organize';
import { SHARE_TOOL } from './tools/share';

export { capResult, patternExcerpt, TOOL_RESULT_CHARS } from './toolkit';
export type { ToolEnv, ToolOutcome } from './toolkit';

const BASE: Record<string, ToolSpec> = {
	chercher_patrons: {
		description: 'Cherche dans la bibliothèque de patrons de la personne (par sens et par mots). Renvoie des id à passer à lire_patron.',
		parameters: { texte: p('string', 'ce qui est cherché, ex. "pull raglan en laine épaisse"') },
		required: ['texte'],
		async run(a, env) {
			const texte = str(a, 'texte', 200, true)!;
			const hits = await env.data.findPatterns(env.uid, texte, SEARCH_LIMIT);
			return {
				content: capResult({
					resultats: hits.map((h) => compact({ id: h.id, titre: h.title, technique: h.craft, type: h.garmentType, createur: h.designer }))
				}),
				refs: hits.map(patternRef)
			};
		}
	},

	lire_patron: {
		description: "Lit un patron : infos (jauge, métrage, tailles), pièces, notes et un extrait du texte. 'section' cible une partie du texte (ex. \"manches\").",
		parameters: { id: p('string', 'id du patron'), section: p('string', 'partie du texte à lire (facultatif)') },
		required: ['id'],
		async run(a, env) {
			const pid = id(a);
			const section = str(a, 'section', 80);
			const pat = await env.data.getPattern(pid);
			if (!pat || !(await canSeePattern(env, pat))) return NOT_FOUND('Patron');
			const pieces = await env.data.getPatternPieces(pat.id);
			const excerpt = patternExcerpt(pat.extractedText ?? '', section);
			const info = compact({
				id: pat.id,
				titre: pat.title,
				technique: pat.craft,
				type: pat.garmentType,
				createur: pat.designer,
				langue: pat.language,
				difficulte: pat.difficulty,
				tailles: pat.sizes,
				jauge: pat.gaugeStitches
					? `${pat.gaugeStitches} m${pat.gaugeRows ? ` x ${pat.gaugeRows} rgs` : ''} / 10 cm`
					: undefined,
				metrage_m: pat.yardageRequired,
				tags: pat.tags,
				pieces: pieces.slice(0, 20).map((pc) => compact({ nom: pc.name, rangs: pc.defaultTotalRows, quantite: pc.quantity })),
				notes: clip(pat.notes, NOTES_CHARS),
				...(section ? { section_trouvee: excerpt.trouve } : {}),
				texte: excerpt.texte
			});
			return { content: capResult(info), refs: [patternRef(pat)] };
		}
	},

	chercher_laines: {
		description: 'Cherche dans le stock de laines de la personne. Tous les filtres sont facultatifs ; sans filtre, liste le stock.',
		parameters: {
			texte: p('string', 'mots libres (marque, nom, coloris...)'),
			poids: p('string', 'catégorie de poids, ex. "fingering", "DK", "worsted", "aran"'),
			couleur: p('string', 'coloris, ex. "bleu"'),
			fibre: p('string', 'fibre, ex. "mérinos", "coton"')
		},
		async run(a, env) {
			const filter = {
				text: str(a, 'texte', 120),
				weight: str(a, 'poids', 40),
				color: str(a, 'couleur', 60),
				fiber: str(a, 'fibre', 60)
			};
			const rows = await env.data.findYarns(env.uid, filter, 8);
			return { content: capResult({ resultats: rows.map(yarnSummary) }), refs: rows.map(yarnRef) };
		}
	},

	projets_en_cours: {
		description: "Liste les projets en cours ou en pause de la personne, avec leur compteur de rangs. Avec 'texte', cherche un projet par son titre, quel que soit son statut.",
		parameters: { texte: p('string', 'mots du titre (facultatif)') },
		async run(a, env) {
			const texte = str(a, 'texte', 120);
			const rows = texte ? await env.data.findProjects(env.uid, texte, 10) : await env.data.projectsInProgress(env.uid, 10);
			return {
				content: capResult({
					projets: rows.map((r) =>
						compact({ id: r.id, titre: r.title, statut: STATUS_FR[r.status], avancement_pct: r.progressPct, rang: r.currentRow, rangs_total: r.totalRows })
					)
				}),
				refs: rows.map(projectRef)
			};
		}
	},

	lire_projet: {
		description: "Lit un projet : statut, compteur de rangs, avancement des pièces, laines utilisées, échéance, notes.",
		parameters: { id: p('string', 'id du projet') },
		required: ['id'],
		async run(a, env) {
			const prj = await env.data.getProject(id(a));
			if (!prj || !(await projectAccess(env, prj))) return NOT_FOUND('Projet');
			const d = await env.data.getProjectDetail(prj);
			const info = compact({
				id: prj.id,
				titre: prj.title,
				statut: STATUS_FR[prj.status],
				rang_actuel: prj.currentRow,
				rangs_total: prj.totalRows,
				avancement_pct: prj.progressPct,
				echeance: prj.deadline,
				temps_passe_min: prj.timeSpentMinutes || undefined,
				patron: d.pattern ? { id: d.pattern.id, titre: d.pattern.title, technique: d.pattern.craft } : undefined,
				pieces: d.pieces.slice(0, 20).map((pc) =>
					compact({ nom: pc.name, rang: pc.totalRows ? pc.currentRow : undefined, rangs_total: pc.totalRows, etat: pc.status ?? undefined, finie: pc.completed || undefined })
				),
				laines: d.yarns.map((y) => compact({ nom: [y.brand, y.name].filter(Boolean).join(' '), coloris: y.colorway, pelotes_utilisees: y.skeinsUsed })),
				// The latest notes matter most: keep the end.
				notes: prj.notes ? (prj.notes.length > NOTES_CHARS ? `…${prj.notes.slice(-NOTES_CHARS)}` : prj.notes) : undefined
			});
			const refs = [projectRef(prj)];
			if (d.pattern) refs.push({ kind: 'pattern', id: d.pattern.id, title: d.pattern.title, href: `/patterns/${d.pattern.id}` });
			return { content: capResult(info), refs };
		}
	},

	calculer_jauge: {
		description:
			'Calcul exact avec une jauge (mailles/rangs pour 10 cm) : mailles ou rangs -> cm, cm -> mailles ou rangs, et conversion vers une autre jauge (cible). Toujours l\'utiliser plutôt que calculer de tête.',
		parameters: {
			mailles_10cm: p('number', 'mailles pour 10 cm (jauge du patron)'),
			rangs_10cm: p('number', 'rangs pour 10 cm (jauge du patron)'),
			cible_mailles_10cm: p('number', 'mailles pour 10 cm de l\'autre jauge (échantillon de la personne)'),
			cible_rangs_10cm: p('number', 'rangs pour 10 cm de l\'autre jauge'),
			mailles: p('number', 'nombre de mailles à convertir'),
			rangs: p('number', 'nombre de rangs à convertir'),
			largeur_cm: p('number', 'largeur en cm'),
			hauteur_cm: p('number', 'hauteur en cm')
		},
		required: ['mailles_10cm'],
		async run(a) {
			const r = gaugeCalc({
				stitchesPer10: num(a, 'mailles_10cm', 1, 100, true)!,
				rowsPer10: num(a, 'rangs_10cm', 1, 150),
				targetStitchesPer10: num(a, 'cible_mailles_10cm', 1, 100),
				targetRowsPer10: num(a, 'cible_rangs_10cm', 1, 150),
				stitches: num(a, 'mailles', 0, 100_000),
				rows: num(a, 'rangs', 0, 100_000),
				widthCm: num(a, 'largeur_cm', 0, 1_000),
				heightCm: num(a, 'hauteur_cm', 0, 1_000)
			});
			if (!Object.keys(r).length) throw new ArgError('rien à calculer : donne des mailles, des rangs ou des cm (et rangs_10cm pour les rangs)');
			return {
				content: JSON.stringify(
					compact({ largeur_cm: r.widthCm, hauteur_cm: r.heightCm, mailles: r.stitches, rangs: r.rows, mailles_cible: r.targetStitches, rangs_cible: r.targetRows })
				)
			};
		}
	},

	estimer_metrage: {
		description:
			'Estime le métrage de fil pour des pièces rectangulaires, à partir des mètres consommés par un échantillon de 10 x 10 cm (marge de 10 % par défaut).',
		parameters: {
			largeur_cm: p('number', 'largeur d\'une pièce en cm'),
			hauteur_cm: p('number', 'hauteur d\'une pièce en cm'),
			nombre_pieces: p('number', 'nombre de pièces de cette taille (1 par défaut)'),
			metres_echantillon: p('number', 'mètres de fil pour 10 x 10 cm'),
			metres_par_pelote: p('number', 'mètres par pelote, pour compter les pelotes'),
			marge_pct: p('number', 'marge de sécurité en % (10 par défaut)')
		},
		required: ['largeur_cm', 'hauteur_cm', 'metres_echantillon'],
		async run(a) {
			const r = estimateYardage({
				widthCm: num(a, 'largeur_cm', 1, 1_000, true)!,
				heightCm: num(a, 'hauteur_cm', 1, 1_000, true)!,
				pieces: num(a, 'nombre_pieces', 1, 50),
				swatchMeters: num(a, 'metres_echantillon', 0.1, 100, true)!,
				metersPerSkein: num(a, 'metres_par_pelote', 1, 10_000),
				marginPct: num(a, 'marge_pct', 0, 100)
			});
			return { content: JSON.stringify(compact({ surface_cm2: r.areaCm2, metres: r.meters, pelotes: r.skeins })) };
		}
	},

	ajouter_note_projet: {
		description:
			"Ajoute une note datée à la fin des notes d'un projet (rien n'est effacé). UNIQUEMENT si la personne le demande explicitement.",
		parameters: { id: p('string', 'id du projet'), texte: p('string', 'la note à ajouter') },
		required: ['id', 'texte'],
		async run(a, env) {
			const pid = id(a);
			const texte = str(a, 'texte', NOTE_MAX_CHARS, true)!;
			const prj = await env.data.getProject(pid);
			const access = prj ? await projectAccess(env, prj) : null;
			if (!prj || !access) return NOT_FOUND('Projet');
			if (!canEdit(access)) return { content: JSON.stringify({ erreur: 'ce projet est partagé en lecture seule : impossible d\'y ajouter une note' }), error: true };
			const day = env.now.toISOString().slice(0, 10);
			await env.data.appendProjectNote(prj.id, `[${day}] ${texte}`);
			return {
				content: JSON.stringify({ ok: true, projet: prj.title, note_ajoutee: texte }),
				action: { kind: 'note_added', what: 'project', title: prj.title, href: `/projects/${prj.id}` },
				refs: [projectRef(prj)]
			};
		}
	}
};

// Tool groups. "partager" is in two of them: whichever is opened brings it.
export const DOMAINS = {
	patrons: {
		description: 'créer (y compris un patron que tu rédiges), importer depuis un lien, modifier, supprimer, partager un patron ; couvertures ; pièces ; remplissage des infos par IA',
		tools: { ...PATTERN_TOOLS, partager: SHARE_TOOL }
	},
	projets: {
		description: 'créer, modifier (statut, rangs, échéance, temps, coût...), supprimer, partager un projet ; laine et tissu utilisés (déduits du stock) ; pièces',
		tools: { ...PROJECT_TOOLS, partager: SHARE_TOOL }
	},
	stock: {
		description: 'chercher, ajouter, modifier, supprimer laine, tissu, mercerie, outils ; les ranger',
		tools: STASH_TOOLS
	},
	organisation: {
		description: 'objectifs, rangements, destinataires, moodboards, écussons brodés, couleurs des tags, bilan chiffré et succès',
		tools: ORGANIZE_TOOLS
	}
} satisfies Record<string, { description: string; tools: Record<string, ToolSpec> }>;

export type Domain = keyof typeof DOMAINS;
const DOMAIN_NAMES = Object.keys(DOMAINS) as Domain[];

BASE.ouvrir_outils = {
	description: `Donne accès à d'autres outils pour AGIR dans l'app, par groupe : ${DOMAIN_NAMES.map((d) => `"${d}" (${DOMAINS[d].description})`).join(' ; ')}. Les outils arrivent à l'étape suivante.`,
	parameters: { domaine: p('string', DOMAIN_NAMES.map((d) => `"${d}"`).join(', ') + ' ; plusieurs séparés par des virgules') },
	required: ['domaine'],
	async run(a, env) {
		const asked = String(a.domaine ?? '')
			.split(/[,\s]+/)
			.map((d) => fold(d).replace(/[^a-z]/g, ''))
			.filter(Boolean);
		const bad = asked.filter((d) => !(d in DOMAINS));
		if (!asked.length || bad.length) throw new ArgError(`domaine inconnu ; au choix : ${DOMAIN_NAMES.join(', ')}`);
		for (const d of asked) env.domains?.add(d);
		return { content: JSON.stringify({ ok: true, outils: asked.flatMap((d) => Object.keys(DOMAINS[d as Domain].tools)) }) };
	}
};

// Every tool, for runTool: a model may call a group's tool it saw earlier in
// the conversation without reopening the group.
const ALL: Record<string, ToolSpec> = Object.assign({}, BASE, ...DOMAIN_NAMES.map((d) => DOMAINS[d].tools));
export const TOOL_NAMES = Object.keys(ALL);

const definition = ([name, s]: [string, ToolSpec]): ChatTool => ({
	type: 'function',
	function: {
		name,
		description: s.description,
		parameters: { type: 'object', properties: s.parameters, ...(s.required?.length ? { required: s.required } : {}) }
	}
});

// The base tools.
export const TOOLS: ChatTool[] = Object.entries(BASE).map(definition);

// The tools sent to the model: the base ones plus the opened groups'.
export function toolsFor(domains: Iterable<string>): ChatTool[] {
	const specs: Record<string, ToolSpec> = { ...BASE };
	for (const d of domains) if (d in DOMAINS) Object.assign(specs, DOMAINS[d as Domain].tools);
	return Object.entries(specs).map(definition);
}

// Groups the question plainly needs, opened before the first model call to
// save it a round (and the person a few seconds). Kept to the words that say
// "do something": a mere question about a pattern needs no group.
const ACT = /\b(ajout|ajoute|cr[ée]+|cr[ée]e|supprim|efface|enl[eè]v|retir|modifi|chang|renomm|mets?|passe|marque|note|range|partag|importe|remplis|d[ée]tecte|trouve|cherche.{0,20}(image|couverture)|avance|d[ée]duis|utilis|rends?|termin|compte)/i;
const HINTS: [Domain, RegExp][] = [
	['patrons', /patron|couverture|pi[èe]ces?\b|tag/i],
	['projets', /projet|rangs?\b|compteur|en cours|termin|[ée]ch[ée]ance/i],
	['stock', /stock|laine|pelote|tissu|mercerie|bouton|aiguille|crochet|outil/i],
	['organisation', /objectif|rangement|bo[iî]te|destinataire|moodboard|tableau|[ée]cusson|broderie|bilan|statisti|succ[èe]s|couleur.{0,10}tag/i]
];

export function preopenDomains(question: string, contextKind?: 'pattern' | 'project' | 'yarn'): Set<string> {
	const open = new Set<string>();
	if (!ACT.test(question)) return open;
	for (const [d, re] of HINTS) if (re.test(question)) open.add(d);
	if (!open.size && contextKind) open.add(contextKind === 'pattern' ? 'patrons' : contextKind === 'project' ? 'projets' : 'stock');
	// Two groups at most up front; the model opens more if it needs them.
	return new Set([...open].slice(0, 2));
}

function parseArgs(raw: ChatToolCall['function']['arguments'] | undefined): Args {
	if (raw == null) return {};
	if (typeof raw === 'string') {
		if (!raw.trim()) return {};
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Args;
		throw new ArgError('les arguments doivent être un objet JSON');
	}
	if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Args;
	throw new ArgError('les arguments doivent être un objet JSON');
}

// Runs one tool call. Never throws for the model's mistakes: they come back as
// an {"erreur"} result. A database failure does throw (the request fails).
export async function runTool(call: ChatToolCall, env: ToolEnv): Promise<ToolOutcome> {
	const name = call.function?.name ?? '';
	const spec = ALL[name];
	if (!spec) {
		return { content: JSON.stringify({ erreur: `outil inconnu "${name}". Outils : ${TOOL_NAMES.join(', ')}` }), error: true };
	}
	try {
		const out = await spec.run(parseArgs(call.function.arguments), env);
		return { ...out, content: capResult(out.content) };
	} catch (e) {
		if (e instanceof ArgError || e instanceof SyntaxError) {
			return { content: JSON.stringify({ erreur: e instanceof SyntaxError ? 'arguments JSON illisibles' : e.message }), error: true };
		}
		throw e;
	}
}

// The object open on screen, described with the same scoped tools so the
// model does not need a round trip to know what "ce patron" means. Null when
// it is not visible to this account (or no longer exists).
export async function describeContext(
	ctx: { kind: 'pattern' | 'project' | 'yarn'; id: string; row?: number },
	env: ToolEnv
): Promise<{ text: string; ref?: AssistantRef } | null> {
	if (!isUuid(ctx.id)) return null;
	if (ctx.kind === 'yarn') {
		const y = await visibleYarn(env, ctx.id);
		return y ? { text: `Laine ouverte à l'écran : ${JSON.stringify(yarnSummary(y))}`, ref: yarnRef(y) } : null;
	}
	const tool = ctx.kind === 'pattern' ? 'lire_patron' : 'lire_projet';
	const out = await runTool({ function: { name: tool, arguments: { id: ctx.id } } }, env);
	if (out.error) return null;
	const label = ctx.kind === 'pattern' ? 'Patron ouvert à l\'écran' : 'Projet ouvert à l\'écran';
	const row = ctx.kind === 'project' && ctx.row != null ? ` (compteur affiché : rang ${ctx.row})` : '';
	return { text: `${label}${row} : ${out.content}`, ref: out.refs?.[0] };
}
