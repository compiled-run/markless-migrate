import type { MiddlewareHttpContext } from '@markless/router';
import { join, login, logout, newNote, removeNote, type Outcome } from '../server/actions.ts';
import { countUsers } from '../server/models.ts';
import { currentUser } from '../server/pages.ts';
import { getUserId } from '../server/session.ts';

// The old app's loaders and actions that run before a page renders: guards, redirects and form posts.
export default async function request(http: MiddlewareHttpContext) {
	const { url, request } = http;
	// Remix matches a route with or without its trailing slash.
	const path = url.pathname.replace(/(.)\/+$/, '$1');
	if (/^\/(api|build|assets)\//.test(path) || path === '/favicon.ico') return;
	const method = request.method;
	const userId = getUserId(request);
	// The root loader logs out a session whose user no longer exists.
	if (userId && !currentUser(request)) return answer(request, logout());
	if (path === '/healthcheck' && method === 'GET') return healthcheck(request);
	if (path === '/logout') return method === 'POST' ? answer(request, logout()) : redirect('/');
	if (path === '/login' || path === '/join') {
		if (method === 'GET') return userId ? redirect('/') : undefined;
		if (method === 'POST') return answer(request, path === '/login' ? await login(await request.formData()) : await join(await request.formData()));
	}
	if (path === '/notes' || path.startsWith('/notes/')) {
		if (!userId) return redirect(`/login?${new URLSearchParams([['redirectTo', url.pathname]])}`);
		if (method === 'POST' && path === '/notes/new') return answer(request, newNote(await request.formData(), userId));
		const note = /^\/notes\/([^/]+)$/.exec(path);
		if (method === 'POST' && note && note[1] !== 'new') return answer(request, removeNote(note[1]!, userId));
	}
}

function redirect(location: string, cookie?: string): Response {
	return new Response(null, { status: 302, headers: cookie ? { location, 'set-cookie': cookie } : { location } });
}

// A form posted by the page's own script asks for JSON; a form posted without JavaScript gets the redirect or the page again.
function answer(request: Request, outcome: Outcome): Response {
	const json = (request.headers.get('accept') ?? '').includes('application/json');
	if (outcome.status === 302) {
		if (!json) return redirect(outcome.redirect, outcome.cookie);
		return Response.json({ redirect: outcome.redirect }, { headers: outcome.cookie ? { 'set-cookie': outcome.cookie } : {} });
	}
	if (json) return Response.json({ errors: outcome.errors }, { status: 400 });
	return redirect(new URL(request.url).pathname);
}

async function healthcheck(request: Request): Promise<Response> {
	const host = request.headers.get('X-Forwarded-Host') ?? request.headers.get('host');
	try {
		const self = new URL('/', `http://${host}`);
		await Promise.all([
			Promise.resolve(countUsers()),
			fetch(self.toString(), { method: 'HEAD' }).then((r) => {
				if (!r.ok) return Promise.reject(r);
			}),
		]);
		return new Response('OK');
	} catch (error: unknown) {
		console.log('healthcheck ❌', { error });
		return new Response('ERROR', { status: 500 });
	}
}

