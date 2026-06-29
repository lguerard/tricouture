#!/usr/bin/env node
// Seed demo data for CI screenshot runs.
// Usage: DATABASE_URL=postgres://... node app/scripts/seed-demo.mjs
import postgres from 'postgres';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

async function hashPassword(pwd) {
	const salt = randomBytes(16);
	const derived = await scryptAsync(pwd.normalize('NFKC'), salt, 64);
	return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

const sql = postgres(process.env.DATABASE_URL);

const hash = await hashPassword('Demo1234!');

const [user] = await sql`
	INSERT INTO users (email, display_name, password_hash, is_admin)
	VALUES ('demo@tricouture.app', 'Demo', ${hash}, true)
	ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
	RETURNING id
`;

await sql`
	INSERT INTO patterns (owner_id, title, craft, designer, source, difficulty, tags)
	VALUES
		(${user.id}, 'Écharpe torsades irlandaises', 'tricot', 'Kim Hargreaves', 'Ravelry', 3, '["hiver","accessoire"]'),
		(${user.id}, 'Bonnet péruvien', 'crochet', 'Drops Design', 'drops-design.com', 2, '["hiver","accessoire"]'),
		(${user.id}, 'Robe portefeuille', 'couture', null, 'Burda Style 03/2025', 4, '["été","robe"]'),
		(${user.id}, 'Pull raglan sans couture', 'tricot', 'Joji Locatelli', 'Ravelry', 4, '["pull","raglan"]'),
		(${user.id}, 'Chaussettes à picots', 'tricot', null, 'Drops Design', 1, '["chaussettes"]')
`;

const rows = await sql`
	INSERT INTO projects (owner_id, title, status, board_position, progress_pct, current_row, total_rows, deadline)
	VALUES
		(${user.id}, 'Écharpe hiver 2026', 'monte', 0, 35, 42, 120, '2026-11-01'),
		(${user.id}, 'Robe été de Marie', 'idee', 0, 0, 0, null, null),
		(${user.id}, 'Chaussettes Noël papa', 'bloque', 0, 70, 60, 80, '2026-12-20'),
		(${user.id}, 'Pull enfant fini', 'fini', 0, 100, 80, 80, null)
	RETURNING id, status
`;

await sql`
	INSERT INTO yarns (owner_id, brand, name, colorway, weight_category, fiber, skeins, grams_per_skein, color_hex)
	VALUES
		(${user.id}, 'Drops', 'Karisma', 'Bleu nuit', 'DK', '100% laine mérinos', 4, 50, '#1a2e5e'),
		(${user.id}, 'Plassard', 'Coton peigné', 'Écru naturel', 'DK', '100% coton', 6, 50, '#f5f0e8'),
		(${user.id}, 'Lang Yarns', 'Mohair Luxe', 'Doré', 'Lace', '70% mohair 30% soie', 2, 25, '#c9a227'),
		(${user.id}, 'Bergère de France', 'Merinos Mix', 'Bordeaux', 'Worsted', '60% laine 40% acrylique', 3, 50, '#6b1a2a'),
		(${user.id}, 'Malabrigo', 'Rios', 'Lettuce', 'Worsted', '100% mérinos superwash', 2, 100, '#4a7c59')
`;

await sql`
	INSERT INTO goals (owner_id, title, kind, target_value, current_value, period_start, period_end)
	VALUES
		(${user.id}, '12 projets en 2026', 'projets_an', 12, 3, '2026-01-01', '2026-12-31'),
		(${user.id}, 'Vider 5 pelotes du stash', 'stash_busting', 5, 2, '2026-01-01', '2026-06-30')
`;

await sql.end();
console.log('Seed OK — demo@tricouture.app / Demo1234!');
