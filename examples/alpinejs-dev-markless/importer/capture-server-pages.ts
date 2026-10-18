// Captures the alpinejs.dev pages that have no open source (Laravel/Livewire views) from the read-only mirror:
// node importer/capture-server-pages.ts [mirror-origin]. Writes content/server-pages/*.json with only what the port publishes.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];

const MIRROR = process.argv[2] ?? 'http://127.0.0.1:4420';
const APP = join(import.meta.dirname, '..');
const OUT = join(APP, 'content/server-pages');
const SVG_DIR = join(APP, 'public/port/svg');
// An inline SVG past this size is served as a file and drawn with <img>, so it is not carried as page markup.
const SVG_INLINE_LIMIT = 50_000;
mkdirSync(OUT, { recursive: true });
mkdirSync(SVG_DIR, { recursive: true });

const isElement = (node: Node | undefined): node is Element => !!node && 'tagName' in node;
const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const kids = (el: Element): Node[] => (el.tagName === 'template' ? (el as unknown as { content: { childNodes: Node[] } }).content.childNodes : el.childNodes);

function* walk(node: Element | DefaultTreeAdapterMap['document']): Generator<Element> {
	for (const child of (isElement(node as Node) ? kids(node as Element) : node.childNodes) as Node[]) {
		if (!isElement(child)) continue;
		yield child;
		yield* walk(child);
	}
}
const find = (root: Element | DefaultTreeAdapterMap['document'], test: (el: Element) => boolean) => {
	for (const el of walk(root)) if (test(el)) return el;
	return undefined;
};
const findAll = (root: Element | DefaultTreeAdapterMap['document'], test: (el: Element) => boolean) => [...walk(root)].filter(test);
const hasClass = (el: Element, ...names: string[]) => names.every((n) => (attr(el, 'class') ?? '').split(/\s+/).includes(n));
const text = (el: Element): string => kids(el).map((n) => (isElement(n) ? text(n) : n.nodeName === '#text' ? (n as DefaultTreeAdapterMap['textNode']).value : '')).join('').replace(/\s+/g, ' ').trim();

// Cloudflare rewrites every email address into a link its own script decodes; the port writes the address.
function decodeEmail(hex: string): string {
	const bytes = Buffer.from(hex, 'hex');
	return [...bytes.subarray(1)].map((b) => String.fromCharCode(b ^ bytes[0]!)).join('');
}

const ABSOLUTE = /^https?:\/\/alpinejs\.dev(?=\/|$)/;

// The Alpine directives these views use, rewritten as neutral data-port-* notes the generator turns into Markless
// bindings. Livewire's own attributes and directives that only serve Livewire are dropped; anything else stops the capture.
function directive(el: Element, name: string, value: string, route: string): [string, string] | null | undefined {
	// The dialog's x-data entangles `registering` with its Livewire component, so its first value is the server's.
	if (name === 'wire:initial-data' && attr(el, 'role') === 'dialog') return ['data-port-state', JSON.stringify({ registering: Boolean(JSON.parse(value).serverMemo.data.registering) })];
	if (name.startsWith('wire:')) return null;
	if (name === 'x-data' || name === 'x-cloak' || name === 'x-id') return null;
	if (name === '@checkout-completed.window') return null;
	if (name === 'x-show') return ['data-port-show', value.replace(/\s+/g, '')];
	if (name === 'x-transition') return ['data-port-transition', 'default'];
	if (name === 'x-transition.opacity') return ['data-port-transition', 'opacity'];
	if (name.startsWith('x-trap')) return ['data-port-trap', name.split('.').slice(1).join(' ')];
	if (name === 'x-on:keydown.escape.prevent.stop') return ['data-port-escape', ''];
	if (name === 'x-on:show-auth-modal.window') return null;
	if (/^(x-on:click|@click)/.test(name)) {
		const mods = name.split('.').slice(1);
		if (/\$dispatch\('show-auth-modal'\)/.test(value)) return ['data-port-click', 'open-auth'];
		const expression = value.trim().replace(/\s+/g, ' ');
		if (expression === 'open = false') return ['data-port-click', `close${mods.includes('prevent') ? ' prevent' : ''}`];
		if (expression === 'registering = ! registering') return ['data-port-click', 'toggle-registering prevent'];
		if (expression === '' && mods.includes('stop')) return ['data-port-click', 'stop'];
	}
	// The GitHub link's destination is only set by a Livewire flow the port has no backend for, so it is always /login/github.
	if (name === 'x-bind:href' && value.includes('/login/github')) return ['href', '/login/github'];
	if (/^(x-|@|:)/.test(name)) throw new Error(`${route}: no rule for ${name}="${value}" on <${el.tagName}>`);
	return undefined;
}

