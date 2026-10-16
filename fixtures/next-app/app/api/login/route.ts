import { isLocale } from '../../dictionaries';
import { sessionValue, USERS } from '../../session';

export async function POST(request: Request) {
	const form = await request.formData();
	const lang = String(form.get('lang') ?? 'en');
	const prefix = `/${isLocale(lang) ? lang : 'en'}`;
	const email = String(form.get('email') ?? '');
	const user = USERS[email];
	if (!user || user.password !== String(form.get('password') ?? '')) return new Response(null, { status: 303, headers: { location: `${prefix}/login?error=1` } });
	const cookie = `session=${sessionValue(email)}; Path=/; HttpOnly; SameSite=Lax`;
	return new Response(null, { status: 303, headers: { location: `${prefix}/members`, 'set-cookie': cookie } });
}
