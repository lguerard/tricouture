import { describe, expect, it, vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({ env: {} }));

// The SQL itself, without a database: the searches must carry the account's
// scope, exactly like the pages' own lists.
const D = await import('./data');
const UID = '00000000-0000-4000-8000-00000000000a';

describe('search scoping (SQL)', () => {
	it('patterns: mine, shared with me, or public', () => {
		for (const q of [D.patternTextQuery(UID, 'pull chaud', 6), D.patternVectorQuery(UID, [0.1, 0.2], 6)]) {
			const { sql, params } = q.toSQL();
			expect(sql).toMatch(/"patterns"\."owner_id" = \$\d+/);
			expect(sql).toMatch(/"shares"/);
			expect(sql).toMatch(/"patterns"\."is_shared" = \$\d+/);
			expect(params).toContain(UID);
			expect(params).toContain('pattern');
		}
	});

	it('yarns: mine only, each filter escaped', () => {
		const { sql, params } = D.yarnQuery(UID, { text: 'laine douce', color: 'bleu', fiber: '100%_mérinos', weight: 'DK' }, 8).toSQL();
		expect(sql).toMatch(/"yarns"\."owner_id" = \$\d+/);
		expect(sql).not.toMatch(/"shares"/);
		expect(params).toContain(UID);
		expect(params).toContain('%bleu%');
		expect(params).toContain('%DK%');
		expect(params).toContain('%100\\%\\_mérinos%');
		expect(params).toContain('%douce%');
	});

	it('projects in progress: mine or shared with me', () => {
		const { sql, params } = D.projectsInProgressQuery(UID, 10).toSQL();
		expect(sql).toMatch(/"projects"\."owner_id" = \$\d+/);
		expect(sql).toMatch(/"shares"/);
		expect(params).toEqual(expect.arrayContaining([UID, 'project', 'monte', 'bloque']));
	});

	it('splits a search into words', () => {
		expect(D.searchWords('Un pull CHAUD, un pull !')).toEqual(['pull', 'chaud']);
	});
});