const svgFiles = new Map<string, string>();

// Cleans a subtree in place: drops scripts, styles, comments and Livewire, rewrites Alpine directives (above), makes
// alpinejs.dev links same-origin, decodes Cloudflare's email links and moves very large SVGs to files.
function clean(el: Element, route: string): void {
	el.attrs = el.attrs.flatMap((a) => {
		const name = a.prefix ? `${a.prefix}:${a.name}` : a.name;
		const rewritten = directive(el, name, a.value, route);
		if (rewritten === null) return [];
		if (rewritten) return [{ name: rewritten[0], value: rewritten[1] }];
		if ((name === 'href' || name === 'src' || name === 'action') && ABSOLUTE.test(a.value)) return [{ ...a, value: a.value.replace(ABSOLUTE, '') || '/' }];
		if (name === 'href' && a.value.startsWith('/cdn-cgi/l/email-protection#')) return [{ ...a, value: `mailto:${decodeEmail(a.value.split('#')[1]!)}` }];
		return [a];
	});
	const children = kids(el);
	for (let i = children.length - 1; i >= 0; i--) {
		const child = children[i]!;
		if (child.nodeName === '#comment' || (isElement(child) && (child.tagName === 'script' || child.tagName === 'style'))) {
			children.splice(i, 1);
			continue;
		}
		if (isElement(child) && child.tagName === 'input' && attr(child, 'name') === '_token') {
			children.splice(i, 1);
			continue;
		}
		if (isElement(child) && child.tagName === 'a' && hasClass(child, '__cf_email__')) {
			const data = attr(child, 'data-cfemail')!;
			children.splice(i, 1, { nodeName: '#text', value: decodeEmail(data), parentNode: el } as unknown as Node);
			continue;
		}
		if (isElement(child) && child.tagName === 'svg') {
			const markup = serializeOuter(child);
			if (markup.length > SVG_INLINE_LIMIT) {
				const hash = createHash('sha256').update(markup).digest('hex').slice(0, 12);
				const file = `/port/svg/${hash}.svg`;
				if (!svgFiles.has(file)) writeFileSync(join(APP, 'public', file), markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg" (.*)xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'xmlns="http://www.w3.org/2000/svg" $1'));
				svgFiles.set(file, markup);
				const keep = ['class', 'width', 'height'].flatMap((n) => (attr(child, n) ? [{ name: n, value: attr(child, n)! }] : []));
				// Inline SVG ignores the stylesheet's img { max-width: 100% }; the <img> must too to keep the same size.
				children.splice(i, 1, { nodeName: 'img', tagName: 'img', attrs: [{ name: 'src', value: file }, ...keep, { name: 'style', value: 'max-width: none' }, { name: 'alt', value: '' }], childNodes: [], parentNode: el, namespaceURI: 'http://www.w3.org/1999/xhtml' } as unknown as Node);
			}
			continue;
		}
		if (isElement(child)) clean(child, route);
	}
}

const html = (el: Element | undefined, route: string): string => {
	if (!el) throw new Error(`${route}: region missing`);
	clean(el, route);
	return serializeOuter(el);
};
const inner = (el: Element | undefined, route: string): string => {
	if (!el) throw new Error(`${route}: region missing`);
	clean(el, route);
	return kids(el).map((n) => serializeOuter(n)).join('');
};

async function load(route: string) {
	const response = await fetch(MIRROR + route, { redirect: 'manual' });
	if (response.status !== 200) return undefined;
	const document = parse(await response.text());
	const head = find(document, (el) => el.tagName === 'head')!;
	const meta = (name: string) => attr(find(head, (el) => el.tagName === 'meta' && attr(el, 'name') === name) ?? ({ attrs: [] } as unknown as Element), 'content') ?? '';
	const title = text(find(head, (el) => el.tagName === 'title')!);
	const stylesheets = findAll(head, (el) => el.tagName === 'link' && attr(el, 'rel') === 'stylesheet').map((el) => attr(el, 'href')!);
	// Inline head styles beyond the two every page carries (the site's own and Livewire's).
	const styles = findAll(head, (el) => el.tagName === 'style').map((el) => text(el)).filter((css) => !css.includes('scroll-behavior') && !css.includes('wire\\:loading'));
	return { document, head: { title, description: meta('description'), ogTitle: meta('og:title'), ogDescription: meta('og:description'), ogImage: meta('og:image'), stylesheets, styles } };
}

const save = (name: string, data: unknown) => writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, '\t') + '\n');

