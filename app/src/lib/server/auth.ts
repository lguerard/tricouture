import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from './db';
import { users, sessions } from './db/schema';

const scrypt = promisify(scryptCb);

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours
export const SESSION_COOKIE = 'session';

export interface SessionUser {
	id: string;
	email: string;
	displayName: string;
	isAdmin: boolean;
}

/* ---------------------- mots de passe ---------------------- */

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const derived = (await scrypt(password.normalize('NFKC'), salt, 64)) as Buffer;
	return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
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

// On stocke en base le hash du token ; le token brut n'existe que côté client.
function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
	const token = randomBytes(32).toString('hex');
	const id = hashToken(token);
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	await db.insert(sessions).values({ id, userId, expiresAt });
	return token; // renvoyé au client (cookie web ou Bearer mobile)
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

/* ---------------------- helpers requête ---------------------- */

// Extrait le token soit du cookie (web) soit du header Authorization Bearer (mobile).
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
