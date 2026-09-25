import { json } from '@sveltejs/kit';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { fabrics, notions, patterns, projects, yarns } from '$lib/server/db/schema';
import { visibleTo } from '$lib/server/access';
import type { RequestHandler } from './$types';

export type SearchHit = {
	kind: 'pattern' | 'project' | 'yarn' | 'fabric' | 'notion';
	id: string;
	title: string;
	subtitle?: string;
	href: string;
	image?: string | null;
};

// `%` and `_` typed by the person are literal characters, not wildcards.
function likePattern(q: string): string {
	return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Global search (Ctrl+K). Same visibility rules as each section's own list:
// patterns mine/shared/public, projects mine/shared with me, stash mine only.
export const GET: RequestHandler = async ({ url, locals }) => {
	const uid = locals.user?.id;
	if (!uid) return json({ hits: [] }, { status: 401 });
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	if (q.length < 2) return json({ hits: [] });
	const like = likePattern(q);

	const [pats, projs, yarnRows, fabricRows, notionRows] = await Promise.all([
		db
			.select({
				id: patterns.id,
				title: patterns.title,
				designer: patterns.designer,
				garmentType: patterns.garmentType,
				coverPath: patterns.coverPath
			})
			.from(patterns)
			.where(
				and(
					or(visibleTo(uid, 'pattern', patterns.ownerId, patterns.id), eq(patterns.isShared, true)),
					or(
						ilike(patterns.title, like),
						ilike(patterns.designer, like),
						ilike(patterns.garmentType, like),
						sql`exists (select 1 from jsonb_array_elements_text(${patterns.tags}) as tag where tag ilike ${like})`
					)
				)
			)
			.orderBy(desc(patterns.updatedAt))
			.limit(6),
		db
			.select({ id: projects.id, title: projects.title, status: projects.status })
			.from(projects)
			.where(and(visibleTo(uid, 'project', projects.ownerId, projects.id), ilike(projects.title, like)))
			.orderBy(desc(projects.updatedAt))
			.limit(5),
		db
			.select({ id: yarns.id, brand: yarns.brand, name: yarns.name, colorway: yarns.colorway, photoPath: yarns.photoPath })
			.from(yarns)
			.where(
				and(
					eq(yarns.ownerId, uid),
					or(ilike(yarns.brand, like), ilike(yarns.name, like), ilike(yarns.colorway, like), ilike(yarns.fiber, like))
				)
			)
			.limit(4),
		db
			.select({ id: fabrics.id, name: fabrics.name, fabricType: fabrics.fabricType, photoPath: fabrics.photoPath })
			.from(fabrics)
			.where(
				and(
					eq(fabrics.ownerId, uid),
					or(ilike(fabrics.name, like), ilike(fabrics.fabricType, like), ilike(fabrics.composition, like))
				)
			)
			.limit(4),
		db
			.select({ id: notions.id, name: notions.name, category: notions.category, photoPath: notions.photoPath })
			.from(notions)
			.where(and(eq(notions.ownerId, uid), or(ilike(notions.name, like), ilike(notions.category, like))))
			.limit(4)
	]);

	const stashHref = (tab: string) => `/stash?tab=${tab}&q=${encodeURIComponent(q)}`;
	const hits: SearchHit[] = [
		...pats.map((p) => ({
			kind: 'pattern' as const,
			id: p.id,
			title: p.title,
			subtitle: [p.garmentType, p.designer].filter(Boolean).join(' · ') || undefined,
			href: `/patterns/${p.id}`,
			image: p.coverPath
		})),
		...projs.map((p) => ({ kind: 'project' as const, id: p.id, title: p.title, href: `/projects/${p.id}` })),
		...yarnRows.map((y) => ({
			kind: 'yarn' as const,
			id: y.id,
			title: [y.brand, y.name].filter(Boolean).join(' ') || y.colorway || '—',
			subtitle: y.colorway ?? undefined,
			href: stashHref('yarn'),
			image: y.photoPath
		})),
		...fabricRows.map((f) => ({
			kind: 'fabric' as const,
			id: f.id,
			title: f.name ?? f.fabricType ?? '—',
			subtitle: f.name ? (f.fabricType ?? undefined) : undefined,
			href: stashHref('fabric'),
			image: f.photoPath
		})),
		...notionRows.map((n) => ({
			kind: 'notion' as const,
			id: n.id,
			title: n.name,
			subtitle: n.category ?? undefined,
			href: stashHref('notion'),
			image: n.photoPath
		}))
	];

	return json({ hits });
};
