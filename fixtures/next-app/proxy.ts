import { NextResponse, type NextRequest } from 'next/server';
import { isLocale } from './app/dictionaries';

export function proxy(request: NextRequest) {
	const wanted = (request.headers.get('accept-language') ?? '').split(',').map((part) => part.split(';')[0]!.trim().slice(0, 2).toLowerCase());
	const locale = wanted.find(isLocale) ?? 'en';
	return NextResponse.redirect(new URL(`/${locale}`, request.url), 307);
}

export const config = { matcher: '/' };
