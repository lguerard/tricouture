// Applique les migrations Drizzle au démarrage.
// Active d'abord l'extension pgvector (requise par les colonnes `vector`).
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL manquant');
	process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
	await sql`CREATE EXTENSION IF NOT EXISTS vector`;
	const db = drizzle(sql);
	await migrate(db, { migrationsFolder: './drizzle' });
	console.log('Migrations appliquées.');
} catch (err) {
	console.error('Échec migration:', err);
	process.exit(1);
} finally {
	await sql.end();
}
