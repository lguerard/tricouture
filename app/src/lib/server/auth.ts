import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, isNull, gt } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from './db';
import { users, sessions, passwordResetTokens } from './db/schema';

const scrypt = promisify(scryptCb);

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const RESET_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
export const SESSION_COOKIE = 'session';
export const MIN_PASSWORD_LENGTH = 8;

export interface SessionUser {
	id: string;
	email: string;
	displayName: string;
	isAdmin: boolean;
}

/* ---------------------- passwords ---------------------- */

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const derived = (await scrypt(password.normalize('NFKC'), salt, 64)) as Buffer;
	return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

// Same rule everywhere a password is set: registration, self-service change,
// reset link and the CLI script.
export function passwordProblem(password: string): 'tooShort' | null {
	return password.length < MIN_PASSWORD_LENGTH ? 'tooShort' : null;
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
	const [scheme, saltHex, hashHex] = stored.split(':');
	if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
	const salt = Buffer.from(saltHex, 'hex');
	const expected = Buffer.from(hashHex, 'hex');
	const derived = (await scrypt(password.normalize('NFKC'), salt, expected.length)) as Buffer;
	return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/* ---------------------- sessions ---------------------- */

// Only the token hash is stored in the database; the raw token lives on the client only.
function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
	const token = randomBytes(32).toString('hex');
	const id = hashToken(token);
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	await db.insert(sessions).values({ id, userId, expiresAt });
	return token; // returned to client (web cookie or Bearer mobile)
}

export async function validateSession(token: string): Promise<SessionUser | null> {
	const id = hashToken(token);
	const rows = await db
		.select({
			expiresAt: sessions.expiresAt,
			id: users.id,
			email: users.email,
			displayName: users.displayName,
			isAdmin: users.isAdmin
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id))
		.limit(1);

	const row = rows[0];
	if (!row) return null;
	if (row.expiresAt.getTime() < Date.now()) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}
	return {
		id: row.id,
		email: row.email,
		displayName: row.displayName,
		isAdmin: row.isAdmin
	};
}

export async function invalidateSession(token: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

// Drops every session of a user. Called whenever the password changes, so a
// stolen cookie stops working the moment the password is changed or reset.
// `keepToken` lets the person who just changed their own password stay logged in.
export async function invalidateAllSessions(userId: string, keepToken?: string | null): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
	if (keepToken) {
		await db.insert(sessions).values({
			id: hashToken(keepToken),
			userId,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS)
		});
	}
}

/* ---------------------- password reset ---------------------- */

// Replaces the password and logs every other device out.
export async function setPassword(
	userId: string,
	password: string,
	keepToken?: string | null
): Promise<void> {
	const passwordHash = await hashPassword(password);
	await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
	await invalidateAllSessions(userId, keepToken);
	// Any other pending reset link for this user is now void.
	await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
}

// Returns the raw token — shown once to the administrator, never stored.
export async function createPasswordResetToken(userId: string): Promise<string> {
	const token = randomBytes(32).toString('hex');
	// A user only ever needs one live link; drop the previous ones.
	await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
	await db.insert(passwordResetTokens).values({
		id: hashToken(token),
		userId,
		expiresAt: new Date(Date.now() + RESET_TTL_MS)
	});
	return token;
}

export interface ResetTokenTarget {
	userId: string;
	email: string;
	displayName: string;
}

// Looks the token up without spending it (used to render the form).
export async function findPasswordResetToken(token: string): Promise<ResetTokenTarget | null> {
	if (!token) return null;
	const rows = await db
		.select({ userId: users.id, email: users.email, displayName: users.displayName })
		.from(passwordResetTokens)
		.innerJoin(users, eq(passwordResetTokens.userId, users.id))
		.where(
			and(
				eq(passwordResetTokens.id, hashToken(token)),
				isNull(passwordResetTokens.usedAt),
				gt(passwordResetTokens.expiresAt, new Date())
			)
		)
		.limit(1);
	return rows[0] ?? null;
}

// Spends the token and applies the new password in one go. Returns false when
// the token was already used, expired or never existed.
export async function consumePasswordResetToken(
	token: string,
	newPassword: string
): Promise<boolean> {
	const target = await findPasswordResetToken(token);
	if (!target) return false;
	// Marked used first: setPassword() then deletes it along with the rest.
	await db
		.update(passwordResetTokens)
		.set({ usedAt: new Date() })
		.where(eq(passwordResetTokens.id, hashToken(token)));
	await setPassword(target.userId, newPassword);
	return true;
}

/* ---------------------- request helpers ---------------------- */

// Extracts the token from either the session cookie (web) or the Authorization Bearer header (mobile).
export function readToken(event: RequestEvent): string | null {
	const auth = event.request.headers.get('authorization');
	if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
	return event.cookies.get(SESSION_COOKIE) ?? null;
}

export function setSessionCookie(event: RequestEvent, token: string): void {
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: SESSION_TTL_MS / 1000
	});
}

export function clearSessionCookie(event: RequestEvent): void {
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}
