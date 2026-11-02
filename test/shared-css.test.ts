import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import fc from 'fast-check';
import { chromium, type Browser } from 'playwright';
import { parse } from 'yuku-css';
import { codeClasses, together } from '../src/convert/class-facts.ts';
import { longhands } from '../src/convert/css-longhands.ts';
import { shareStylesheets, specificity } from '../src/convert/shared-css.ts';
import { classTokens, type Cut, keptText, usedLeaf } from '../src/convert/used-css.ts';

const link = (href: string) => ({ tag: 'link', attrs: { rel: 'stylesheet', href } });

/** Each page's cut of the sheets, as usedStylesheets writes it, and the input shareStylesheets reads. */
async function site(sheets: Record<string, string>, pages: Record<string, { markup: string; links?: string[] }>) {
	const dir = await mkdtemp(join(tmpdir(), 'mm-shared-css-'));
	const put = async (href: string, css: string) => {
		await mkdir(join(dir, href, '..'), { recursive: true });
		await writeFile(join(dir, href), css);
	};
	for (const [href, css] of Object.entries(sheets)) await put(href, css);
	const cuts = new Map<string, Cut>();
	const heads = new Map<string, { tag: string; attrs: Record<string, string> }[]>();
	const used = new Map<string, string[]>();
	for (const [route, { markup, links = Object.keys(sheets) }] of Object.entries(pages)) {
		const tokens = classTokens([markup]);
		const head = [];
		const texts = [];
		for (const href of links) {
			const css = sheets[href]!;
			const kept = new Set<number>();
			const text = keptText(css, parse(css).ast, (leaf) => {
				const keep = usedLeaf(css, leaf, tokens);
				if (keep) kept.add(leaf.start);
				return keep;
			});
			const path = href.replace(/\.css$/, `.used-${route.replace(/\W/g, '')}.css`);
			await put(path, text);
			cuts.set(path, { href, kept });
			head.push(link(path));
			texts.push(text);
		}
		heads.set(route, head);
		used.set(route, texts);
	}
	const pagesOf = new Map(Object.keys(pages).map((route) => [`pages${route}.tsrx`, [route]]));
	return { dir, cuts, heads, used, pagesOf };
}

const read = (dir: string, href: string | undefined) => readFile(join(dir, href!), 'utf8');

test('the rules most pages keep go to one shared sheet; each page links the rest of its cut', async () => {
	const css = '@layer base,utilities;@layer utilities{.a{color:red}.b{margin:1px}.c{border:0}.only{opacity:.5}}';
	const { dir, cuts, heads, pagesOf } = await site({ '/s.css': css }, { '/one': { markup: 'a b only' }, '/two': { markup: 'a b c' }, '/three': { markup: 'a c' } });
	const out = await shareStylesheets({ publicDir: dir, pages: pagesOf, heads, cuts, appended: new Map() });
	assert.ok(!('skipped' in out));
	assert.equal(out.shared.length, 1);
	assert.equal(await read(dir, out.shared[0]!), '@layer base,utilities;@layer utilities{.a{color:red}.b{margin:1px}.c{border:0}}');
	assert.equal(await read(dir, out.heads.get('/one')![0]!.attrs.href), '@layer utilities{.only{opacity:.5}}');
	assert.deepEqual(out.heads.get('/two'), []);
	await rm(dir, { recursive: true, force: true });
});

test("a shared rule after one of the page's own that it could beat is written again in the page's sheet, in its place", async () => {
	// Tailwind's order: p-4 before px-2, so px-2's padding-left wins on an element with both.
	const css = '.p4{padding:4px}.px2{padding-left:2px}.w{width:1px}';
	const { dir, cuts, heads, pagesOf } = await site({ '/s.css': css }, { '/one': { markup: 'p4 px2 w' }, '/two': { markup: 'px2 w' }, '/three': { markup: 'px2 w' } });
	const out = await shareStylesheets({ publicDir: dir, pages: pagesOf, heads, cuts, appended: new Map() });
	assert.ok(!('skipped' in out));
	assert.equal(await read(dir, out.shared[0]!), '.px2{padding-left:2px}.w{width:1px}');
	assert.equal(await read(dir, out.heads.get('/one')![0]!.attrs.href), '.p4{padding:4px}.px2{padding-left:2px}');
	await rm(dir, { recursive: true, force: true });
});

test("a shared rule stays shared when no element of the page carries both its class and the earlier rule's, unless the site's code names one", async () => {
	const css = '.p4{padding:4px}.px2{padding-left:2px}.w{width:1px}';
	const { dir, cuts, heads, pagesOf } = await site({ '/s.css': css }, { '/one': { markup: 'p4 px2 w' }, '/two': { markup: 'px2 w' }, '/three': { markup: 'px2 w' } });
	const apart = new Map([['/one', together([['p4'], ['px2', 'w']], new Set())]]);
	const out = await shareStylesheets({ publicDir: dir, pages: pagesOf, heads, cuts, appended: new Map(), together: apart });
	assert.ok(!('skipped' in out));
	assert.equal(await read(dir, out.heads.get('/one')![0]!.attrs.href), '.p4{padding:4px}');
	const coded = new Map([['/one', together([['p4'], ['px2', 'w']], new Set(['px2']))]]);
	const again = await shareStylesheets({ publicDir: dir, pages: pagesOf, heads, cuts, appended: new Map(), together: coded });
	assert.ok(!('skipped' in again));
	assert.equal(await read(dir, again.heads.get('/one')![0]!.attrs.href), '.p4{padding:4px}.px2{padding-left:2px}');
	await rm(dir, { recursive: true, force: true });
});

