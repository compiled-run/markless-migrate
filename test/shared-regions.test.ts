import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attr, body, childrenOf, isElement, parseDocument, type Element } from '../src/convert/dom.ts';
import { sharedRegions, type SharedRegion } from '../src/convert/factor.ts';

const rootOf = (html: string) => body(parseDocument(`<body>${html}</body>`)).childNodes.find(isElement)!;
const roots = (pages: Record<string, string>) => new Map(Object.entries(pages).map(([route, html]) => [route, rootOf(html)]));

function elementsOf(root: Element): Element[] {
	const out: Element[] = [root];
	for (const child of childrenOf(root)) if (isElement(child)) out.push(...elementsOf(child));
	return out;
}

// Every member page gets back exactly the attribute values it rendered, from the one component's expressions.
function assertReproduces(region: SharedRegion) {
	const reference = elementsOf(region.element);
	for (const member of region.members) {
		const own = elementsOf(member.element);
		assert.equal(own.length, reference.length);
		reference.forEach((el, i) => {
			const exprs = region.expressions.get(el) ?? {};
			for (const name of new Set([...el.attrs, ...own[i]!.attrs].map((a) => a.name))) {
				const expected = attr(own[i]!, name);
				const got = name in exprs ? new Function('path', 'values', `return (${exprs[name]});`)(member.path, region.table[member.path] ?? {}) : attr(el, name);
				assert.equal(got ?? undefined, expected, `${member.route}: <${el.tagName} ${name}>`);
			}
		});
	}
}

const filler = (n: number) => 'x'.repeat(n);

test('a sidebar that marks the current page on items that are not links is one component, its marks expressions of the path', () => {
	const sections = ['/guide/a', '/guide/b', '/guide/c'];
	const sidebar = (current: string) =>
		`<aside class="side"><nav>${sections.map((href) => `<section class="${href === current ? 'item is-active' : 'item'}"><div class="row"><a class="link" href="${href}">${href}${filler(800)}</a></div></section>`).join('')}</nav></aside>`;
	const pages = Object.fromEntries(sections.map((route) => [route, `<div id="app">${sidebar(route)}<main>${route} own text</main></div>`]));
	const regions = sharedRegions(roots(pages), { varies: () => true });
	assert.equal(regions.length, 1);
	const [region] = regions;
	assert.equal(region!.element.tagName, 'aside');
	assert.deepEqual(region!.members.map((m) => m.route), sections);
	assert.deepEqual(region!.table, {}, 'a mark on one page each needs no table of values');
	assertReproduces(region!);
});

