// Database side of the assistant's tools. Two kinds of functions:
//
// - searches and listings, scoped IN SQL with the same rules as each section's
//   own list (patterns: mine + shared with me + public; projects: mine +
//   shared with me; stash: mine only -- see routes/api/search). Their query
//   builders are exported so the tests can check the scoping in the SQL;
// - lookups by id, deliberately NOT scoped: the caller (tools.ts) checks
//   access on the row it got, with the same helper as the pages
//   (access.ts accessFor), and answers "not found" when it may not see it.
import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { patternPieces, patterns, projectPieceProgress, projects, projectYarns, yarns } from '$lib/server/db/schema';
import { accessFor, visibleTo, type Access, type ResourceType } from '$lib/server/access';
import { aiConfigured, embed } from '$lib/server/ai/ollama';
import { ensureEmbeddingScheme } from '$lib/server/embeddings';

export type PatternRecord = {
	id: string;
	ownerId: string;
	isShared: boolean;
	title: string;
	craft: string;
	garmentType: string | null;
	designer: string | null;
	language: string | null;
	difficulty: number | null;
	sizes: string | null;
	gaugeStitches: number | null;
	gaugeRows: number | null;
	yardageRequired: number | null;
	tags: string[];
	notes: string | null;
	coverPath: string | null;
	extractedText: string | null;
};

export type PatternHit = Pick<PatternRecord, 'id' | 'title' | 'craft' | 'garmentType' | 'designer' | 'coverPath'>;

export type PieceRecord = { name: string; defaultTotalRows: number | null; quantity: number | null };

export type YarnRecord = {
	id: string;
	ownerId: string;
	brand: string | null;
	name: string | null;
	colorway: string | null;
	weightCategory: string | null;
	fiber: string | null;
	yardsPerSkein: number | null;
	gramsPerSkein: number | null;
	skeins: number;
	photoPath: string | null;
	notes: string | null;
};

export type ProjectRecord = {
	id: string;
	ownerId: string;
	title: string;
	patternId: string | null;
	status: string;
	progressPct: number;
	currentRow: number;
	totalRows: number | null;
	deadline: string | null;
	timeSpentMinutes: number;
	notes: string | null;
};

export type ProjectDetail = {
	pattern: { id: string; title: string; craft: string } | null;
	pieces: { name: string; completed: boolean; status: string | null; currentRow: number; totalRows: number | null }[];
	yarns: { brand: string | null; name: string | null; colorway: string | null; skeinsUsed: number }[];
};

export type YarnFilter = { text?: string; weight?: string; color?: string; fiber?: string };

export interface AssistantData {
	access(uid: string, type: ResourceType, id: string, ownerId: string): Promise<Access>;
	findPatterns(uid: string, text: string, limit: number): Promise<PatternHit[]>;
	getPattern(id: string): Promise<PatternRecord | null>;
	getPatternPieces(patternId: string): Promise<PieceRecord[]>;
	findYarns(uid: string, filter: YarnFilter, limit: number): Promise<YarnRecord[]>;
	getYarn(id: string): Promise<YarnRecord | null>;
	getProject(id: string): Promise<ProjectRecord | null>;
	getProjectDetail(project: ProjectRecord): Promise<ProjectDetail>;
	projectsInProgress(uid: string, limit: number): Promise<ProjectRecord[]>;
	appendProjectNote(id: string, note: string): Promise<void>;
}

