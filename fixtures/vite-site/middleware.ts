import type { IncomingMessage, ServerResponse } from 'node:http';

export const USERS: Record<string, { name: string; role: 'member' | 'admin'; password: string }> = {
	'sam@lighthouse.example': { name: 'Sam', role: 'member', password: 'night-route' },
	'kit@lighthouse.example': { name: 'Kit', role: 'admin', password: 'godrevy' },
};

export type Decision = { status: 302; location: string } | { status: 403; page: string };

function cookieOf(req: IncomingMessage, name: string): string | undefined {
	for (const part of (req.headers.cookie ?? '').split(';')) {
		const [key, ...value] = part.trim().split('=');
		if (key === name) return value.join('=');
	}
	return undefined;
}

export function currentUser(req: IncomingMessage) {
	const value = cookieOf(req, 'session');
	return value ? USERS[Buffer.from(value, 'base64url').toString()] : undefined;
}

const redirect = (location: string): Decision => ({ status: 302, location });
const forbidden = (): Decision => ({ status: 403, page: '403.html' });

export function guard(req: IncomingMessage, pathname: string): Decision | undefined {
	if (pathname.startsWith('/members/') || pathname.startsWith('/admin/')) {
		const user = currentUser(req);
		if (!user) return redirect('/login/');
		if (pathname.startsWith('/admin/') && user.role !== 'admin') return forbidden();
	}
	return undefined;
}

export async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
	let body = '';
	for await (const chunk of req) body += chunk;
	const form = new URLSearchParams(body);
	const email = form.get('email') ?? '';
	const user = USERS[email];
	if (!user || user.password !== form.get('password')) {
		res.writeHead(303, { location: '/login/?error=1' }).end();
		return;
	}
	res.writeHead(303, { location: '/members/', 'set-cookie': `session=${Buffer.from(email).toString('base64url')}; Path=/; HttpOnly; SameSite=Lax` }).end();
}

const CHALLENGE = '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta name="robots" content="noindex,nofollow"></head><body><noscript>Enable JavaScript and cookies to continue</noscript><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=8d2f00000000"></script></body></html>';

// A Cloudflare-style challenge for requests without the staging pass, when BOT_WALL is set.
export function botWall(req: IncomingMessage, res: ServerResponse): boolean {
	const pass = process.env.BOT_WALL;
	if (!pass || req.headers['x-staging-pass'] === pass || cookieOf(req, 'staging_pass') === pass) return false;
	// BOT_WALL_SCOPE narrows the wall to what a CDN often challenges on its own: static files, or posts.
	const scope = process.env.BOT_WALL_SCOPE;
	if (scope === 'assets' && !/\.(png|svg|jpe?g|webp|woff2?|css|js)$/.test((req.url ?? '').split('?')[0]!)) return false;
	if (scope === 'writes' && (req.method === 'GET' || req.method === 'HEAD')) return false;
	res.writeHead(403, { 'content-type': 'text/html; charset=UTF-8', 'cf-mitigated': 'challenge', 'cf-ray': '8d2f00000000-LHR', server: 'cloudflare' }).end(CHALLENGE);
	return true;
}
