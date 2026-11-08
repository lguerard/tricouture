// Database side of the assistant's domain tools (tools/*.ts): everything a
// person can do on the pages, for the assistant to do on their behalf.
//
// Scoping: owner-only resources (stash, goals, bins, recipients, mood boards,
// patches, tag colours) are scoped IN SQL on `uid` -- a miss returns null /
// false, which the tool answers as "introuvable". Patterns and projects are
// looked up with AssistantData and their access checked in the tools, like
// the base tools; the functions here that take one trust that check.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import {
	embroideryDesigns,
	fabrics,
	goals,
	moodBoards,
	moodItems,
	notions,
	paceLogs,
	patternPieces,
	patterns,
	projectFabrics,
	projects,
	projectYarns,
	recipients,
	storageBins,
	tools,
	yarns,
	type Craft
} from '$lib/server/db/schema';
import { listShares, revokeShare, shareableUsers, upsertShare, type ShareRole } from '$lib/server/access';
import { deleteStored } from '$lib/server/storage';
import { aiConfigured } from '$lib/server/ai/ollama';
import { embedDocument, patternEmbeddingText, yarnEmbeddingText } from '$lib/server/embeddings';
import { computeStats } from '$lib/server/stats';
import { syncAchievements } from '$lib/server/achievements';
import { clearTagColorOverride, setTagColorOverride } from '$lib/server/tagColorOverrides';
import { filesOf } from '$lib/server/embroidery';
import * as projectSvc from '$lib/server/services/projects';
import * as patternSvc from '$lib/server/services/patterns';
import type { InfoLanguage } from '$lib/server/ai/patternInfo';
import { likePattern, searchWords } from './data';

export type StockKind = 'laine' | 'tissu' | 'mercerie' | 'outil';
export const TOOL_TYPES = ['aiguille_droite', 'aiguille_circulaire', 'aiguille_double_pointe', 'crochet', 'autre'] as const;
export type ToolType = (typeof TOOL_TYPES)[number];

// Fields per kind of stash item, with the column names of their table.
export type StockFields = {
	laine: Partial<{
		brand: string | null;
		name: string | null;
		colorway: string | null;
		colorHex: string | null;
		dyeLot: string | null;
		weightCategory: string | null;
		fiber: string | null;
		yardsPerSkein: number | null;
		gramsPerSkein: number | null;
		skeins: number;
		notes: string | null;
		binId: string | null;
	}>;
	tissu: Partial<{
		name: string | null;
		fabricType: string | null;
		composition: string | null;
		colorHex: string | null;
		lengthCm: number | null;
		widthCm: number | null;
		notes: string | null;
		binId: string | null;
	}>;
	mercerie: Partial<{ name: string; category: string | null; quantity: number; notes: string | null; binId: string | null }>;
	outil: Partial<{
		type: ToolType;
		sizeMm: number | null;
		lengthCm: number | null;
		quantity: number;
		notes: string | null;
		binId: string | null;
	}>;
};

export type StockItem = { id: string; kind: StockKind; label: string; details: Record<string, unknown> };

export type ProjectEdit = {
	title?: string;
	status?: 'idee' | 'monte' | 'bloque' | 'fini';
	currentRow?: number;
	totalRows?: number | null;
	progressPct?: number;
	deadline?: string | null;
	location?: string | null;
	costCents?: number;
	retailPriceCents?: number | null;
	recipientId?: string | null;
	// Logged like the page's "time spent" form: minutes added, rows done then.
	addMinutes?: number;
	rowsDone?: number;
};

export type Person = { id: string; name: string };
export type ShareTarget = { type: 'pattern' | 'project'; id: string; ownerId: string };

const STOCK_TABLE = { laine: yarns, tissu: fabrics, mercerie: notions, outil: tools } as const;

const yarnLabel = (y: { brand: string | null; name: string | null; colorway: string | null }) =>
	[y.brand, y.name].filter(Boolean).join(' ') || y.colorway || 'Laine';
const fabricLabel = (f: { name: string | null; fabricType: string | null }) => f.name || f.fabricType || 'Tissu';
const toolLabel = (t: { type: string; sizeMm: number | null }) =>
	`${t.type.replace(/_/g, ' ')}${t.sizeMm ? ` ${t.sizeMm} mm` : ''}`;

