import { createNote, createUser, deleteNote, getUserByEmail, verifyLogin } from './models.ts';
import { commitSession, destroySession } from './session.ts';

// The old route actions. Each answers with errors (status 400) or a redirect and the cookie to set.
export type Outcome = { status: 400; errors: Record<string, string | null> } | { status: 302; redirect: string; cookie?: string };

export function safeRedirect(to: FormDataEntryValue | string | null | undefined, defaultRedirect = '/') {
	if (!to || typeof to !== 'string') return defaultRedirect;
	if (!to.startsWith('/') || to.startsWith('//')) return defaultRedirect;
	return to;
}

export function validateEmail(email: unknown): email is string {
	return typeof email === 'string' && email.length > 3 && email.includes('@');
}

function credentials(form: FormData): Outcome | { email: string; password: string } {
	const email = form.get('email');
	const password = form.get('password');
	if (!validateEmail(email)) return { status: 400, errors: { email: 'Email is invalid', password: null } };
	if (typeof password !== 'string' || password.length === 0) return { status: 400, errors: { email: null, password: 'Password is required' } };
	if (password.length < 8) return { status: 400, errors: { email: null, password: 'Password is too short' } };
	return { email, password };
}

export async function login(form: FormData): Promise<Outcome> {
	const input = credentials(form);
	if ('status' in input) return input;
	const redirectTo = safeRedirect(form.get('redirectTo'), '/');
	const user = await verifyLogin(input.email, input.password);
	if (!user) return { status: 400, errors: { email: 'Invalid email or password', password: null } };
	return { status: 302, redirect: redirectTo, cookie: commitSession(user.id, form.get('remember') === 'on') };
}

export async function join(form: FormData): Promise<Outcome> {
	const input = credentials(form);
	if ('status' in input) return input;
	const redirectTo = safeRedirect(form.get('redirectTo'), '/');
	if (getUserByEmail(input.email)) return { status: 400, errors: { email: 'A user already exists with this email', password: null } };
	const user = await createUser(input.email, input.password);
	return { status: 302, redirect: redirectTo, cookie: commitSession(user.id, false) };
}

export function newNote(form: FormData, userId: string): Outcome {
	const title = form.get('title');
	const body = form.get('body');
	if (typeof title !== 'string' || title.length === 0) return { status: 400, errors: { body: null, title: 'Title is required' } };
	if (typeof body !== 'string' || body.length === 0) return { status: 400, errors: { body: 'Body is required', title: null } };
	const note = createNote({ body, title, userId });
	return { status: 302, redirect: `/notes/${note.id}` };
}

export function removeNote(id: string, userId: string): Outcome {
	deleteNote({ id, userId });
	return { status: 302, redirect: '/notes' };
}

export const logout = (): Outcome => ({ status: 302, redirect: '/', cookie: destroySession() });
