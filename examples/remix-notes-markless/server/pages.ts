import { useRequest } from 'nitro/context';
import { getNote, getNoteListItems, getUserById, type User } from './models.ts';
import { getUserId } from './session.ts';

// node:sqlite answers synchronously, so a page's async values settle before Markless's 10 ms streaming deadline.
export function currentUser(request: Request): User | null {
	const id = getUserId(request);
	return id ? (getUserById(id) ?? null) : null;
}

export function userFor() {
	const user = currentUser(useRequest());
	return { email: user?.email ?? '' };
}

export function notesFor() {
	const user = currentUser(useRequest())!;
	const notes = getNoteListItems({ userId: user.id });
	return { email: user.email, notes, empty: notes.length === 0 ? ['No notes yet'] : [] };
}

export function noteFor(id: string) {
	const user = currentUser(useRequest())!;
	const note = getNote({ id, userId: user.id });
	return { found: Boolean(note), title: note?.title ?? '', body: note?.body ?? '', action: `/notes/${id}` };
}