function stockItem(kind: StockKind, row: Record<string, unknown>): StockItem {
	const { id, ownerId: _o, photoPath: _p, embedding: _e, createdAt: _c, inUseProjectId: _u, ...rest } = row;
	const label =
		kind === 'laine'
			? yarnLabel(row as never)
			: kind === 'tissu'
				? fabricLabel(row as never)
				: kind === 'outil'
					? toolLabel(row as never)
					: String(row.name);
	return { id: String(id), kind, label, details: rest };
}

// Words of `text` matched (ILIKE) against any of `cols`.
function textMatch(text: string | undefined, cols: unknown[]): SQL | undefined {
	if (!text?.trim()) return undefined;
	const words = searchWords(text);
	const terms = (words.length ? words : [text.trim()]).map(likePattern);
	return or(...terms.flatMap((like) => (cols as never[]).map((c) => ilike(c, like))));
}

// Case- and accent-insensitive key, to match names given by the model.
export const nameKey = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.trim();

async function embedPattern(id: string) {
	if (!aiConfigured()) return;
	const [row] = await db.select().from(patterns).where(eq(patterns.id, id)).limit(1);
	if (!row) return;
	try {
		await db.update(patterns).set({ embedding: await embedDocument(patternEmbeddingText(row)) }).where(eq(patterns.id, id));
	} catch {
		/* embedding model missing or busy: the text search still finds it */
	}
}

async function embedYarn(id: string) {
	if (!aiConfigured()) return;
	const [row] = await db.select().from(yarns).where(eq(yarns.id, id)).limit(1);
	const text = row && yarnEmbeddingText(row);
	if (!text) return;
	try {
		await db.update(yarns).set({ embedding: await embedDocument(text) }).where(eq(yarns.id, id));
	} catch {
		/* same */
	}
}

