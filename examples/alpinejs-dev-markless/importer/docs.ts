import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderDoc, frontMatter, DEMO_MARK, type Heading, type RenderedDoc } from './markdown.ts';

export interface Section {
	readonly slug: string;
	readonly title: string;
	readonly prefix: string;
	readonly order: number;
}

export interface DocPage {
	readonly route: string;
	readonly file: string;
	readonly title: string;
	readonly prefix: string;
	readonly section: Section | undefined;
	readonly order: number;
	readonly doc: RenderedDoc;
}

const order = (value: string | undefined) => Number(value ?? 1000);

// Pages and sections come from the docs' own front matter: a section is a .md file with type: sub-directory, its pages
// are the files in the folder of the same name, both sorted by order (ties by file name, as the site lists them).
export function loadDocs(root: string): DocPage[] {
	return loadAll(root).pages;
}

// A section's own .md has only front matter; the site still answers its URL with the docs layout and an empty column.
export function loadSections(root: string): DocPage[] {
	return loadAll(root).sections.map((section) => ({ route: `/${section.slug}`, file: `${section.slug}.md`, title: section.title, prefix: '', section: undefined, order: section.order, doc: renderDoc(readFileSync(join(root, `${section.slug}.md`), 'utf8')) }));
}

function loadAll(root: string): { pages: DocPage[]; sections: Section[] } {
	const top = readdirSync(root).filter((name) => name.endsWith('.md')).sort();
	const sections: Section[] = [];
	const pages: DocPage[] = [];
	for (const name of top) {
		const slug = name.replace(/\.md$/, '');
		const source = readFileSync(join(root, name), 'utf8');
		const { front } = frontMatter(source);
		if (front.type === 'sub-directory') {
			sections.push({ slug, title: front.title ?? slug, prefix: front.prefix ?? '', order: order(front.order) });
			continue;
		}
		const doc = renderDoc(source);
		pages.push({ route: `/${slug}`, file: name, title: front.title ?? slug, prefix: front.prefix ?? '', section: undefined, order: order(front.order), doc });
	}
	for (const section of sections) {
		for (const name of readdirSync(join(root, section.slug)).filter((n) => n.endsWith('.md')).sort()) {
			const source = readFileSync(join(root, section.slug, name), 'utf8');
			const doc = renderDoc(source);
			const slug = name.replace(/\.md$/, '');
			pages.push({ route: `/${section.slug}/${slug}`, file: `${section.slug}/${name}`, title: doc.front.title ?? slug, prefix: doc.front.prefix ?? section.prefix, section, order: order(doc.front.order), doc });
		}
	}
	const rank = (page: DocPage) => [page.section ? page.section.order : page.order, page.section ? page.order : 0];
	pages.sort((a, b) => {
		const [a1, a2] = rank(a), [b1, b2] = rank(b);
		return a1! - b1! || a2! - b2! || a.file.localeCompare(b.file);
	});
	return { pages, sections };
}

export function label(page: DocPage): string {
	return `${page.prefix}${page.title}`;
}

export type { Heading };
export { DEMO_MARK };
