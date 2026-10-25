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
import type { ChatTool, ChatToolCall } from '$lib/server/ai/ollama';
import type { AssistantAction, AssistantRef } from '$lib/assistant/events';
import { isUuid } from '$lib/uuid';
import { canEdit } from '$lib/server/access';
import type { AssistantData, PatternRecord, ProjectRecord, YarnRecord } from './data';
import { estimateYardage, gaugeCalc } from './calc';

export const TOOL_RESULT_CHARS = 2_500;
const PATTERN_EXCERPT_CHARS = 1_400;
const NOTES_CHARS = 400;
const NOTE_MAX_CHARS = 1_000;
const SEARCH_LIMIT = 6;

export type ToolOutcome = {
	content: string;
	refs?: AssistantRef[];
	action?: AssistantAction;
	error?: boolean;
};

export type ToolEnv = { uid: string; data: AssistantData; now: Date };

class ArgError extends Error {}

type Args = Record<string, unknown>;

function str(a: Args, key: string, max: number, required = false): string | undefined {
	const v = a[key];
	if (v == null || v === '') {
		if (required) throw new ArgError(`argument "${key}" manquant`);
		return undefined;
	}
	if (typeof v !== 'string' && typeof v !== 'number') throw new ArgError(`argument "${key}" : texte attendu`);
	const s = String(v).trim();
	if (!s && required) throw new ArgError(`argument "${key}" manquant`);
	return s ? s.slice(0, max) : undefined;
}

function num(a: Args, key: string, min: number, max: number, required = false): number | undefined {
	const v = a[key];
	if (v == null || v === '') {
		if (required) throw new ArgError(`argument "${key}" manquant`);
		return undefined;
	}
	const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
	if (!Number.isFinite(n) || n < min || n > max) throw new ArgError(`argument "${key}" : nombre entre ${min} et ${max} attendu`);
	return n;
}

function id(a: Args, key = 'id'): string {
	const v = str(a, key, 64, true)!;
	if (!isUuid(v)) throw new ArgError(`argument "${key}" : identifiant invalide (utilise un "id" renvoyé par un autre outil)`);
	return v;
}

// JSON for the model, cut to the budget. A cut JSON is no longer valid JSON,
// which the model copes with; the marker says something is missing.
export function capResult(value: unknown, max = TOOL_RESULT_CHARS): string {
	const s = typeof value === 'string' ? value : JSON.stringify(value);
	return s.length <= max ? s : `${s.slice(0, max - 20)}… [tronqué]`;
}

const clip = (s: string | null | undefined, max: number) =>
	s ? (s.length > max ? `${s.slice(0, max)}…` : s) : undefined;

// Drops null / undefined / empty fields: every token counts.
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
	) as Partial<T>;
}

const STATUS_FR: Record<string, string> = { idee: 'idée', monte: 'en cours', bloque: 'en pause', fini: 'terminé' };

// Case- and accent-insensitive, same length as the input (one UTF-16 unit in,
// one out) so an index found in the folded text is valid in the original.
function fold(s: string): string {
	return s
		.split('')
		.map((c) => c.normalize('NFD')[0].toLowerCase())
		.join('');
}

// The part of a pattern's text around `section` ("manches", "empiècement"),
// or its beginning. Exported for the tests.
export function patternExcerpt(text: string, section: string | undefined, max = PATTERN_EXCERPT_CHARS) {
	if (!text) return { texte: undefined, trouve: false };
	let at = -1;
	if (section) {
		const hay = fold(text);
		at = hay.indexOf(fold(section));
		// Fall back on the longest word of the request ("les manches" -> manches).
		if (at === -1) {
			const word = fold(section)
				.split(/[^\p{L}\p{N}]+/u)
				.sort((a, b) => b.length - a.length)[0];
			if (word && word.length >= 4) at = hay.indexOf(word);
		}
	}
	const start = at === -1 ? 0 : Math.max(0, at - 150);
	const slice = text.slice(start, start + max);
	return {
		texte: `${start > 0 ? '…' : ''}${slice}${start + max < text.length ? '…' : ''}`,
		trouve: at !== -1
	};
}

