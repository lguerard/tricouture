// Password rescue from the server shell, for when nobody can reach the web UI
// any more (only administrator locked out, forgotten e-mail, no reset link).
//
//   docker compose exec app node scripts/reset-password.js                      # list accounts
//   docker compose exec app node scripts/reset-password.js you@example.com      # print a one-shot reset link
//   docker compose exec app node scripts/reset-password.js you@example.com pass # set the password directly
//
// Run inside the app container: it needs DATABASE_URL, which compose already
// provides there.
import { randomBytes, scrypt as scryptCb, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import postgres from 'postgres';

const scrypt = promisify(scryptCb);
const MIN_PASSWORD_LENGTH = 8;
const RESET_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours — same as the web UI

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL missing. Run this inside the app container.');
	process.exit(1);
}

// Kept byte-for-byte in step with hashPassword() in src/lib/server/auth.ts.
async function hashPassword(password) {
	const salt = randomBytes(16);
	const derived = await scrypt(password.normalize('NFKC'), salt, 64);
	return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

const [rawEmail, password] = process.argv.slice(2);
const sql = postgres(url, { max: 1 });

try {
	if (!rawEmail) {
		const rows = await sql`SELECT email, display_name, is_admin FROM users ORDER BY created_at`;
		if (rows.length === 0) {
			console.log('No account yet — create the first one from /register.');
		} else {
			console.log('Accounts:');
			for (const r of rows) {
				console.log(`  ${r.email}${r.is_admin ? ' (admin)' : ''} — ${r.display_name}`);
			}
			console.log('\nUsage: node scripts/reset-password.js <email> [new-password]');
		}
		process.exit(0);
	}

	const email = rawEmail.trim().toLowerCase();
	const user = (await sql`SELECT id, email FROM users WHERE email = ${email} LIMIT 1`)[0];
	if (!user) {
		console.error(`No account with e-mail ${email}. Run without arguments to list them.`);
		process.exit(1);
	}

	if (password) {
		if (password.length < MIN_PASSWORD_LENGTH) {
			console.error(`Password too short (${MIN_PASSWORD_LENGTH} characters minimum).`);
			process.exit(1);
		}
		const passwordHash = await hashPassword(password);
		await sql.begin(async (tx) => {
			await tx`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${user.id}`;
			// Every existing session and pending reset link is void from now on.
			await tx`DELETE FROM sessions WHERE user_id = ${user.id}`;
			await tx`DELETE FROM password_reset_tokens WHERE user_id = ${user.id}`;
		});
		console.log(`Password updated for ${user.email}. All its sessions were signed out.`);
	} else {
		const token = randomBytes(32).toString('hex');
		const id = createHash('sha256').update(token).digest('hex');
		const expiresAt = new Date(Date.now() + RESET_TTL_MS);
		await sql.begin(async (tx) => {
			await tx`DELETE FROM password_reset_tokens WHERE user_id = ${user.id}`;
			await tx`INSERT INTO password_reset_tokens (id, user_id, expires_at)
			         VALUES (${id}, ${user.id}, ${expiresAt})`;
		});
		const base = (process.env.ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
		console.log(`One-shot reset link for ${user.email} (valid 24 h):\n`);
		console.log(`  ${base}/reset-password/${token}\n`);
	}
} catch (err) {
	console.error('Failed:', err);
	process.exit(1);
} finally {
	await sql.end();
}
