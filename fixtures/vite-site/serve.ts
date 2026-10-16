import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
	'.json': 'application/json',
	'.xml': 'application/xml',
	'.txt': 'text/plain; charset=utf-8',
};

type ServeConfig = { redirects?: Record<string, string>; negotiate?: Record<string, Record<string, string>>; forms?: Record<string, string>; notFoundStatus?: number };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function cmsJson<T>(path: string): Promise<T | undefined> {
	const base = process.env.CMS_URL;
	if (!base) return undefined;
	try {
		const response = await fetch(`${base}${path}`);
		return response.ok ? ((await response.json()) as T) : undefined;
	} catch {
		return undefined;
	}
}

// Server-side render: the home page's news and footer tagline come from the CMS.
async function render(html: string): Promise<string> {
	if (!html.includes('<!--cms:') && !html.includes('{{cms}}')) return html;
	let out = html.replaceAll('{{cms}}', process.env.CMS_URL ?? '');
	if (out.includes('<!--cms:news-->')) {
		const news = await cmsJson<{ items: { title: string; summary: string }[] }>('/walks/news?fields=title,summary,slug&locale=en');
		out = out.replace('<!--cms:news-->', (news?.items ?? []).map((item) => `<article><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p></article>`).join(''));
	}
	if (out.includes('<!--cms:tagline-->')) {
		const settings = await cmsJson<{ tagline: string }>('/walks/settings');
		out = out.replace('<!--cms:tagline-->', escapeHtml(settings?.tagline ?? ''));
	}
	return out;
}

async function isFile(path: string): Promise<boolean> {
	return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}

export async function serve(dir: string, port = 0, host = '127.0.0.1'): Promise<{ server: Server; origin: string }> {
	const config: ServeConfig = JSON.parse(await readFile(join(dir, 'serve.json'), 'utf8').catch(() => '{}'));
	const server = createServer(async (req, res) => {
		const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
		const form = config.forms?.[path];
		if (req.method === 'POST' && form) {
			req.resume();
			req.on('end', () => res.writeHead(303, { location: form }).end());
			return;
		}
		const wanted = (req.headers['accept-language'] ?? '').split(',').map((part) => part.split(';')[0]!.trim().slice(0, 2).toLowerCase());
		const negotiated = config.negotiate?.[path];
		const locale = negotiated && wanted.find((lang) => lang in negotiated);
		if (negotiated && locale && negotiated[locale]) {
			res.writeHead(302, { location: negotiated[locale]!, vary: 'Accept-Language' }).end();
			return;
		}
		const redirect = config.redirects?.[path];
		if (redirect) {
			res.writeHead(301, { location: redirect }).end();
			return;
		}
		const file = normalize(join(dir, path));
		if (!file.startsWith(dir)) {
			res.writeHead(400).end();
			return;
		}
		if (!path.endsWith('/') && (await isFile(join(file, 'index.html')))) {
			res.writeHead(301, { location: `${path}/` }).end();
			return;
		}
		const target = path.endsWith('/') ? join(file, 'index.html') : file;
		if (await isFile(target)) {
			const body = extname(target) === '.html' ? await render(await readFile(target, 'utf8')) : await readFile(target);
			res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
			res.end(body);
			return;
		}
		res.writeHead(config.notFoundStatus ?? 404, { 'content-type': TYPES['.html'] });
		res.end(await readFile(join(dir, '404.html')).catch(() => 'Not found'));
	});
	await new Promise<void>((done) => server.listen(port, host, done));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('server has no port');
	return { server, origin: `http://${host}:${address.port}` };
}

if (import.meta.main) {
	const dir = resolve(process.argv[2] ?? 'dist');
	const { origin } = await serve(dir, Number(process.env.PORT ?? 4173), process.env.HOST ?? '127.0.0.1');
	process.stdout.write(`${origin}\n`);
}
