import { isLocale } from '../../dictionaries';

export async function POST(request: Request) {
	const form = await request.formData();
	const lang = String(form.get('lang') ?? 'en');
	const target = new URL(`/${isLocale(lang) ? lang : 'en'}/contact?sent=1`, request.url);
	return Response.redirect(target, 303);
}
