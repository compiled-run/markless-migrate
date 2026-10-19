import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadDocs, loadSections, label, type DocPage } from './docs.ts';
import { docsPage, type DemoRef } from './docs-page.ts';
import { translateDemos, failures } from './alpine.ts';
import { lit } from './tsrx.ts';
import { write, GENERATED } from './write.ts';
import { generateServerPages } from './server-pages.ts';

const APP = join(import.meta.dirname, '..');
const out = (path: string) => join(APP, path);

const docs = loadDocs(out('content/docs'));

const slug = (route: string) => route.slice(1).replace(/\//g, '-');

const persistedByRoute: Record<string, Record<string, string>> = {};
for (const [index, page] of docs.entries()) {
	const module = page.doc.demos.length ? `demos/${slug(page.route)}.tsrx` : undefined;
	const translated = translateDemos(page.doc.demos, { route: page.route, up: '../' });
	if (module && translated.module) write(out(module), translated.module);
	if (Object.keys(translated.persisted).length) persistedByRoute[page.route] = translated.persisted;
	write(out(`pages${page.route}.tsrx`), docsPage(page, docs[index - 1], docs[index + 1], translated.refs, translated.module ? module : undefined));
}

const sections = loadSections(out('content/docs'));
for (const section of sections) write(out(`pages${section.route}/index.tsrx`), docsPage(section, undefined, undefined, [], undefined, true));

// The sidebar: top-level pages, then each section's pages, in the order the docs' front matter gives them.
const nav = [] as string[];
let lastSection: string | undefined;
for (const page of docs) {
	if (!page.section) {
		nav.push(`\t{ kind: 'link', href: ${lit(page.route)}, label: ${lit(page.title)} },`);
		continue;
	}
	if (page.section.slug !== lastSection) {
		if (lastSection) nav.push('\t] },');
		if (page.section.slug === docs.find((p) => p.section)?.section?.slug) {}
		nav.push(`\t{ kind: 'section', title: ${lit(page.section.title)}, items: [`);
		lastSection = page.section.slug;
	}
	nav.push(`\t\t{ href: ${lit(page.route)}, prefix: ${lit(page.prefix)}, label: ${lit(page.title)} },`);
}
nav.push('\t] },');
write(out('generated/nav.ts'), `${GENERATED}import type { NavEntry } from '../nav.ts';

export const DOCS_NAV: readonly NavEntry[] = [
${nav.join('\n')}
];
`);

// <title>, description and social image per route, from front matter as the site's layout writes them.
const heads = [...docs, ...sections].map((page: DocPage) => `\t${lit(page.route)}: { title: ${lit(`${page.title} — Alpine.js`)}, description: ${lit(page.doc.front.description ?? '')}, image: ${lit(page.doc.front.graph_image ?? '')} },`);
write(out('generated/heads.ts'), `${GENERATED}import type { Head } from '../site.ts';

export const DOC_HEADS: Readonly<Record<string, Head>> = {
${heads.join('\n')}
};

export const DOC_ROUTES: readonly string[] = ${JSON.stringify([...docs, ...sections].map((p) => p.route))};
`);
// Alpine's $persist writes each value's JSON to localStorage when the page starts, before anyone uses it.
write(out('generated/persist.ts'), `${GENERATED}export const PERSISTED: Readonly<Record<string, Readonly<Record<string, string>>>> = ${JSON.stringify(persistedByRoute)};\n`);

const server = generateServerPages();

// What the old server answers besides its pages: the component pages its sidebar links but only sells (302 to
// /components), unknown component pages (404), and every other unknown path (302 to the installation page).
const layout = readFileSync(out('content/server-pages/component-layout.json'), 'utf8');
const locked = [...new Set([...layout.matchAll(/\/component\/([\w-]+)/g)].map((m) => `/component/${m[1]}`))].filter((r) => !server.routes.includes(r)).sort();
const pages = ['/', ...docs.map((p) => p.route), ...sections.map((p) => p.route), ...server.routes];
write(out('generated/routes.ts'), `${GENERATED}export const PAGE_ROUTES: readonly string[] = ${JSON.stringify(pages)};

export const LOCKED_COMPONENTS: readonly string[] = ${JSON.stringify(locked)};
`);
console.log(`importer: ${docs.length} docs pages, ${server.routes.length} server-rendered pages`);
if (failures.length) {
	console.error(`demos not translated:\n  ${failures.join('\n  ')}`);
	process.exitCode = 1;
}
void label;
void rmSync;