const slot = (parent: Element, name: string, extra: Record<string, string> = {}) =>
	({ nodeName: 'port-slot', tagName: 'port-slot', attrs: [{ name: 'name', value: name }, ...Object.entries(extra).map(([n, v]) => ({ name: n, value: v }))], childNodes: [], parentNode: parent, namespaceURI: 'http://www.w3.org/1999/xhtml' }) as unknown as Element;
const replace = (el: Element, by: Element) => {
	const siblings = (el.parentNode as Element).childNodes;
	siblings.splice(siblings.indexOf(el), 1, by);
};

// The component page layout (header, sidebar, footer) is the same on every component page; the column (kind, title,
// version badges, screencast, demo blocks, pitch) and the sign-in dialog (the free lesson has its own) are each page's. In the column every demo
// (paid product code) is replaced by a demo slot before anything is serialized, and so is the code panel of the free
// lesson: none of that markup is captured.
const first = await load('/component/dropdown');
if (!first) throw new Error('mirror: /component/dropdown did not answer 200');
const sidebar = find(first.document, (el) => el.tagName === 'nav' && hasClass(el, 'w-[240px]'))!;
const sections = findAll(sidebar, (el) => el.tagName === 'h3').map((h3) => {
	const list = (h3.parentNode as Element).childNodes.filter(isElement);
	const ul = list[list.indexOf(h3) + 1]!;
	return { title: text(h3), headingClass: attr(h3, 'class')!, listClass: attr(ul, 'class')!, items: findAll(ul, (el) => el.tagName === 'a').map((a) => ({ href: attr(a, 'href')!.replace(ABSOLUTE, ''), label: text(a) })) };
});
const linkClasses = findAll(sidebar, (el) => el.tagName === 'a').map((a) => attr(a, 'class')!);
const activeLink = linkClasses.find((c) => c.includes('text-components-cyan-600'))!;
const link = linkClasses.find((c) => c !== activeLink)!;
const slugs = sections.flatMap((s) => s.items.map((i) => i.href)).filter((href) => href.startsWith('/component/'));
const pages: unknown[] = [];
let skeleton: string | undefined;
for (const route of slugs) {
	const page = await load(route);
	if (!page) {
		console.log(`skip ${route} (not 200)`);
		continue;
	}
	const body = find(page.document, (el) => el.tagName === 'body')!;
	const wrapper = body.childNodes.filter(isElement)[0]!;
	const column = find(wrapper, (el) => el.tagName === 'div' && hasClass(el, 'mb-32'))!;
	const title = text(find(column, (el) => el.tagName === 'h1')!);
	let demo = 0;
	for (const block of column.childNodes.filter(isElement).filter((el) => hasClass(el, 'mt-8') && !hasClass(el, 'relative'))) {
		const children = block.childNodes.filter(isElement);
		const lower = children.find((el) => hasClass(el, 'mt-4', 'rounded-xl', 'bg-gray-50'))!;
		const frame = children.find((el) => el !== lower && el.tagName !== 'h3')!;
		const inner = frame.childNodes.filter(isElement)[0]!;
		inner.childNodes.splice(0, inner.childNodes.length, slot(inner, 'demo', { index: String(demo++) }));
		const panel = lower.childNodes.filter(isElement)[0]!;
		const content = text(lower);
		if (content && !content.includes('Lifetime Access')) panel.childNodes.splice(0, panel.childNodes.length, slot(panel, 'code'));
	}
	const columnHtml = inner(column, route);
	const theDialog = find(wrapper, (el) => attr(el, 'role') === 'dialog')!;
	const dialog = html(theDialog, route);
	replace(theDialog, slot(theDialog.parentNode as Element, 'dialog'));
	if (!skeleton) {
		replace(find(wrapper, (el) => el.tagName === 'nav' && hasClass(el, 'w-[240px]'))!, slot(wrapper, 'sidebar', { class: attr(sidebar, 'class')! }));
		const col = find(wrapper, (el) => el.tagName === 'div' && hasClass(el, 'mb-32'))!;
		col.childNodes.splice(0, col.childNodes.length, slot(col, 'column'));
		skeleton = html(wrapper, route);
	}
	pages.push({ route, head: page.head, title, column: columnHtml, demos: demo, dialog });
}
save('component-layout', { sections, linkClass: link, activeLinkClass: activeLink, skeleton });
save('component-pages', pages);

