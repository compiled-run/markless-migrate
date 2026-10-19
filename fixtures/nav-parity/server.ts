// A small site with its own in-place router, for the navigation check. `fresh` swaps pages as a fresh load of them
// would show them; `stale-html` keeps the <html> attributes only the landing page was served with (vite.dev's
// data-theme, Markless before 8d7669f8); `scripts` adopts the next page's head scripts without running them and runs
// its inline scripts at once (htmx.org's "htmx is not defined", Markless before 25196c52). It fetches pages at
// Markless's router path, so the check counts its swaps as the router's.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Variant = 'fresh' | 'stale-html' | 'scripts';

const THEME = `<script>if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark')</script>`;
const STYLE = `<style>html.dark body, html[data-theme="dark"] body { background: #111; color: #eee } body { font: 16px/1.5 sans-serif; margin: 0 } main { padding: 16px }</style>`;
const NAV = `<header><nav><a href="/">Home</a> <a href="/docs/">Docs</a> <a href="/lib/">Library</a> <button type="button" id="theme" aria-label="Toggle dark theme">Theme</button></nav></header>`;

const PAGES: Record<string, { html?: string; head?: string; body: string }> = {
	'/': { html: ' data-theme="dark"', body: '<main><h1>Home</h1><p>Welcome.</p></main>' },
	'/docs/': { body: '<main><h1>Docs</h1><p>Read me.</p></main>' },
	'/lib/': {
		head: '<script src="/lib.js"></script>',
		body: '<main><h1>Library</h1><p id="out">waiting</p><button type="button" id="again">Greet again</button></main><script>document.getElementById("out").textContent = lib.greet(); document.getElementById("again").addEventListener("click", () => { document.getElementById("out").textContent = lib.greet() + " again"; });</script>',
	},
};

const LIB = 'window.lib = { greet: () => "hello from lib" };';

function page(path: string): string {
	const p = PAGES[path]!;
	return `<!doctype html><html lang="en"${p.html ?? ''}><head><meta charset="utf-8"><title>${path}</title>${THEME}${STYLE}${p.head ?? ''}<script src="/router.js" defer></script></head><body>${NAV}${p.body}</body></html>`;
}

function router(variant: Variant): string {
	return `(() => {
	let served = document.documentElement.getAttributeNames();
	const ran = new Set([...document.scripts].filter((s) => s.src).map((s) => s.src));
	const theme = () => {
		const dark = document.documentElement.classList.toggle('dark');
		localStorage.setItem('theme', dark ? 'dark' : 'light');
	};
	const wire = () => document.getElementById('theme')?.addEventListener('click', theme);
	const run = (script) => {
		const copy = document.createElement('script');
		for (const a of script.attributes) copy.setAttribute(a.name, a.value);
		copy.textContent = script.textContent;
		const loaded = copy.src ? new Promise((done) => { copy.onload = copy.onerror = done; }) : Promise.resolve();
		script.replaceWith(copy);
		return loaded;
	};
	async function show(url) {
		const html = await (await fetch('/_markless/fragment' + new URL(url).pathname)).text();
		const next = new DOMParser().parseFromString(html, 'text/html');
		const root = document.documentElement;
		${variant === 'stale-html' ? '' : "for (const name of served) if (name !== 'class' && !next.documentElement.hasAttribute(name)) root.removeAttribute(name);\n\t\tserved = next.documentElement.getAttributeNames();"}
		for (const a of next.documentElement.attributes) root.setAttribute(a.name, a.value);
		document.title = next.title;
		const added = [...next.head.children].filter((el) => el.localName !== 'title' && ![...document.head.children].some((own) => own.outerHTML === el.outerHTML));
		for (const el of added) document.head.append(el);
		document.body.replaceChildren(...next.body.childNodes);
		${variant === 'scripts'
			? "for (const s of document.body.querySelectorAll('script')) run(s);"
			: "for (const s of added.filter((el) => el.localName === 'script' && el.src && !ran.has(el.src))) { ran.add(s.src); await run(s); }\n\t\tfor (const s of document.body.querySelectorAll('script')) await run(s);"}
		wire();
	}
	document.addEventListener('click', (event) => {
		const a = event.target.closest('a[href]');
		if (!a || a.origin !== location.origin) return;
		event.preventDefault();
		history.pushState(null, '', a.href);
		show(a.href);
	});
	addEventListener('popstate', () => show(location.href));
	wire();
})();`;
}

export async function serve(variant: Variant): Promise<{ origin: string; server: Server }> {
	const server = createServer((request, response) => {
		// Fetched the way Markless's router asks for the next page.
		const path = new URL(request.url ?? '/', 'http://x').pathname.replace(/^\/_markless\/fragment(?=\/)/, '');
		if (path === '/router.js') return void response.writeHead(200, { 'content-type': 'text/javascript' }).end(router(variant));
		if (path === '/lib.js') return void response.writeHead(200, { 'content-type': 'text/javascript' }).end(LIB);
		if (!PAGES[path]) return void response.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>');
		response.writeHead(200, { 'content-type': 'text/html' }).end(page(path));
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
