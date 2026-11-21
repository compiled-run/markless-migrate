// The convert budget's fixture, written to disk once and converted by every tree the job compares (CI writes it from main's copy).
// The corpus micro-site at COPIES paths each, every page carrying the same large search dialog in its header and one site
// stylesheet, as the ui.shadcn.com pages do: memory a convert holds per page grows with the routes here as it does there.
// It has no old source, so what the source resolvers keep is not measured here; libraries.json carries STATE_COMPONENTS
// React-state components the page does not show, as many as the ui.shadcn.com source gives, so matching them on each page is measured.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { StateComponent } from '../src/library/types.ts';
import { ORIGINAL } from '../test/corpus/site.ts';

export const COPIES = 2;
const PALETTE_ITEMS = 1500;
const SHEET_RULES = 3000;
const STATE_COMPONENTS = 75;
const SIDEBAR_LINKS = 400;

// Shaped as shadcn's SliderControlled: a div around a label and the value's text, beside a slider.
const stateComponents = Array.from({ length: STATE_COMPONENTS }, (_, i): StateComponent => ({
	file: `components/stateful-${i}.tsx`,
	line: 1,
	component: `Stateful${i}`,
	slots: [{ name: 'value', kind: 'state', init: [String(i)] }],
	nodes: [{ kind: 'element', tag: 'div', attrs: {}, children: [{ kind: 'element', tag: 'div', attrs: {}, children: [{ kind: 'element', attrs: {}, slots: ['label'] }, { kind: 'element', tag: 'span', attrs: {}, text: { code: [0], initial: String(i) } }] }, { kind: 'element', attrs: { 'aria-label': `Value ${i}` }, slots: ['slider'] }] }],
}));

const routes = Object.keys(ORIGINAL).flatMap((route) => Array.from({ length: COPIES }, (_, i) => (i === 0 ? route : `${route.replace(/\/$/, '')}/copy-${i}`)));

const items = Array.from({ length: PALETTE_ITEMS }, (_, i) => `<div role="option" class="item item-${i % 40}" data-value="page ${i}"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg><span>Page ${i}</span></div>`).join('');
// A Radix-style dialog portalled to the end of the body by a header button: convert reveals it on every page.
const SEARCH = `<button type="button" id="mm-search" aria-haspopup="dialog" aria-expanded="false" class="search">Search documentation</button><script>
(() => { const t = document.getElementById('mm-search'); let d;
t.addEventListener('click', () => {
	if (d) { d.remove(); d = undefined; t.setAttribute('aria-expanded', 'false'); return; }
	d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.className = 'palette';
	d.innerHTML = '<input placeholder="Search" class="palette-input"><div role="listbox" class="palette-list">${items}</div>';
	document.body.append(d); t.setAttribute('aria-expanded', 'true');
}); })();</script>`;
const SHEET = Array.from({ length: SHEET_RULES }, (_, i) => `.item-${i % 40}.u${i}{padding:${i % 9}px;color:#${(i * 2654435761).toString(16).slice(-6).padStart(6, '0')}}`).join('\n');

// The docs sidebar each ui.shadcn.com page carries (its pages average 1250 elements, the micro-site's 24), for matchMs.
const SIDEBAR = `<nav class="sidebar"><ul>${Array.from({ length: SIDEBAR_LINKS }, (_, i) => `<li class="sidebar-item"><a href="/docs/page-${i}">Page ${i}</a></li>`).join('')}</ul></nav>`;

const pageOf = (route: string): string => ORIGINAL[route.replace(/\/copy-\d+$/, '') || '/'] ?? ORIGINAL[route] ?? '';
const withSearch = (html: string) => html.replace('</title>', '</title><link rel="stylesheet" href="/site.css">').replace('</header>', `${SEARCH}</header>`);

/**
 * Writes the fixture under `dir`: `site/` what the old site serves (`site/routes.json` maps each path to its file),
 * `app/` the app convert writes into, and `match.json` the pages matchMs reads, each with the sidebar.
 */
export async function writeFixture(dir: string): Promise<void> {
	await mkdir(join(dir, 'site'), { recursive: true });
	await mkdir(join(dir, 'app', '.migrate'), { recursive: true });
	const files: Record<string, string> = { '/site.css': 'site.css' };
	await writeFile(join(dir, 'site', 'site.css'), SHEET);
	for (const [i, route] of routes.entries()) {
		files[route] = `page-${i}.html`;
		await writeFile(join(dir, 'site', `page-${i}.html`), withSearch(pageOf(route)));
	}
	await writeFile(join(dir, 'site', 'routes.json'), JSON.stringify(files));
	await writeFile(join(dir, 'app', '.migrate', 'inventory.json'), JSON.stringify({ routes: routes.map((route) => ({ route, status: 200 })) }));
	await writeFile(join(dir, 'app', '.migrate', 'libraries.json'), JSON.stringify({ libraries: [], stateComponents }));
	await writeFile(join(dir, 'app', 'package.json'), JSON.stringify({ name: 'converted', private: true, type: 'module', dependencies: {}, 'markless-migrate': { stylesheetImports: true } }));
	await writeFile(join(dir, 'match.json'), JSON.stringify(routes.map((route) => withSearch(pageOf(route)).replace('<main>', `<main>${SIDEBAR}`))));
}

/** A digest of every file a written fixture holds, to tell two fixtures apart. */
export async function fixtureDigest(dir: string): Promise<string> {
	const hash = createHash('sha256');
	const walk = async (at: string): Promise<string[]> => (await Promise.all((await readdir(at, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(join(at, e.name)) : [join(at, e.name)])))).flat();
	for (const file of (await walk(dir)).sort()) hash.update(relative(dir, file)).update('\0').update(await readFile(file)).update('\0');
	return hash.digest('hex').slice(0, 16);
}