test("a page's code facts: each host element's literal class list, and every other string its modules hold, followed through static and dynamic imports", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-class-facts-'));
	await mkdir(join(dir, 'lib'), { recursive: true });
	await writeFile(join(dir, 'page.tsrx'), `import { cls } from './lib/cls.ts';\nimport './s.css';\nexport default function Page() @{\n\t<div class="a b"><Button class="c" /><span class={cls}>{"t"}</span></div>\n}\n`);
	await writeFile(join(dir, 'lib', 'cls.ts'), `export const cls = 'd e';\nexport const later = () => import('./late.ts');\n`);
	await writeFile(join(dir, 'lib', 'late.ts'), 'export const f = `g ${1} h`;\n');
	await writeFile(join(dir, 's.css'), '.z{color:red}');
	const facts = await codeClasses(dir)(['page.tsrx']);
	assert.deepEqual(facts.elements, [['a', 'b']]);
	for (const t of ['c', 'd', 'e', 'g', 'h', 't']) assert.ok(facts.floating.has(t), t);
	for (const t of ['a', 'b', 'z']) assert.ok(!facts.floating.has(t), t);
	await rm(dir, { recursive: true, force: true });
});

test("a page's appended <style> text stays with its page, after its cut", async () => {
	const css = '.a{color:red}.b{color:blue}';
	const { dir, cuts, heads, pagesOf } = await site({ '/s.css': css }, { '/one': { markup: 'a b' }, '/two': { markup: 'a b' } });
	const own = heads.get('/one')![0]!.attrs.href!;
	const extra = '.x{color:green}';
	await writeFile(join(dir, '/s.used-extra.css'), `${await read(dir, own)}\n${extra}`);
	heads.set('/one', [link('/s.used-extra.css')]);
	const out = await shareStylesheets({ publicDir: dir, pages: pagesOf, heads, cuts, appended: new Map([['/s.used-extra.css', { from: own, extra }]]) });
	assert.ok(!('skipped' in out));
	assert.equal(await read(dir, out.heads.get('/one')![0]!.attrs.href), `\n${extra}`);
	await rm(dir, { recursive: true, force: true });
});

test('nothing is shared when a page links a sheet that cannot move, or ranks its layers otherwise after the move', async () => {
	const { dir, cuts, heads, pagesOf } = await site({ '/s.css': '.a{color:red}' }, { '/one': { markup: 'a' }, '/two': { markup: 'a' } });
	heads.get('/one')!.push({ tag: 'link', attrs: { rel: 'stylesheet', href: 'https://cdn.example/x.css' } });
	assert.match(String(Object.values(await shareStylesheets({ publicDir: dir, pages: pagesOf, heads, cuts, appended: new Map() }))[0]), /not a plain same-origin file/);
	await rm(dir, { recursive: true, force: true });
	// /first.css names layer "a" before the shared sheet's statement ranks b ahead of it.
	const layered = await site({ '/first.css': '@layer a{.x{color:red}}', '/s.css': '@layer b,a;@layer b{.y{color:blue}}' }, { '/one': { markup: 'x y', links: ['/first.css', '/s.css'] }, '/two': { markup: 'y', links: ['/s.css'] } });
	const out = await shareStylesheets({ publicDir: layered.dir, pages: layered.pagesOf, heads: layered.heads, cuts: layered.cuts, appended: new Map() });
	assert.ok('skipped' in out && /rank its cascade layers otherwise/.test(out.skipped));
	await rm(layered.dir, { recursive: true, force: true });
});

test('a declaration competes through the longhands it sets, a logical one as every side it can be; specificity follows :is() and :where() and names the pseudo-element', () => {
	const meets = (a: string, b: string) => longhands(a).some((x) => longhands(b).includes(x));
	assert.ok(meets('padding', 'padding-left'));
	assert.ok(meets('padding-inline-start', 'padding-top'));
	assert.ok(meets('left', 'inset-inline-end'));
	assert.ok(meets('font', 'line-height'));
	assert.ok(meets('border', 'border-image-slice'));
	assert.ok(meets('border-inline-start-color', 'border-top-color'));
	assert.ok(meets('-webkit-backdrop-filter', 'backdrop-filter'));
	assert.ok(meets('white-space', 'text-wrap'));
	assert.ok(meets('word-wrap', 'overflow-wrap'));
	assert.ok(meets('inline-size', 'height'));
	assert.ok(!meets('width', 'height'));
	assert.ok(!meets('width', 'min-width'));
	assert.ok(!meets('border-radius', 'border-color'));
	assert.ok(!meets('font-weight', 'font-size'));
	assert.deepEqual(longhands('all'), ['*']);
	// biome-ignore lint/suspicious/noExplicitAny: yuku-css's AST
	const spec = (s: string) => specificity((parse(`${s}{}`).ast.children[0] as any).prelude.children[0]);
	assert.equal(spec('.a:hover'), '0,2,0');
	assert.equal(spec(':where(.a #b) p::before'), '0,0,2::before');
	assert.equal(spec('.a:after'), '0,1,1::after');
	assert.equal(spec(':is(.a, #b) > p'), '1,0,1');
	assert.equal(spec('&.a'), undefined);
});

