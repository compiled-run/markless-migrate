// The old app's query functions: on the server they call the store directly, in the browser they ask the API routes.
import type { Invoice, User, UsersSortBy } from './types.ts';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, init);
	const body = (await res.json()) as T & { error?: string };
	if (!res.ok) throw new Error(body.error ?? `${path} answered ${res.status}`);
	return body;
}

const server = async <T>(run: (s: typeof import('./server.ts')) => Promise<T>): Promise<T> =>
	run(await import('./server.ts'));

const send = (method: string, body: unknown): RequestInit => ({
	method,
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(body),
});

export async function fetchInvoices(): Promise<Invoice[]> {
	if (import.meta.env.SSR) return server((s) => s.fetchInvoices(s.here()));
	return api('/api/invoices');
}

export async function fetchInvoiceById(id: number): Promise<Invoice> {
	if (import.meta.env.SSR) return server((s) => s.fetchInvoiceById(s.here(), id));
	return api(`/api/invoices/${id}`);
}

export async function fetchUsers(
	opts: { filterBy?: string; sortBy?: UsersSortBy } = {},
): Promise<User[]> {
	if (import.meta.env.SSR) return server((s) => s.fetchUsers(s.here(), opts));
	return api(
		`/api/users?${new URLSearchParams(Object.entries(opts).filter(([, v]) => v !== undefined) as [string, string][])}`,
	);
}

export async function fetchUserById(id: number): Promise<User | undefined> {
	if (import.meta.env.SSR) return server((s) => s.fetchUserById(s.here(), id));
	return api(`/api/users/${id}`);
}

export const postInvoice = (partial: Partial<Invoice>): Promise<Invoice> =>
	api('/api/invoices', send('POST', partial));
export const patchInvoice = (patch: Partial<Invoice> & { id: number }): Promise<Invoice> =>
	api(`/api/invoices/${patch.id}`, send('PATCH', patch));
export const login = (username: string): Promise<{ ok: true }> =>
	api('/api/auth', send('POST', { username }));
export const logout = (): Promise<{ ok: true }> => api('/api/auth', { method: 'DELETE' });

export async function fetchAuth(): Promise<{
	status: 'loggedOut' | 'loggedIn';
	username?: string;
}> {
	if (import.meta.env.SSR) return server(async (s) => s.auth(s.here()));
	return api('/api/auth');
}
