import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

// Safe fallback at build time (SvelteKit analysis); the real URL is read at runtime.
// postgres-js is lazy: no connection is opened before the first query.
const connectionString = env.DATABASE_URL || 'postgres://localhost:5432/postgres';

// max 10 connections, sufficient for a self-hosted home setup.
const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