// Random utility sheets and pages: each page's computed styles with today's cut sheet and with the shared sheet followed by
// its own must be the same in Chromium.
let browser: Browser;
before(async () => {
	browser = await chromium.launch();
});
after(async () => {
	await browser?.close();
});

const DECLS = ['border-radius:3px', 'border-top-left-radius:9px', 'font-weight:700', 'height:7px', 'white-space:nowrap', 'text-wrap:balance', 'content:"x"', 'padding:3px', 'padding-left:5px', 'padding-inline-start:7px', 'margin:2px', 'margin-top:9px', 'inset:1px', 'left:4px', 'top:6px', 'width:10px', 'inline-size:12px', 'min-width:3px', 'font:12px/2 serif', 'line-height:5', 'font-size:20px', 'color:red', 'color:blue', 'gap:3px', 'column-gap:8px', 'border:1px solid red', 'border-left-color:blue', 'border-inline-start-width:4px', '--v:1', '--v:2'];
const PROPS = ['border-top-left-radius', 'font-weight', 'height', 'white-space-collapse', 'text-wrap-mode', 'text-wrap-style', 'padding-left', 'padding-top', 'margin-top', 'margin-left', 'left', 'top', 'right', 'width', 'min-width', 'font-size', 'line-height', 'color', 'column-gap', 'row-gap', 'border-left-color', 'border-left-width', 'border-top-width', '--v'];
const CLASSES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const rule = fc.record({
	cls: fc.constantFrom(...CLASSES),
	shape: fc.constantFrom('.X', '.X.X', ':where(.X)', 'div.X', ':is(.X, #i)', '.X::before', '.X:after', '.X > div'),
	decls: fc.subarray(DECLS, { minLength: 1, maxLength: 3 }),
	important: fc.boolean(),
	layer: fc.constantFrom('', 'base', 'utilities'),
	media: fc.boolean(),
});
const pageArb = fc.array(fc.subarray(CLASSES, { minLength: 1 }), { minLength: 1, maxLength: 4 });

test('random utility sheets: every page computes the same styles from the shared sheet and its own as from its cut', async () => {
	const tab = await browser.newPage();
	const styles = async (sheets: readonly string[], markup: string) => {
		await tab.setContent(`<!doctype html><html><head>${sheets.map((s) => `<style>${s}</style>`).join('')}</head><body style="position:relative">${markup}</body></html>`);
		return tab.evaluate((props) => [...document.body.querySelectorAll('div')].flatMap((el) => [null, '::before', '::after'].map((pseudo) => props.map((p) => getComputedStyle(el, pseudo).getPropertyValue(p)))), [...PROPS, 'content']);
	};
	let compared = 0;
	await fc.assert(
		fc.asyncProperty(fc.array(rule, { minLength: 3, maxLength: 24 }), fc.array(pageArb, { minLength: 2, maxLength: 5 }), async (rules, pages) => {
			const body = (r: (typeof rules)[number]) => {
				const text = `${r.shape.replaceAll('X', r.cls)}{${r.decls.map((d) => `${d}${r.important ? '!important' : ''}`).join(';')}}`;
				return r.media ? `@media (min-width:1px){${text}}` : text;
			};
			const css = `@layer base,utilities;${rules.map((r) => (r.layer ? `@layer ${r.layer}{${body(r)}}` : body(r))).join('')}`;
			const markup = Object.fromEntries(pages.map((els, i) => [`/p${i}`, { markup: els.map((cs, j) => `<div ${j === 0 ? 'id="i" ' : ''}class="${cs.join(' ')}"></div>`).join('') }]));
			const { dir, cuts, heads, used, pagesOf } = await site({ '/s.css': css }, markup);
			try {
				const apart = new Map(pages.map((els, i) => [`/p${i}`, together(els, new Set())]));
				const out = await shareStylesheets({ publicDir: dir, pages: pagesOf, heads, cuts, appended: new Map(), together: apart });
				if ('skipped' in out) return;
				compared++;
				const shared = await Promise.all(out.shared.map((h) => read(dir, h)));
				for (const [route, { markup: html }] of Object.entries(markup)) {
					const own: string[] = await Promise.all(out.heads.get(route)!.map((t) => read(dir, t.attrs.href)));
					assert.deepEqual(await styles([...shared, ...own], html), await styles(used.get(route)!, html), `${route}\nsheet: ${css}`);
				}
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}),
		{ numRuns: 150, seed: 20261102 },
	);
	await tab.close();
	assert.ok(compared > 100, `only ${compared} of 150 runs shared a sheet`);
});
