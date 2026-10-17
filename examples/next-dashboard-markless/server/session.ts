import { createHash, randomBytes } from 'node:crypto';
import { decode, encode, type JWT } from '@auth/core/jwt';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sql } from './db.ts';
import type { User } from './definitions.ts';

// Same cookie names, token format and secret as Auth.js, so a session from either app is valid in the other.
const MAX_AGE = 30 * 24 * 60 * 60;
const secret = () => process.env.AUTH_SECRET!;

export function cookieNames(url: URL) {
	const prefix = url.protocol === 'https:' ? '__Secure-' : '';
	return {
		session: `${prefix}authjs.session-token`,
		csrf: `${url.protocol === 'https:' ? '__Host-' : ''}authjs.csrf-token`,
		callbackUrl: `${prefix}authjs.callback-url`,
		secure: url.protocol === 'https:',
	};
}

export function readCookie(request: Request, name: string): string | undefined {
	for (const part of (request.headers.get('cookie') ?? '').split(/;\s*/)) {
		const at = part.indexOf('=');
		if (at > 0 && part.slice(0, at) === name) return decodeURIComponent(part.slice(at + 1));
	}
	return undefined;
}

export function cookie(name: string, value: string, url: URL, maxAge?: number): string {
	const attrs = [`${name}=${encodeURIComponent(value)}`, 'Path=/', ...(maxAge === undefined ? [] : [`Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`]), 'HttpOnly', ...(url.protocol === 'https:' ? ['Secure'] : []), 'SameSite=Lax'];
	return attrs.join('; ');
}

export function clearCookie(name: string, url: URL): string {
	return `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly${url.protocol === 'https:' ? '; Secure' : ''}; SameSite=Lax`;
}

export function csrfToken(): string {
	const token = randomBytes(32).toString('hex');
	return `${token}|${createHash('sha256').update(`${token}${secret()}`).digest('hex')}`;
}

export async function sessionFor(request: Request, url: URL): Promise<JWT | null> {
	const name = cookieNames(url).session;
	const token = readCookie(request, name);
	if (!token) return null;
	try {
		return await decode({ token, secret: secret(), salt: name });
	} catch {
		return null;
	}
}

async function getUser(email: string): Promise<User | undefined> {
	try {
		const user = await sql<User[]>`SELECT * FROM users WHERE email=${email}`;
		return user[0];
	} catch (error) {
		console.error('Failed to fetch user:', error);
		throw new Error('Failed to fetch user.');
	}
}

export async function authorize(form: FormData): Promise<User | null> {
	const parsed = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse({ email: form.get('email'), password: form.get('password') });
	if (parsed.success) {
		const user = await getUser(parsed.data.email);
		if (!user) return null;
		if (await bcrypt.compare(parsed.data.password, user.password)) return user;
	}
	console.log('Invalid credentials');
	return null;
}

export async function sessionCookie(user: User, url: URL): Promise<string> {
	const name = cookieNames(url).session;
	const token = await encode({ token: { name: user.name, email: user.email, sub: user.id }, secret: secret(), salt: name, maxAge: MAX_AGE });
	return cookie(name, token, url, MAX_AGE);
}
