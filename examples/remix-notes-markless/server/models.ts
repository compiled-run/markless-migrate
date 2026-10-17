import bcrypt from 'bcryptjs';
import { db } from './db.ts';
import { cuid } from './cuid.ts';

export type User = { id: string; email: string; createdAt: number; updatedAt: number };
export type NoteItem = { id: string; title: string };
export type Note = NoteItem & { body: string };

export function getUserById(id: string): User | undefined {
	return db().prepare('SELECT id, email, createdAt, updatedAt FROM "User" WHERE id = ?').get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
	return db().prepare('SELECT id, email, createdAt, updatedAt FROM "User" WHERE email = ?').get(email) as User | undefined;
}

export async function createUser(email: string, password: string): Promise<User> {
	const hashedPassword = await bcrypt.hash(password, 10);
	const now = Date.now();
	const id = cuid();
	db().prepare('INSERT INTO "User" (id, email, createdAt, updatedAt) VALUES (?, ?, ?, ?)').run(id, email, now, now);
	db().prepare('INSERT INTO "Password" (hash, userId) VALUES (?, ?)').run(hashedPassword, id);
	return getUserById(id)!;
}

export async function verifyLogin(email: string, password: string): Promise<User | null> {
	const row = db().prepare('SELECT "User".id, "Password".hash FROM "User" JOIN "Password" ON "Password".userId = "User".id WHERE "User".email = ?').get(email) as { id: string; hash: string } | undefined;
	if (!row) return null;
	if (!(await bcrypt.compare(password, row.hash))) return null;
	return getUserById(row.id) ?? null;
}

export function getNote({ id, userId }: { id: string; userId: string }): Note | undefined {
	return db().prepare('SELECT id, body, title FROM "Note" WHERE id = ? AND userId = ? LIMIT 1').get(id, userId) as Note | undefined;
}

export function getNoteListItems({ userId }: { userId: string }): NoteItem[] {
	return db().prepare('SELECT id, title FROM "Note" WHERE userId = ? ORDER BY updatedAt DESC').all(userId) as NoteItem[];
}

export function createNote({ body, title, userId }: { body: string; title: string; userId: string }): Note {
	const now = Date.now();
	const id = cuid();
	db().prepare('INSERT INTO "Note" (id, title, body, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)').run(id, title, body, now, now, userId);
	return { id, title, body };
}

export function deleteNote({ id, userId }: { id: string; userId: string }) {
	db().prepare('DELETE FROM "Note" WHERE id = ? AND userId = ?').run(id, userId);
}

export function countUsers(): number {
	return (db().prepare('SELECT COUNT(*) AS n FROM "User"').get() as { n: number }).n;
}
