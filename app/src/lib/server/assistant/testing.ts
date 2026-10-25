// In-memory AssistantData for the tests: two accounts, alice and bob, each
// with their own library, and a `shares` list. Lookups by id return ANY row
// (like the real ones): the access checks in tools.ts must do the scoping.
import type { Access, ResourceType } from '$lib/server/access';
import type { AssistantData, PatternRecord, ProjectRecord, YarnRecord } from './data';

export const ALICE = '00000000-0000-4000-8000-00000000000a';
export const BOB = '00000000-0000-4000-8000-00000000000b';
export const ALICE_PATTERN = '10000000-0000-4000-8000-000000000001';
export const BOB_PATTERN = '10000000-0000-4000-8000-000000000002';
export const BOB_PUBLIC_PATTERN = '10000000-0000-4000-8000-000000000003';
export const ALICE_PROJECT = '20000000-0000-4000-8000-000000000001';
export const BOB_PROJECT = '20000000-0000-4000-8000-000000000002';
export const ALICE_YARN = '30000000-0000-4000-8000-000000000001';
export const BOB_YARN = '30000000-0000-4000-8000-000000000002';

const pattern = (id: string, ownerId: string, title: string, extra: Partial<PatternRecord> = {}): PatternRecord => ({
	id,
	ownerId,
	isShared: false,
	title,
	craft: 'tricot',
	garmentType: 'pull',
	designer: null,
	language: 'fr',
	difficulty: null,
	sizes: 'S-XL',
	gaugeStitches: 22,
	gaugeRows: 30,
	yardageRequired: 1200,
	tags: ['hiver'],
	notes: null,
	coverPath: null,
	extractedText: null,
	...extra
});

const project = (id: string, ownerId: string, title: string, extra: Partial<ProjectRecord> = {}): ProjectRecord => ({
	id,
	ownerId,
	title,
	patternId: null,
	status: 'monte',
	progressPct: 40,
	currentRow: 42,
	totalRows: 120,
	deadline: null,
	timeSpentMinutes: 0,
	notes: null,
	...extra
});

const yarn = (id: string, ownerId: string, name: string): YarnRecord => ({
	id,
	ownerId,
	brand: 'Drops',
	name,
	colorway: 'bleu nuit',
	weightCategory: 'DK',
	fiber: 'mérinos',
	yardsPerSkein: 110,
	gramsPerSkein: 50,
	skeins: 6,
	photoPath: null,
	notes: null
});

export function fakeData() {
	const patterns = [
		pattern(ALICE_PATTERN, ALICE, 'Pull Aran', {
			extractedText: 'Dos : monter 100 m. Tricoter 40 cm. Manches : monter 48 m, augmenter tous les 8 rangs.'
		}),
		pattern(BOB_PATTERN, BOB, 'Secret de Bob', { extractedText: 'texte privé de bob' }),
		pattern(BOB_PUBLIC_PATTERN, BOB, 'Bonnet public', { isShared: true })
	];
	const projects = [
		project(ALICE_PROJECT, ALICE, 'Mon pull', { patternId: ALICE_PATTERN }),
		project(BOB_PROJECT, BOB, 'Projet de Bob')
	];
	const yarns = [yarn(ALICE_YARN, ALICE, 'Merino Extra Fine'), yarn(BOB_YARN, BOB, 'Laine de Bob')];
	const shares: { type: ResourceType; id: string; userId: string; role: 'view' | 'edit' }[] = [];
	const notes: { id: string; note: string }[] = [];

	const data: AssistantData = {
		async access(uid, type, id, ownerId): Promise<Access> {
			if (uid === ownerId) return 'owner';
			return shares.find((s) => s.type === type && s.id === id && s.userId === uid)?.role ?? null;
		},
		async findPatterns(uid, text) {
			return patterns.filter((p) => (p.ownerId === uid || p.isShared) && p.title.toLowerCase().includes(text.toLowerCase().split(' ')[0]));
		},
		async getPattern(id) {
			return patterns.find((p) => p.id === id) ?? null;
		},
		async getPatternPieces(patternId) {
			return patternId === ALICE_PATTERN ? [{ name: 'Dos', defaultTotalRows: 120, quantity: null }] : [];
		},
		async findYarns(uid) {
			return yarns.filter((y) => y.ownerId === uid);
		},
		async getYarn(id) {
			return yarns.find((y) => y.id === id) ?? null;
		},
		async getProject(id) {
			return projects.find((p) => p.id === id) ?? null;
		},
		async getProjectDetail(p) {
			return {
				pattern: p.patternId ? { id: p.patternId, title: 'Pull Aran', craft: 'tricot' } : null,
				pieces: [{ name: 'Dos', completed: false, status: null, currentRow: 42, totalRows: 120 }],
				yarns: []
			};
		},
		async projectsInProgress(uid) {
			return projects.filter((p) => p.ownerId === uid);
		},
		async appendProjectNote(id, note) {
			notes.push({ id, note });
		}
	};
	return { data, shares, notes, patterns, projects, yarns };
}
