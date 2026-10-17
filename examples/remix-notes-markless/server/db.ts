import { existsSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// The old app's Prisma SQLite file, read with Node's own driver: same tables, same rows, same integer timestamps.
const store = globalThis as { __notesDb?: Promise<DatabaseSync> };
export const db = await (store.__notesDb ??= open());

async function open(): Promise<DatabaseSync> {
	const path = process.env.DATABASE_PATH ?? 'data/notes.db';
	// The demo deployment has no writable database: SEED_DATABASE=1 starts each function instance from the seed in /tmp.
	if (process.env.SEED_DATABASE === '1' && !existsSync(path)) writeFileSync(path, Buffer.from((await import('./seed-db.mjs')).default, 'base64'));
	const database = new DatabaseSync(path);
	database.exec('PRAGMA foreign_keys = ON');
	return database;
}