// /components: the marketing page, every section of it, and its sign-in dialog.
{
	const page = (await load('/components'))!;
	const body = find(page.document, (el) => el.tagName === 'body')!;
	const wrapper = body.childNodes.filter(isElement)[0]!;
	const own = find(wrapper, (el) => attr(el, 'role') === 'dialog')!;
	replace(own, slot(own.parentNode as Element, 'dialog'));
	save('components', { route: '/components', head: page.head, body: html(wrapper, '/components'), dialog: html(own, '/components') });
}

// /license: a docs-layout page whose column is the license text.
{
	const page = (await load('/license'))!;
	const column = find(page.document, (el) => el.tagName === 'div' && attr(el, 'listen-for-intersection-of-titles') !== undefined)!;
	const nodes = column.childNodes.filter(isElement);
	const sponsor = nodes.findIndex((el) => hasClass(el, 'my-12'));
	const content = nodes.slice(0, sponsor).map((el) => html(el, '/license')).join('\n');
	save('license', { route: '/license', head: page.head, content });
}

// /login and /forgot-password: the guest layout around one form.
for (const route of ['/login', '/forgot-password']) {
	const page = (await load(route))!;
	const body = find(page.document, (el) => el.tagName === 'body')!;
	save(route.slice(1), { route, head: page.head, body: inner(body, route) });
}
console.log(`captured ${pages.length} component pages, /components, /license, /login, /forgot-password; ${svgFiles.size} large SVGs moved to files`);

// The images these pages draw from the site's own /img folder.
const captured = ['component-layout', 'component-pages', 'components', 'license', 'login', 'forgot-password'].map((name) => readFileSync(join(OUT, `${name}.json`), 'utf8')).join('');
for (const path of new Set([...captured.matchAll(/src=\\"(\/img\/[^\\"]+)\\"/g)].map((m) => m[1]!))) {
	const response = await fetch(MIRROR + path);
	if (!response.ok) throw new Error(`mirror: ${path} answered ${response.status}`);
	mkdirSync(dirname(join(APP, 'public', path)), { recursive: true });
	writeFileSync(join(APP, 'public', path), Buffer.from(await response.arrayBuffer()));
}