export const dbActions = {
	// --- Patterns -------------------------------------------------------------

	async createPattern(
		uid: string,
		p: { title: string; craft: Craft; designer?: string; garmentType?: string; source?: string; notes?: string; text?: string; tags?: string[] }
	): Promise<string> {
		const [row] = await db
			.insert(patterns)
			.values({
				ownerId: uid,
				title: p.title,
				craft: p.craft,
				designer: p.designer ?? null,
				garmentType: p.garmentType ?? null,
				source: p.source ?? null,
				notes: p.notes ?? null,
				// A pattern written in the chat is searchable and readable like
				// a PDF's text.
				extractedText: p.text ?? null,
				tags: p.tags ?? []
			})
			.returning({ id: patterns.id });
		await embedPattern(row.id);
		return row.id;
	},

	async editPatternText(id: string, patch: { notes?: string | null; text?: string | null; source?: string | null; craft?: Craft; language?: string | null }) {
		const set: Record<string, unknown> = { updatedAt: new Date() };
		if (patch.notes !== undefined) set.notes = patch.notes;
		if (patch.text !== undefined) set.extractedText = patch.text;
		if (patch.source !== undefined) set.source = patch.source;
		if (patch.craft !== undefined) set.craft = patch.craft;
		if (patch.language !== undefined) set.language = patch.language;
		await db.update(patterns).set(set).where(eq(patterns.id, id));
		await embedPattern(id);
	},

	deletePattern: (p: { id: string; coverPath: string | null }) => patternSvc.deletePattern(p),

	async setPatternPublic(id: string, isShared: boolean) {
		await db.update(patterns).set({ isShared, updatedAt: new Date() }).where(eq(patterns.id, id));
	},

	setCoverFromUrl: (uid: string, p: { id: string; coverPath: string | null }, url: string) => patternSvc.setCoverFromUrl(uid, p, url),
	removeCover: (p: { id: string; coverPath: string | null }) => patternSvc.removeCover(p),
	readPatternPage: (url: string) => patternSvc.readPatternPage(url),
	detectPieces: (p: { id: string; title: string; notes: string | null; extractedText: string | null; craft: string }) => patternSvc.detectPieces(p),
	fillPatternInfo: (uid: string, id: string, language: InfoLanguage) => patternSvc.fillPatternInfo(uid, id, language),

	async listPieces(patternId: string) {
		return db
			.select({ id: patternPieces.id, name: patternPieces.name, rows: patternPieces.defaultTotalRows, quantity: patternPieces.quantity })
			.from(patternPieces)
			.where(eq(patternPieces.patternId, patternId))
			.orderBy(asc(patternPieces.position));
	},

	async addPiece(patternId: string, name: string, rows: number | null, quantity: number | null) {
		const [{ n }] = await db
			.select({ n: sql<number>`count(*)::int` })
			.from(patternPieces)
			.where(eq(patternPieces.patternId, patternId));
		await db.insert(patternPieces).values({ patternId, name, position: n, defaultTotalRows: rows, quantity });
	},

	async updatePiece(pieceId: string, patch: { name?: string; defaultTotalRows?: number | null; quantity?: number | null }) {
		await db.update(patternPieces).set(patch).where(eq(patternPieces.id, pieceId));
	},

	async removePiece(pieceId: string) {
		await db.delete(patternPieces).where(eq(patternPieces.id, pieceId));
	},

	// --- Projects -------------------------------------------------------------

	async editProject(id: string, e: ProjectEdit) {
		const [p] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
		if (!p) return;
		const status = e.status ?? p.status;
		const currentRow = e.currentRow ?? p.currentRow;
		const totalRows = e.totalRows !== undefined ? e.totalRows : p.totalRows;
		const progressPct =
			e.progressPct ??
			(status === 'fini' ? 100 : totalRows && totalRows > 0 ? Math.max(0, Math.min(100, Math.round((currentRow / totalRows) * 100))) : p.progressPct);
		const set: Record<string, unknown> = {
			status,
			currentRow,
			totalRows,
			progressPct,
			// Same rule as the project page: finishing dates it, reopening clears it.
			finishedAt: status === 'fini' ? (p.finishedAt ?? new Date()) : null,
			timeSpentMinutes: p.timeSpentMinutes + (e.addMinutes ?? 0),
			updatedAt: new Date()
		};
		for (const k of ['title', 'deadline', 'location', 'costCents', 'retailPriceCents', 'recipientId'] as const) {
			if (e[k] !== undefined) set[k] = e[k];
		}
		await db.update(projects).set(set).where(eq(projects.id, id));
		if (e.addMinutes) await db.insert(paceLogs).values({ projectId: id, rowsDone: e.rowsDone ?? 0, minutes: e.addMinutes });
	},

	deleteProject: (id: string) => projectSvc.deleteProject(id),

	setPieceCompleted: projectSvc.setPieceCompleted,
	setPieceProgress: projectSvc.upsertPieceProgress,
	stepPieceRow: projectSvc.stepPieceRow,

	useYarn: projectSvc.useYarn,
	useFabric: projectSvc.useFabric,

	// Undoes what was logged for this yarn / fabric on the project (all of it).
	async returnYarn(uid: string, projectId: string, yarnId: string) {
		const [link] = await db
			.select({ id: projectYarns.id })
			.from(projectYarns)
			.where(and(eq(projectYarns.projectId, projectId), eq(projectYarns.yarnId, yarnId)))
			.limit(1);
		return link ? projectSvc.returnYarn(uid, projectId, link.id) : false;
	},

	async returnFabric(uid: string, projectId: string, fabricId: string) {
		const [link] = await db
			.select({ id: projectFabrics.id })
			.from(projectFabrics)
			.where(and(eq(projectFabrics.projectId, projectId), eq(projectFabrics.fabricId, fabricId)))
			.limit(1);
		return link ? projectSvc.returnFabric(uid, projectId, link.id) : false;
	},

	async createProject(uid: string, p: { title: string; patternId: string | null; status: 'idee' | 'monte' | 'bloque' | 'fini'; deadline?: string | null }) {
		// At the end of its board column, like projects/new.
		const maxPos =
			(
				await db
					.select({ m: sql<number>`coalesce(max(${projects.boardPosition}), -1)::int` })
					.from(projects)
					.where(eq(projects.ownerId, uid))
			)[0]?.m ?? -1;
		const [row] = await db
			.insert(projects)
			.values({
				ownerId: uid,
				title: p.title,
				patternId: p.patternId,
				status: p.status,
				deadline: p.deadline ?? null,
				boardPosition: maxPos + 1,
				...(p.status === 'fini' ? { finishedAt: new Date(), progressPct: 100 } : {})
			})
			.returning({ id: projects.id });
		return row.id;
	},

	// --- Sharing (owner only, checked by the caller) ---------------------------

	// The account a name or e-mail designates; 'ambiguous' when several match.
	async findPerson(uid: string, who: string): Promise<Person | 'ambiguous' | null> {
		const k = nameKey(who);
		const people = (await shareableUsers(uid)).map((u) => ({ id: u.id, name: u.displayName, email: u.email.toLowerCase() }));
		const exact = people.filter((p) => p.email === k || nameKey(p.name) === k);
		const hits = exact.length ? exact : people.filter((p) => nameKey(p.name).includes(k) || p.email.startsWith(k));
		if (hits.length > 1) return 'ambiguous';
		return hits[0] ? { id: hits[0].id, name: hits[0].name } : null;
	},

	async share(t: ShareTarget, person: Person, role: ShareRole | null) {
		if (role) await upsertShare(t.ownerId, t.type, t.id, person.id, role);
		else await revokeShare(t.type, t.id, person.id);
	},

	async sharesOf(t: ShareTarget) {
		return (await listShares(t.type, t.id)).map((s) => ({ nom: s.displayName, role: s.role }));
	},

	// --- Stash ----------------------------------------------------------------

	async listStock(uid: string, kind: StockKind, text: string | undefined, limit: number): Promise<StockItem[]> {
		const cols = {
			laine: [yarns.brand, yarns.name, yarns.colorway, yarns.fiber, yarns.weightCategory, yarns.notes],
			tissu: [fabrics.name, fabrics.fabricType, fabrics.composition, fabrics.notes],
			mercerie: [notions.name, notions.category, notions.notes],
			outil: [sql`${tools.type}::text`, tools.notes]
		}[kind];
		const table = STOCK_TABLE[kind];
		const rows = await db
			.select()
			.from(table)
			.where(and(eq(table.ownerId, uid), textMatch(text, cols)))
			.orderBy(desc(table.createdAt))
			.limit(limit);
		return rows.map((r) => stockItem(kind, r as Record<string, unknown>));
	},

	async getStock(uid: string, kind: StockKind, id: string): Promise<StockItem | null> {
		const table = STOCK_TABLE[kind];
		const [row] = await db.select().from(table).where(and(eq(table.id, id), eq(table.ownerId, uid))).limit(1);
		return row ? stockItem(kind, row as Record<string, unknown>) : null;
	},

	async addStock<K extends StockKind>(uid: string, kind: K, fields: StockFields[K]): Promise<StockItem> {
		const table = STOCK_TABLE[kind];
		const [row] = await db
			.insert(table)
			.values({ ...(fields as object), ownerId: uid } as never)
			.returning();
		if (kind === 'laine') await embedYarn((row as { id: string }).id);
		return stockItem(kind, row as Record<string, unknown>);
	},

	async updateStock<K extends StockKind>(uid: string, kind: K, id: string, fields: StockFields[K]): Promise<StockItem | null> {
		const table = STOCK_TABLE[kind];
		const [row] = await db
			.update(table)
			.set(fields as never)
			.where(and(eq(table.id, id), eq(table.ownerId, uid)))
			.returning();
		if (row && kind === 'laine') await embedYarn(id);
		return row ? stockItem(kind, row as Record<string, unknown>) : null;
	},

	async deleteStock(uid: string, kind: StockKind, id: string): Promise<StockItem | null> {
		const table = STOCK_TABLE[kind];
		const [row] = await db
			.delete(table)
			.where(and(eq(table.id, id), eq(table.ownerId, uid)))
			.returning();
		if (!row) return null;
		const photo = (row as { photoPath: string | null }).photoPath;
		if (photo) await deleteStored(photo);
		return stockItem(kind, row as Record<string, unknown>);
	},

	// --- Goals ----------------------------------------------------------------

	listGoals: (uid: string) =>
		db
			.select({ id: goals.id, title: goals.title, kind: goals.kind, current: goals.currentValue, target: goals.targetValue, start: goals.periodStart, end: goals.periodEnd })
			.from(goals)
			.where(eq(goals.ownerId, uid))
			.orderBy(desc(goals.createdAt)),

	async createGoal(uid: string, g: { title: string; kind: string; target: number; start: string | null; end: string | null }) {
		const [row] = await db
			.insert(goals)
			.values({ ownerId: uid, title: g.title, kind: g.kind, targetValue: g.target, periodStart: g.start, periodEnd: g.end })
			.returning({ id: goals.id });
		return row.id;
	},

	async stepGoal(uid: string, id: string, delta: number) {
		const [row] = await db
			.update(goals)
			.set({ currentValue: sql`greatest(0, ${goals.currentValue} + ${delta})` })
			.where(and(eq(goals.id, id), eq(goals.ownerId, uid)))
			.returning({ title: goals.title, current: goals.currentValue, target: goals.targetValue });
		return row ?? null;
	},

	async deleteGoal(uid: string, id: string) {
		const [row] = await db.delete(goals).where(and(eq(goals.id, id), eq(goals.ownerId, uid))).returning({ title: goals.title });
		return row?.title ?? null;
	},

	// --- Storage bins -----------------------------------------------------------

	listBins: (uid: string) =>
		db
			.select({ id: storageBins.id, label: storageBins.label, location: storageBins.location })
			.from(storageBins)
			.where(eq(storageBins.ownerId, uid))
			.orderBy(desc(storageBins.createdAt)),

	async createBin(uid: string, label: string, location: string | null) {
		const [row] = await db
			.insert(storageBins)
			.values({ ownerId: uid, label, location, qrCode: randomUUID().slice(0, 12) })
			.returning({ id: storageBins.id });
		return row.id;
	},

	async ownsBin(uid: string, id: string) {
		return (await db.select({ id: storageBins.id }).from(storageBins).where(and(eq(storageBins.id, id), eq(storageBins.ownerId, uid))).limit(1)).length > 0;
	},

	async deleteBin(uid: string, id: string) {
		const [row] = await db
			.delete(storageBins)
			.where(and(eq(storageBins.id, id), eq(storageBins.ownerId, uid)))
			.returning({ label: storageBins.label });
		if (!row) return null;
		// Items stored in it stay in the stash, just no longer in a bin.
		for (const table of Object.values(STOCK_TABLE)) {
			await db.update(table).set({ binId: null }).where(and(eq(table.ownerId, uid), eq(table.binId, id)));
		}
		return row.label;
	},

	// --- Recipients -----------------------------------------------------------

	listRecipients: (uid: string) =>
		db
			.select({ id: recipients.id, name: recipients.name, colors: recipients.favoriteColors, allergies: recipients.fiberAllergies, notes: recipients.notes })
			.from(recipients)
			.where(eq(recipients.ownerId, uid))
			.orderBy(desc(recipients.createdAt)),

	async createRecipient(uid: string, r: { name: string; colors: string[]; allergies: string | null; notes: string | null }) {
		const [row] = await db
			.insert(recipients)
			.values({ ownerId: uid, name: r.name, favoriteColors: r.colors, fiberAllergies: r.allergies, notes: r.notes })
			.returning({ id: recipients.id });
		return row.id;
	},

	async updateRecipient(uid: string, id: string, r: Partial<{ name: string; favoriteColors: string[]; fiberAllergies: string | null; notes: string | null }>) {
		const [row] = await db
			.update(recipients)
			.set(r)
			.where(and(eq(recipients.id, id), eq(recipients.ownerId, uid)))
			.returning({ name: recipients.name });
		return row?.name ?? null;
	},

	async ownsRecipient(uid: string, id: string) {
		return (await db.select({ id: recipients.id }).from(recipients).where(and(eq(recipients.id, id), eq(recipients.ownerId, uid))).limit(1)).length > 0;
	},

	async deleteRecipient(uid: string, id: string) {
		const [row] = await db
			.delete(recipients)
			.where(and(eq(recipients.id, id), eq(recipients.ownerId, uid)))
			.returning({ name: recipients.name });
		return row?.name ?? null;
	},

	// --- Mood boards ------------------------------------------------------------

	async listBoards(uid: string) {
		const boards = await db.select({ id: moodBoards.id, title: moodBoards.title }).from(moodBoards).where(eq(moodBoards.ownerId, uid)).orderBy(desc(moodBoards.createdAt));
		const counts = await db
			.select({ boardId: moodItems.boardId, n: sql<number>`count(*)::int` })
			.from(moodItems)
			.innerJoin(moodBoards, eq(moodBoards.id, moodItems.boardId))
			.where(eq(moodBoards.ownerId, uid))
			.groupBy(moodItems.boardId);
		return boards.map((b) => ({ ...b, items: counts.find((c) => c.boardId === b.id)?.n ?? 0 }));
	},

	async boardItems(uid: string, boardId: string) {
		const [board] = await db.select().from(moodBoards).where(and(eq(moodBoards.id, boardId), eq(moodBoards.ownerId, uid))).limit(1);
		if (!board) return null;
		const items = await db
			.select({ id: moodItems.id, note: moodItems.note, url: moodItems.sourceUrl, image: moodItems.imagePath, palette: moodItems.palette })
			.from(moodItems)
			.where(eq(moodItems.boardId, board.id))
			.orderBy(desc(moodItems.createdAt));
		return { title: board.title, items };
	},

	async createBoard(uid: string, title: string) {
		const [row] = await db.insert(moodBoards).values({ ownerId: uid, title }).returning({ id: moodBoards.id });
		return row.id;
	},

	async renameBoard(uid: string, id: string, title: string) {
		const [row] = await db
			.update(moodBoards)
			.set({ title })
			.where(and(eq(moodBoards.id, id), eq(moodBoards.ownerId, uid)))
			.returning({ title: moodBoards.title });
		return row?.title ?? null;
	},

	async deleteBoard(uid: string, id: string) {
		const [board] = await db.select().from(moodBoards).where(and(eq(moodBoards.id, id), eq(moodBoards.ownerId, uid))).limit(1);
		if (!board) return null;
		const images = await db.select({ path: moodItems.imagePath }).from(moodItems).where(eq(moodItems.boardId, board.id));
		await db.delete(moodBoards).where(eq(moodBoards.id, board.id));
		for (const img of images) if (img.path) await deleteStored(img.path);
		return board.title;
	},

	async addBoardItem(uid: string, boardId: string, item: { note: string | null; url: string | null }) {
		const [board] = await db.select({ id: moodBoards.id, title: moodBoards.title }).from(moodBoards).where(and(eq(moodBoards.id, boardId), eq(moodBoards.ownerId, uid))).limit(1);
		if (!board) return null;
		await db.insert(moodItems).values({ boardId: board.id, note: item.note, sourceUrl: item.url });
		return board.title;
	},

	async deleteBoardItem(uid: string, boardId: string, itemId: string) {
		const [board] = await db.select({ id: moodBoards.id }).from(moodBoards).where(and(eq(moodBoards.id, boardId), eq(moodBoards.ownerId, uid))).limit(1);
		if (!board) return false;
		const [item] = await db
			.delete(moodItems)
			.where(and(eq(moodItems.id, itemId), eq(moodItems.boardId, board.id)))
			.returning({ imagePath: moodItems.imagePath });
		if (item?.imagePath) await deleteStored(item.imagePath);
		return !!item;
	},

	// --- Tag colours ------------------------------------------------------------

	async setTagColor(uid: string, tag: string, colors: { bg: string; fg: string } | null) {
		if (colors) await setTagColorOverride(uid, tag, colors);
		else await clearTagColorOverride(uid, tag);
	},

	// --- Patches (Écussons) -----------------------------------------------------

	listPatches: (uid: string, text: string | undefined) =>
		db
			.select({ id: embroideryDesigns.id, title: embroideryDesigns.title, source: embroideryDesigns.source, w: embroideryDesigns.widthMm, h: embroideryDesigns.heightMm, stitches: embroideryDesigns.stitchCount })
			.from(embroideryDesigns)
			.where(and(eq(embroideryDesigns.ownerId, uid), text?.trim() ? ilike(embroideryDesigns.title, likePattern(text.trim())) : undefined))
			.orderBy(desc(embroideryDesigns.updatedAt))
			.limit(20),

	async renamePatch(uid: string, id: string, title: string) {
		const [row] = await db
			.update(embroideryDesigns)
			.set({ title, updatedAt: new Date() })
			.where(and(eq(embroideryDesigns.id, id), eq(embroideryDesigns.ownerId, uid)))
			.returning({ title: embroideryDesigns.title });
		return row?.title ?? null;
	},

	async deletePatch(uid: string, id: string) {
		const [row] = await db
			.delete(embroideryDesigns)
			.where(and(eq(embroideryDesigns.id, id), eq(embroideryDesigns.ownerId, uid)))
			.returning();
		if (!row) return null;
		await Promise.all(filesOf(row).map(deleteStored));
		return row.title;
	},

	// --- Overview ---------------------------------------------------------------

	stats: (uid: string) => computeStats(uid),
	achievements: (uid: string) => syncAchievements(uid)
};

export type AssistantActions = typeof dbActions;
