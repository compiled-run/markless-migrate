import { createHmac, timingSafeEqual } from 'node:crypto';

// Remix's createCookieSessionStorage format (base64 JSON signed like cookie-signature), so either app reads the other's session.
const NAME = '__session';
const secret = () => process.env.SESSION_SECRET!;
const secure = () => process.env.NODE_ENV === 'production';

function sign(value: string): string {
	return `${value}.${createHmac('sha256', secret()).update(value).digest('base64').replace(/=+$/, '')}`;
}

function unsign(signed: string): string | false {
	const value = signed.slice(0, signed.lastIndexOf('.'));
	const expected = Buffer.from(sign(value));
	const actual = Buffer.from(signed);
	return expected.length === actual.length && timingSafeEqual(expected, actual) ? value : false;
}

function readCookie(request: Request): string | undefined {
	for (const part of (request.headers.get('cookie') ?? '').split(/;\s*/)) {
		const at = part.indexOf('=');
		if (at > 0 && part.slice(0, at) === NAME) return decodeURIComponent(part.slice(at + 1));
	}
	return undefined;
}

export function getUserId(request: Request): string | undefined {
	const cookie = readCookie(request);
	const value = cookie && unsign(cookie);
	if (!value) return undefined;
	try {
		return (JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as { userId?: string }).userId;
	} catch {
		return undefined;
	}
}

export function commitSession(userId: string, remember: boolean): string {
	const value = sign(Buffer.from(JSON.stringify({ userId })).toString('base64'));
	const age = remember ? 60 * 60 * 24 * 7 : undefined;
	return [`${NAME}=${encodeURIComponent(value)}`, ...(age ? [`Max-Age=${age}`] : []), 'Path=/', ...(age ? [`Expires=${new Date(Date.now() + age * 1000).toUTCString()}`] : []), 'HttpOnly', ...(secure() ? ['Secure'] : []), 'SameSite=Lax'].join('; ');
}

export function destroySession(): string {
	return [`${NAME}=`, 'Path=/', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'HttpOnly', ...(secure() ? ['Secure'] : []), 'SameSite=Lax'].join('; ');
}
