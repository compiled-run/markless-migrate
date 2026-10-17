import type { EndpointHttpContext } from '@markless/router';
import { authorize, sessionCookie } from '../../server/session.ts';

export default async function login(http: EndpointHttpContext) {
	const form = await http.request.formData();
	let user;
	try {
		user = await authorize(form);
	} catch {
		return Response.json({ error: 'Something went wrong.' });
	}
	if (!user) return Response.json({ error: 'Invalid credentials.' });
	const to = new URL(String(form.get('redirectTo') || '/dashboard'), http.url);
	const headers = new Headers({ 'set-cookie': await sessionCookie(user, http.url) });
	return Response.json({ redirect: to.origin === http.url.origin ? to.pathname + to.search : '/dashboard' }, { headers });
}