// `%` and `_` typed by the person are literal characters, not wildcards.
export function likePattern(q: string): string {
	return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Words worth matching on their own ("un pull chaud" -> pull, chaud).
export function searchWords(text: string): string[] {
	const words = text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((w) => w.length >= 3);
	return [...new Set(words)].slice(0, 6);
}

const MIN_SIMILARITY = 0.45;

// Patterns this account may see: own, shared with it, or made public.
export function patternScope(uid: string): SQL {
	return or(visibleTo(uid, 'pattern', patterns.ownerId, patterns.id), eq(patterns.isShared, true))!;
}

const patternHitFields = {
	id: patterns.id,
	title: patterns.title,
	craft: patterns.craft,
	garmentType: patterns.garmentType,
	designer: patterns.designer,
	coverPath: patterns.coverPath
};

export function patternTextQuery(uid: string, text: string, limit: number) {
	const words = searchWords(text);
	const terms = (words.length ? words : [text.trim()]).map(likePattern);
	const match = or(
		...terms.flatMap((like) => [
			ilike(patterns.title, like),
			ilike(patterns.designer, like),
			ilike(patterns.garmentType, like),
			ilike(patterns.notes, like),
			sql`exists (select 1 from jsonb_array_elements_text(${patterns.tags}) as tag where tag ilike ${like})`
		])
	);
	return db
		.select(patternHitFields)
		.from(patterns)
		.where(and(patternScope(uid), match))
		.orderBy(desc(patterns.updatedAt))
		.limit(limit);
}

export function patternVectorQuery(uid: string, vec: number[], limit: number) {
	const distance = sql<number>`${patterns.embedding} <=> ${`[${vec.join(',')}]`}::vector`;
	return db
		.select({ ...patternHitFields, distance })
		.from(patterns)
		.where(and(patternScope(uid), isNotNull(patterns.embedding)))
		.orderBy(distance)
		.limit(limit);
}

export function yarnQuery(uid: string, f: YarnFilter, limit: number) {
	const conds: SQL[] = [eq(yarns.ownerId, uid)];
	if (f.text) {
		const words = searchWords(f.text);
		const terms = (words.length ? words : [f.text.trim()]).map(likePattern);
		conds.push(
			or(
				...terms.flatMap((like) => [
					ilike(yarns.brand, like),
					ilike(yarns.name, like),
					ilike(yarns.colorway, like),
					ilike(yarns.fiber, like),
					ilike(yarns.weightCategory, like),
					ilike(yarns.notes, like)
				])
			)!
		);
	}
	if (f.weight) conds.push(ilike(yarns.weightCategory, likePattern(f.weight)));
	if (f.color) conds.push(ilike(yarns.colorway, likePattern(f.color)));
	if (f.fiber) conds.push(ilike(yarns.fiber, likePattern(f.fiber)));
	return db
		.select(yarnFields)
		.from(yarns)
		.where(and(...conds))
		.orderBy(desc(yarns.skeins))
		.limit(limit);
}

const yarnFields = {
	id: yarns.id,
	ownerId: yarns.ownerId,
	brand: yarns.brand,
	name: yarns.name,
	colorway: yarns.colorway,
	weightCategory: yarns.weightCategory,
	fiber: yarns.fiber,
	yardsPerSkein: yarns.yardsPerSkein,
	gramsPerSkein: yarns.gramsPerSkein,
	skeins: yarns.skeins,
	photoPath: yarns.photoPath,
	notes: yarns.notes
};

const projectFields = {
	id: projects.id,
	ownerId: projects.ownerId,
	title: projects.title,
	patternId: projects.patternId,
	status: projects.status,
	progressPct: projects.progressPct,
	currentRow: projects.currentRow,
	totalRows: projects.totalRows,
	deadline: projects.deadline,
	timeSpentMinutes: projects.timeSpentMinutes,
	notes: projects.notes
};

// Under way: cast on ("monte") or on hold ("bloque"), mine or shared with me.
export function projectsInProgressQuery(uid: string, limit: number) {
	return db
		.select(projectFields)
		.from(projects)
		.where(and(visibleTo(uid, 'project', projects.ownerId, projects.id), inArray(projects.status, ['monte', 'bloque'])))
		.orderBy(desc(projects.updatedAt))
		.limit(limit);
}

async function semanticPatterns(uid: string, text: string, limit: number): Promise<PatternHit[]> {
	if (!aiConfigured()) return [];
	try {
		await ensureEmbeddingScheme();
		const vec = await embed(text, 'query');
		const rows = await patternVectorQuery(uid, vec, limit);
		return rows.filter((r) => 1 - r.distance >= MIN_SIMILARITY).map(({ distance: _d, ...hit }) => hit);
	} catch {
		return []; // embedding model missing or busy: the text search still answers
	}
}

export const dbData: AssistantData = {
	access: accessFor,

	async findPatterns(uid, text, limit) {
		const [semantic, literal] = await Promise.all([semanticPatterns(uid, text, limit), patternTextQuery(uid, text, limit)]);
		const seen = new Set<string>();
		return [...semantic, ...literal].filter((p) => !seen.has(p.id) && seen.add(p.id)).slice(0, limit);
	},

	async getPattern(id) {
		const row = (
			await db
				.select({
					id: patterns.id,
					ownerId: patterns.ownerId,
					isShared: patterns.isShared,
					title: patterns.title,
					craft: patterns.craft,
					garmentType: patterns.garmentType,
					designer: patterns.designer,
					language: patterns.language,
					difficulty: patterns.difficulty,
					sizes: patterns.sizes,
					gaugeStitches: patterns.gaugeStitches,
					gaugeRows: patterns.gaugeRows,
					yardageRequired: patterns.yardageRequired,
					tags: patterns.tags,
					notes: patterns.notes,
					coverPath: patterns.coverPath,
					extractedText: patterns.extractedText
				})
				.from(patterns)
				.where(eq(patterns.id, id))
				.limit(1)
		)[0];
		return row ?? null;
	},

	getPatternPieces(patternId) {
		return db
			.select({ name: patternPieces.name, defaultTotalRows: patternPieces.defaultTotalRows, quantity: patternPieces.quantity })
			.from(patternPieces)
			.where(eq(patternPieces.patternId, patternId))
			.orderBy(asc(patternPieces.position));
	},

	findYarns: (uid, filter, limit) => yarnQuery(uid, filter, limit),

	async getYarn(id) {
		return (await db.select(yarnFields).from(yarns).where(eq(yarns.id, id)).limit(1))[0] ?? null;
	},

	async getProject(id) {
		return (await db.select(projectFields).from(projects).where(eq(projects.id, id)).limit(1))[0] ?? null;
	},

	async getProjectDetail(project) {
		const [pattern, pieces, used] = await Promise.all([
			project.patternId
				? db
						.select({ id: patterns.id, title: patterns.title, craft: patterns.craft })
						.from(patterns)
						.where(eq(patterns.id, project.patternId))
						.limit(1)
						.then((r) => r[0] ?? null)
				: Promise.resolve(null),
			project.patternId
				? db
						.select({
							name: patternPieces.name,
							completed: sql<boolean>`coalesce(${projectPieceProgress.completed}, false)`,
							status: projectPieceProgress.status,
							currentRow: sql<number>`coalesce(${projectPieceProgress.currentRow}, 0)`,
							totalRows: sql<number | null>`coalesce(${projectPieceProgress.totalRows}, ${patternPieces.defaultTotalRows})`
						})
						.from(patternPieces)
						.leftJoin(
							projectPieceProgress,
							and(eq(projectPieceProgress.pieceId, patternPieces.id), eq(projectPieceProgress.projectId, project.id))
						)
						.where(eq(patternPieces.patternId, project.patternId))
						.orderBy(asc(patternPieces.position))
				: Promise.resolve([]),
			db
				.select({ brand: yarns.brand, name: yarns.name, colorway: yarns.colorway, skeinsUsed: projectYarns.skeinsUsed })
				.from(projectYarns)
				.leftJoin(yarns, eq(projectYarns.yarnId, yarns.id))
				.where(eq(projectYarns.projectId, project.id))
		]);
		return { pattern, pieces, yarns: used };
	},

	projectsInProgress: (uid, limit) => projectsInProgressQuery(uid, limit),

	async appendProjectNote(id, note) {
		// Appended in SQL so a note typed on the project page at the same moment
		// is not overwritten by a stale read.
		await db
			.update(projects)
			.set({
				notes: sql`case when coalesce(${projects.notes}, '') = '' then ${note} else ${projects.notes} || E'\n\n' || ${note} end`,
				updatedAt: new Date()
			})
			.where(eq(projects.id, id));
	}
};
