// Shared pieces of the assistant's tools (tools.ts and tools/*.ts): argument
// checks, result shaping, access checks and the cards shown under answers.
// A bad argument or a missing object is answered to the MODEL as
// {"erreur": ...}, so it can correct itself or tell the person.
import type { AssistantAction, AssistantRef } from '$lib/assistant/events';
import { isUuid } from '$lib/uuid';
import type { AssistantData, PatternRecord, ProjectRecord, ProjectStatus, YarnRecord } from './data';
import type { AssistantActions } from './actions';

export const TOOL_RESULT_CHARS = 2_500;
export const PATTERN_EXCERPT_CHARS = 1_400;
export const NOTES_CHARS = 400;
export const NOTE_MAX_CHARS = 1_000;
export const SEARCH_LIMIT = 6;
// Cover searches run one web search each (up to ~15 s): a few per call keeps
// the turn inside its time limit.
export const COVERS_PER_CALL = 3;

export type ToolOutcome = {
	content: string;
	refs?: AssistantRef[];
	action?: AssistantAction;
	error?: boolean;
};

// `act`: the writes of the domain tools (actions.ts); `domains`: the tool
// groups opened for this turn (ouvrir_outils), see tools.ts.
export type ToolEnv = { uid: string; data: AssistantData; now: Date; act?: AssistantActions; domains?: Set<string> };

export function actions(env: ToolEnv): AssistantActions {
	if (!env.act) throw new Error('assistant actions not wired');
	return env.act;
}

export class ArgError extends Error {}

export type Args = Record<string, unknown>;

export function str(a: Args, key: string, max: number, required = false): string | undefined {
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

export function num(a: Args, key: string, min: number, max: number, required = false): number | undefined {
	const v = a[key];
	if (v == null || v === '') {
		if (required) throw new ArgError(`argument "${key}" manquant`);
		return undefined;
	}
	const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
	if (!Number.isFinite(n) || n < min || n > max) throw new ArgError(`argument "${key}" : nombre entre ${min} et ${max} attendu`);
	return n;
}

export function bool(a: Args, key: string): boolean | undefined {
	const v = a[key];
	if (v == null || v === '') return undefined;
	if (typeof v === 'boolean') return v;
	const k = String(v).trim().toLowerCase();
	if (['true', 'oui', 'yes', '1'].includes(k)) return true;
	if (['false', 'non', 'no', '0'].includes(k)) return false;
	throw new ArgError(`argument "${key}" : true ou false attendu`);
}

// One of `values` (case- and accent-insensitive), or undefined when absent.
export function oneOf<T extends string>(a: Args, key: string, values: readonly T[], required = false): T | undefined {
	const v = str(a, key, 60, required);
	if (!v) return undefined;
	const k = fold(v).replace(/[\s-]+/g, '_');
	const hit = values.find((x) => fold(x) === k);
	if (!hit) throw new ArgError(`argument "${key}" : une valeur parmi ${values.map((x) => `"${x}"`).join(', ')}`);
	return hit;
}

// A date AAAA-MM-JJ, null for "" / "aucune" (clears it), undefined if absent.
export function date(a: Args, key: string): string | null | undefined {
	const v = a[key];
	if (v == null) return undefined;
	const s = String(v).trim();
	if (!s || /^(aucune?|none|null)$/i.test(s)) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new ArgError(`argument "${key}" : date AAAA-MM-JJ attendue`);
	return s;
}

// Deleting is for good: the first call only says what would go, and asks the
// model to get a yes from the person before calling again with confirme=true.
export function needsConfirmation(a: Args, what: string): ToolOutcome | null {
	if (bool(a, 'confirme') === true) return null;
	return {
		content: JSON.stringify({
			confirmation_requise: `Supprimer définitivement ${what} ? Demande d'abord à la personne ; rappelle l'outil avec confirme=true seulement après son accord explicite.`
		})
	};
}

export const CONFIRM_PARAM = { confirme: { type: 'boolean', description: 'true seulement après accord explicite de la personne' } };

// A done change: what the model reads, plus the link shown under the answer.
export function done(result: Record<string, unknown>, action: AssistantAction, refs?: AssistantRef[]): ToolOutcome {
	return { content: JSON.stringify({ ok: true, ...result }), action, ...(refs ? { refs } : {}) };
}

export function id(a: Args, key = 'id'): string {
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

export const clip = (s: string | null | undefined, max: number) =>
	s ? (s.length > max ? `${s.slice(0, max)}…` : s) : undefined;

// Drops null / undefined / empty fields: every token counts.
export function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
	) as Partial<T>;
}

