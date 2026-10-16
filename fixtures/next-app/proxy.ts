import { NextResponse, type NextRequest } from 'next/server';
import { isLocale } from './app/dictionaries';

const CHALLENGE = '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta name="robots" content="noindex,nofollow"></head><body><noscript>Enable JavaScript and cookies to continue</noscript><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=8d2f00000000"></script></body></html>';

// A Cloudflare-style challenge for requests without the staging pass, when BOT_WALL is set.
function walled(request: NextRequest): boolean {
	const pass = process.env.BOT_WALL;
	return Boolean(pass) && request.headers.get('x-staging-pass') !== pass && request.cookies.get('staging_pass')?.value !== pass;
}

export function proxy(request: NextRequest) {
	if (walled(request)) return new NextResponse(CHALLENGE, { status: 403, headers: { 'content-type': 'text/html; charset=UTF-8', 'cf-mitigated': 'challenge', 'cf-ray': '8d2f00000000-LHR' } });
	if (request.nextUrl.pathname !== '/') return NextResponse.next();
	const wanted = (request.headers.get('accept-language') ?? '').split(',').map((part) => part.split(';')[0]!.trim().slice(0, 2).toLowerCase());
	const locale = wanted.find(isLocale) ?? 'en';
	return NextResponse.redirect(new URL(`/${locale}`, request.url), 307);
}

export const config = { matcher: ['/((?!_next/|api/).*)'] };