test("a link to the page's own address on another host is the path inside the value", () => {
	const routes = ['/one', '/two/deeper', '/three/'];
	const header = (route: string) => `<header class="top"><a hreflang="fr" href="https://fr.example.org${route}?from=menu">Français ${filler(2100)}</a><a href="/">home</a><a rel="alternate" href="${route}">this page</a></header>`;
	const regions = sharedRegions(roots(Object.fromEntries(routes.map((r) => [r, `<div>${header(r)}<p>${r}</p></div>`]))), { varies: () => true });
	assert.equal(regions.length, 1);
	const link = elementsOf(regions[0]!.element).find((el) => attr(el, 'hreflang'))!;
	assert.match(regions[0]!.expressions.get(link)!.href!, /\bpath\b/);
	assert.doesNotMatch(regions[0]!.expressions.get(link)!.href!, /values\[/);
	const self = elementsOf(regions[0]!.element).find((el) => attr(el, 'rel') === 'alternate')!;
	assert.equal(regions[0]!.expressions.get(self)!.href, '`${path}`');
	assertReproduces(regions[0]!);
});

test('values that follow no pattern of the path come from a table by path, and still give each page its own', () => {
	const routes = ['/p', '/q', '/r', '/s', '/t', '/u', '/v', '/w'];
	const banner = (i: number) => `<div class="banner" data-seed="${(i * 7919) % 13}" style="--offset:${i * 3}px"><span>${filler(2100)}</span></div>`;
	const regions = sharedRegions(roots(Object.fromEntries(routes.map((r, i) => [r, `<section>${banner(i)}<article>${r}</article></section>`]))), { varies: () => true });
	assert.equal(regions.length, 1);
	assert.deepEqual(Object.keys(regions[0]!.table).sort(), [...routes].sort());
	assertReproduces(regions[0]!);
});

test("text that differs keeps a region each page's own; an element the options skip makes its ancestors each page's own", () => {
	const nav = `<nav class="primary">${filler(2100)}</nav>`;
	const page = (route: string) => `<div class="layout"><div class="frame">${nav}<template data-menu><a href="${route}">menu</a></template></div><footer class="end">${route === '/a' ? 'Previous' : 'Next'} ${filler(2100)}</footer><main>${route}</main></div>`;
	const pages = roots({ '/a': page('/a'), '/b': page('/b') });
	const skipped = sharedRegions(pages, { varies: () => true, skip: (el) => el.tagName === 'template' });
	assert.deepEqual(
		skipped.map((r) => r.element.tagName),
		['nav'],
		'the frame holds a skipped template, so only the nav inside it is shared; the footer text differs',
	);
	const unskipped = sharedRegions(pages, { varies: () => true });
	assert.deepEqual(unskipped.map((r) => attr(r.element, 'class')), ['frame']);
});

test('the same structure under other names and orders is found the same way', () => {
	const routes = ['/z/1', '/z/2'];
	const rail = (current: string) =>
		`<div role="navigation" data-kind="rail">${routes.map((href) => `<li data-on="${href === current}" aria-current="${href === current ? 'page' : 'false'}"><b>${href}</b>${filler(1100)}</li>`).join('')}</div>`;
	const regions = sharedRegions(roots(Object.fromEntries(routes.map((r) => [r, `<article><section>${r}</section>${rail(r)}</article>`]))), { varies: () => true });
	assert.equal(regions.length, 1);
	assert.equal(attr(regions[0]!.element, 'data-kind'), 'rail');
	assertReproduces(regions[0]!);
});

test('a section link marked on every page under it, and a group marked on the pages it lists, need no table', () => {
	const routes = ['/docs/', '/docs/a', '/docs/b', '/docs/c', '/docs/d', '/api/', '/api/x', '/api/y', '/api/z', '/about'];
	const menu = (route: string) =>
		`<div class="menu">${['/docs/', '/api/'].map((href) => `<a href="${href}" class="${route.startsWith(href) ? 'top on' : 'top'}">${href}</a>`).join('')}` +
		`<ul class="${['/docs/a', '/docs/b', '/docs/c', '/docs/d'].includes(route) ? 'group open' : 'group'}"><li>${filler(2100)}</li></ul></div>`;
	const regions = sharedRegions(roots(Object.fromEntries(routes.map((r) => [r, `<body-wrap><nav>${menu(r)}</nav><main>${r}</main></body-wrap>`]))), { varies: () => true });
	assert.equal(regions.length, 1);
	assert.deepEqual(regions[0]!.table, {});
	const links = elementsOf(regions[0]!.element).filter((el) => el.tagName === 'a');
	assert.match(regions[0]!.expressions.get(links[0]!)!.class!, /path\.startsWith\("\/docs\/"\)/);
	assertReproduces(regions[0]!);
});

test('a region takes the name the options give it', () => {
	const pages = roots({ '/a': `<div><div class="Promo strip">${filler(2100)}</div><p>a</p></div>`, '/b': `<div><div class="Promo strip">${filler(2100)}</div><p>b</p></div>` });
	assert.deepEqual(sharedRegions(pages, { name: (el) => attr(el, 'class')?.split(' ')[0] }).map((r) => [r.name, r.base]), [['Promo', 'promo']]);
	assert.deepEqual(sharedRegions(pages).map((r) => r.name), ['Div']);
});

test("a link to the page itself is the path, also when only two pages share it", () => {
	const page = (route: string) => `<div><nav class="locales"><a lang="fr" href="${route}">${filler(2100)}</a></nav><p>${route}</p></div>`;
	const [region] = sharedRegions(roots({ '/docs': page('/docs'), '/docs/install': page('/docs/install') }), { varies: () => true });
	assert.equal(region!.expressions.get(elementsOf(region!.element).find((el) => el.tagName === 'a')!)!.href, '`${path}`');
	assertReproduces(region!);
});
