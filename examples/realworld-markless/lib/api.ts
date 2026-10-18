import { navigate } from './nav.ts';

export interface Profile {
	username: string;
	bio: string | null;
	image: string | null;
	following: boolean;
}

export interface User {
	email: string;
	token: string;
	username: string;
	bio: string | null;
	image: string | null;
}

export interface Article {
	slug: string;
	title: string;
	description: string;
	body: string;
	tagList: string[];
	createdAt: string;
	updatedAt: string;
	favorited: boolean;
	favoritesCount: number;
	author: Profile;
}

export interface Comment {
	id: string;
	body: string;
	createdAt: string;
	author: Profile;
}

export type Errors = Record<string, string[]>;

export interface ApiResult<T> {
	ok: boolean;
	status: number;
	data: T;
	errors: Errors;
}

const TOKEN_KEY = 'jwtToken';
const NETWORK_ERROR: Errors = { network: ['Unable to connect. Please check your internet connection.'] };

export function getToken(): string | undefined {
	return window.localStorage[TOKEN_KEY];
}

export function saveToken(token: string): void {
	window.localStorage[TOKEN_KEY] = token;
}

export function destroyToken(): void {
	window.localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
	const token = getToken();
	const headers: Record<string, string> = { accept: 'application/json, text/plain, */*' };
	if (body !== undefined) headers['content-type'] = 'application/json';
	if (token) headers.authorization = `Token ${token}`;
	let response: Response;
	try {
		response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
	} catch {
		return { ok: false, status: 0, data: undefined as T, errors: NETWORK_ERROR };
	}
	const text = await response.text();
	let data: unknown;
	try {
		data = text ? JSON.parse(text) : undefined;
	} catch {
		data = undefined;
	}
	if (response.ok) return { ok: true, status: response.status, data: data as T, errors: {} };
	if (response.status === 401 && !path.endsWith('/user')) destroyToken();
	const errors = data && typeof data === 'object' && 'errors' in data ? (data as { errors: Errors }).errors : NETWORK_ERROR;
	return { ok: false, status: response.status, data: data as T, errors };
}

export function errorList(errors: Errors | null | undefined): string[] {
	return errors ? Object.keys(errors).map((key) => `${key} ${errors[key]}`) : [];
}

export function articlesQuery(filters: Record<string, string | number | undefined>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, String(value));
	return params.toString();
}

const longDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export function formatDate(iso: string): string {
	return longDate.format(new Date(iso));
}

export function avatar(image: string | null | undefined): string {
	return image || '/assets/default-avatar.svg';
}

let cachedUser: User | null | undefined;
let pending: Promise<SessionResult> | undefined;

export type SessionResult = { status: 'authenticated' | 'unauthenticated' | 'unavailable'; user: User | null };

// The header and the page both wait on the same GET /user, as the old app's initializer did.
export function currentUser(): Promise<SessionResult> {
	pending ??= loadUser();
	return pending;
}

async function loadUser(): Promise<SessionResult> {
	const token = getToken();
	if (!token) {
		cachedUser = null;
		destroyToken();
		return { status: 'unauthenticated', user: null };
	}
	if (cachedUser) return { status: 'authenticated', user: cachedUser };
	const result = await api<UserResponse>('GET', '/user');
	if (result.ok) {
		rememberUser(result.data.user);
		return { status: 'authenticated', user: result.data.user };
	}
	if (result.status >= 400 && result.status < 500) {
		rememberUser(null);
		return { status: 'unauthenticated', user: null };
	}
	return { status: 'unavailable', user: null };
}

export function rememberUser(user: User | null): void {
	cachedUser = user;
	pending = undefined;
	if (user) {
		saveToken(user.token);
	} else {
		destroyToken();
	}
}

export type TagsResponse = { tags: string[] };
export type ArticlesResponse = { articles: Article[]; articlesCount: number };
export type ArticleResponse = { article: Article };
export type CommentsResponse = { comments: Comment[] };
export type CommentResponse = { comment: Comment };
export type ProfileResponse = { profile: Profile };
export type UserResponse = { user: User };

export function go(path: string): void {
	navigate(path);
}

export function isSignedIn(): boolean {
	return Boolean(getToken());
}

const UNSAFE_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM']);

// Stands in for Angular's DomSanitizer on the markdown body.
export function sanitize(html: string): string {
	const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
	for (const el of [...doc.body.querySelectorAll('*')]) {
		if (UNSAFE_TAGS.has(el.tagName)) {
			el.remove();
			continue;
		}
		for (const attr of [...el.attributes]) {
			if (attr.name.startsWith('on') || attr.name === 'style' || /^\s*(javascript|vbscript|data):/i.test(attr.value)) el.removeAttribute(attr.name);
		}
	}
	return doc.body.innerHTML;
}