export const STATUS_FR: Record<string, string> = { idee: 'idée', monte: 'en cours', bloque: 'en pause', fini: 'terminé' };

// The model may answer with the French label or the stored value.
export function status(a: Args): ProjectStatus | undefined {
	const v = str(a, 'statut', 30);
	if (!v) return undefined;
	const k = fold(v).replace(/[^a-z]/g, '');
	const s = ({ idee: 'idee', encours: 'monte', monte: 'monte', enpause: 'bloque', pause: 'bloque', bloque: 'bloque', termine: 'fini', fini: 'fini' } as const)[k];
	if (!s) throw new ArgError('argument "statut" : "idée", "en cours", "en pause" ou "terminé"');
	return s;
}

// A list given as an array or as "a, b, c".
export function list(a: Args, key: string): string[] {
	const v = a[key];
	const items = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
	return [...new Set(items.map((x) => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, 20);
}

export const READ_ONLY = (what: string): ToolOutcome => ({
	content: JSON.stringify({ erreur: `${what} : partagé en lecture seule, impossible de le modifier` }),
	error: true
});

// Case- and accent-insensitive, same length as the input (one UTF-16 unit in,
// one out) so an index found in the folded text is valid in the original.
export function fold(s: string): string {
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

export const patternRef = (p: { id: string; title: string; craft: string; garmentType: string | null; designer: string | null; coverPath: string | null }): AssistantRef => ({
	kind: 'pattern',
	id: p.id,
	title: p.title,
	subtitle: [p.garmentType, p.designer].filter(Boolean).join(' · ') || undefined,
	href: `/patterns/${p.id}`,
	image: p.coverPath
});

export const yarnName = (y: YarnRecord) => [y.brand, y.name].filter(Boolean).join(' ') || y.colorway || 'Laine';

export const yarnRef = (y: YarnRecord): AssistantRef => ({
	kind: 'yarn',
	id: y.id,
	title: yarnName(y),
	subtitle: [y.colorway, y.weightCategory].filter(Boolean).join(' · ') || undefined,
	href: `/stash?tab=yarn&q=${encodeURIComponent(y.name ?? y.brand ?? y.colorway ?? '')}`,
	image: y.photoPath
});

export const projectRef = (p: ProjectRecord): AssistantRef => ({
	kind: 'project',
	id: p.id,
	title: p.title,
	subtitle: rowState(p) ?? STATUS_FR[p.status],
	href: `/projects/${p.id}`
});

export function rowState(p: { currentRow: number; totalRows: number | null }): string | undefined {
	if (p.totalRows) return `rang ${p.currentRow} / ${p.totalRows}`;
	return p.currentRow ? `rang ${p.currentRow}` : undefined;
}

export function yarnSummary(y: YarnRecord) {
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

export async function canSeePattern(env: ToolEnv, p: PatternRecord): Promise<boolean> {
	if (p.ownerId === env.uid || p.isShared) return true;
	return (await env.data.access(env.uid, 'pattern', p.id, p.ownerId)) !== null;
}

export async function projectAccess(env: ToolEnv, p: ProjectRecord) {
	if (p.ownerId === env.uid) return 'owner' as const;
	return env.data.access(env.uid, 'project', p.id, p.ownerId);
}

export async function visibleYarn(env: ToolEnv, yarnId: string): Promise<YarnRecord | null> {
	const y = await env.data.getYarn(yarnId);
	if (!y) return null;
	if (y.ownerId === env.uid) return y;
	return (await env.data.access(env.uid, 'yarn', y.id, y.ownerId)) ? y : null;
}

export type ToolSpec = {
	description: string;
	parameters: Record<string, unknown>;
	required?: string[];
	run: (args: Args, env: ToolEnv) => Promise<ToolOutcome>;
};

export const NOT_FOUND = (what: string): ToolOutcome => ({
	content: JSON.stringify({ erreur: `${what} introuvable (ou non accessible pour ce compte)` }),
	error: true
});

export const p = (type: string, description: string, extra: Record<string, unknown> = {}) => ({ type, description, ...extra });