const patternRef = (p: { id: string; title: string; craft: string; garmentType: string | null; designer: string | null; coverPath: string | null }): AssistantRef => ({
	kind: 'pattern',
	id: p.id,
	title: p.title,
	subtitle: [p.garmentType, p.designer].filter(Boolean).join(' · ') || undefined,
	href: `/patterns/${p.id}`,
	image: p.coverPath
});

const yarnName = (y: YarnRecord) => [y.brand, y.name].filter(Boolean).join(' ') || y.colorway || 'Laine';

const yarnRef = (y: YarnRecord): AssistantRef => ({
	kind: 'yarn',
	id: y.id,
	title: yarnName(y),
	subtitle: [y.colorway, y.weightCategory].filter(Boolean).join(' · ') || undefined,
	href: `/stash?tab=yarn&q=${encodeURIComponent(y.name ?? y.brand ?? y.colorway ?? '')}`,
	image: y.photoPath
});

const projectRef = (p: ProjectRecord): AssistantRef => ({
	kind: 'project',
	id: p.id,
	title: p.title,
	subtitle: rowState(p) ?? STATUS_FR[p.status],
	href: `/projects/${p.id}`
});

function rowState(p: { currentRow: number; totalRows: number | null }): string | undefined {
	if (p.totalRows) return `rang ${p.currentRow} / ${p.totalRows}`;
	return p.currentRow ? `rang ${p.currentRow}` : undefined;
}

function yarnSummary(y: YarnRecord) {
	const total = y.yardsPerSkein ? Math.round(y.yardsPerSkein * y.skeins) : undefined;
	return compact({
		id: y.id,
		nom: yarnName(y),
		coloris: y.colorway,
		poids: y.weightCategory,
		fibre: y.fiber,
		pelotes: y.skeins,
		metres_par_pelote: y.yardsPerSkein,
		grammes_par_pelote: y.gramsPerSkein,
		metres_total: total,
		notes: clip(y.notes, 150)
	});
}

async function canSeePattern(env: ToolEnv, p: PatternRecord): Promise<boolean> {
	if (p.ownerId === env.uid || p.isShared) return true;
	return (await env.data.access(env.uid, 'pattern', p.id, p.ownerId)) !== null;
}

async function projectAccess(env: ToolEnv, p: ProjectRecord) {
	if (p.ownerId === env.uid) return 'owner' as const;
	return env.data.access(env.uid, 'project', p.id, p.ownerId);
}

async function visibleYarn(env: ToolEnv, yarnId: string): Promise<YarnRecord | null> {
	const y = await env.data.getYarn(yarnId);
	if (!y) return null;
	if (y.ownerId === env.uid) return y;
	return (await env.data.access(env.uid, 'yarn', y.id, y.ownerId)) ? y : null;
}

type ToolSpec = {
	description: string;
	parameters: Record<string, unknown>;
	required?: string[];
	run: (args: Args, env: ToolEnv) => Promise<ToolOutcome>;
};

const NOT_FOUND = (what: string): ToolOutcome => ({
	content: JSON.stringify({ erreur: `${what} introuvable (ou non accessible pour ce compte)` }),
	error: true
});

const p = (type: string, description: string, extra: Record<string, unknown> = {}) => ({ type, description, ...extra });

const SPECS: Record<string, ToolSpec> = {
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
		description: 'Liste les projets en cours ou en pause de la personne, avec leur compteur de rangs.',
		parameters: {},
		async run(_a, env) {
			const rows = await env.data.projectsInProgress(env.uid, 10);
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
				action: { kind: 'note_added', title: prj.title, href: `/projects/${prj.id}` },
				refs: [projectRef(prj)]
			};
		}
	}
};

export const TOOL_NAMES = Object.keys(SPECS);

export const TOOLS: ChatTool[] = Object.entries(SPECS).map(([name, s]) => ({
	type: 'function',
	function: {
		name,
		description: s.description,
		parameters: { type: 'object', properties: s.parameters, ...(s.required?.length ? { required: s.required } : {}) }
	}
}));

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
	const spec = SPECS[name];
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
