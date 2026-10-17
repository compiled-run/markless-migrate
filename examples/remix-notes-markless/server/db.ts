import { DatabaseSync } from 'node:sqlite';

// The old app's Prisma SQLite file, read with Node's own driver: same tables, same rows, same integer timestamps.
const store = globalThis as { __notesDb?: DatabaseSync };
export const db = () => (store.__notesDb ??= open());

function open(): DatabaseSync {
	const database = new DatabaseSync(process.env.DATABASE_PATH ?? 'data/notes.db');
	database.exec('PRAGMA foreign_keys = ON');
	return database;
}
