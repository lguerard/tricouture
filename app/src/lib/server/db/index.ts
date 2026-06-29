import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

// Repli inoffensif au build (analyse SvelteKit) ; l'URL réelle est lue au runtime.
// postgres-js est paresseux : aucune connexion n'est ouverte avant la 1re requête.
const connectionString = env.DATABASE_URL || 'postgres://localhost:5432/postgres';

// max 10 connexions, suffisant pour un usage self-host familial.
const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
