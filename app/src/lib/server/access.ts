// Per-object sharing.
//
// Everything in this app belongs to the account that created it and is
// invisible to everyone else. A row in `shares` is the only thing that opens
// one object to one other account, with one of two roles:
//
//   view  — see it, nothing else
//   edit  — change it, but not delete it and not re-share it
//
// Deleting and re-sharing stay with the owner on purpose: a shared object is
// someone else's, and losing it to a mis-click on another account's screen is
// exactly what a family server should not allow.
import { and, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from './db';
import { shares, users } from './db/schema';

export type ShareRole = 'view' | 'edit';
export type Access = 'owner' | ShareRole | null;

// The object types that can be shared. These strings are stored in
// shares.resource_type, so they are data: renaming one needs a migration.
export const SHAREABLE = [
	'project',
	'pattern',
	'yarn',
	'fabric',
	'notion',
	'tool',
	'recipient',
	'measurements',
	'finished_object',
	'goal',
	'mood_board',
	'bin'
] as const;
export type ResourceType = (typeof SHAREABLE)[number];

// Sub-select of the ids of `type` shared with `uid`. Kept as a sub-select so a
// listing stays a single round trip instead of "fetch ids, then fetch rows".
function sharedIds(uid: string, type: ResourceType, needEdit = false) {
	const conds = [eq(shares.userId, uid), eq(shares.resourceType, type)];
	if (needEdit) conds.push(eq(shares.role, 'edit'));
	return db.select({ id: shares.resourceId }).from(shares).where(and(...conds));
}

// Drop-in replacement for `eq(table.ownerId, uid)` in a listing: mine, plus
// what has been shared with me.
//
//   .where(visibleTo(uid, 'project', projects.ownerId, projects.id))
export function visibleTo(
	uid: string,
	type: ResourceType,
	ownerCol: AnyPgColumn,
	idCol: AnyPgColumn,
	needEdit = false
): SQL {
	return or(eq(ownerCol, uid), inArray(idCol, sharedIds(uid, type, needEdit)))!;
}

// What `uid` may do with one object, given the object's owner.
//
// Callers must answer 404 (not 403) when this returns null: a 403 would confirm
// that the id exists and let someone enumerate other accounts' objects.
export async function accessFor(
	uid: string,
	type: ResourceType,
	resourceId: string,
	ownerId: string
): Promise<Access> {
	if (ownerId === uid) return 'owner';
	const row = (
		await db
			.select({ role: shares.role })
			.from(shares)
			.where(
				and(
					eq(shares.resourceType, type),
					eq(shares.resourceId, resourceId),
					eq(shares.userId, uid)
				)
			)
			.limit(1)
	)[0];
	return row ? (row.role as ShareRole) : null;
}

export function canEdit(a: Access): boolean {
	return a === 'owner' || a === 'edit';
}

// --- Managing shares (owner only) -------------------------------------------

export async function listShares(type: ResourceType, resourceId: string) {
	return db
		.select({
			userId: shares.userId,
			role: shares.role,
			displayName: users.displayName,
			email: users.email
		})
		.from(shares)
		.innerJoin(users, eq(users.id, shares.userId))
		.where(and(eq(shares.resourceType, type), eq(shares.resourceId, resourceId)))
		.orderBy(users.displayName);
}

// Sharing again with the same person changes the role instead of failing on the
// unique index -- that is what the second click in the UI means.
export async function upsertShare(
	ownerId: string,
	type: ResourceType,
	resourceId: string,
	userId: string,
	role: ShareRole
) {
	if (userId === ownerId) return; // sharing with yourself is a no-op, not an error
	await db
		.insert(shares)
		.values({ resourceType: type, resourceId, ownerId, userId, role })
		.onConflictDoUpdate({
			target: [shares.resourceType, shares.resourceId, shares.userId],
			set: { role }
		});
}

export async function revokeShare(type: ResourceType, resourceId: string, userId: string) {
	await db
		.delete(shares)
		.where(
			and(
				eq(shares.resourceType, type),
				eq(shares.resourceId, resourceId),
				eq(shares.userId, userId)
			)
		);
}

// Every share of an object disappears with the object itself. Call this from
// the delete path of each resource: the shares table has no foreign key to the
// object (one per table would mean one shares table per type).
export async function dropSharesOf(type: ResourceType, resourceId: string) {
	await db
		.delete(shares)
		.where(and(eq(shares.resourceType, type), eq(shares.resourceId, resourceId)));
}

// Accounts a person can share with: everyone but themselves. The e-mail is
// returned because two members of a household can easily pick the same display
// name, and picking the wrong recipient is not a mistake you notice.
export async function shareableUsers(excludeId: string) {
	const rows = await db
		.select({ id: users.id, displayName: users.displayName, email: users.email })
		.from(users)
		.orderBy(users.displayName);
	return rows.filter((u) => u.id !== excludeId);
}
