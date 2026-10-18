import MarkdownIt from 'markdown-it';
import { highlight } from './highlight.ts';

export interface FrontMatter {
	readonly [key: string]: string | undefined;
}

export interface Heading {
	readonly id: string;
	readonly text: string;
	readonly level: 2 | 3 | 4;
}

export interface RenderedDoc {
	readonly front: FrontMatter;
	readonly html: string;
	readonly demos: readonly string[];
	readonly headings: readonly Heading[];
}

export const DEMO_MARK = 'data-port-demo';

export function frontMatter(source: string): { front: FrontMatter; body: string } {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
	if (!match) return { front: {}, body: source };
	const front: Record<string, string> = {};
	for (const line of match[1]!.split('\n')) {
		const pair = /^([\w-]+):\s*(.*)$/.exec(line);
		if (pair) front[pair[1]!] = pair[2]!.trim();
	}
	return { front, body: source.slice(match[0].length) };
}

const md = new MarkdownIt({ html: true, linkify: false, typographer: false, highlight: (code, lang) => highlight(code.replace(/\n$/, ''), lang) });

const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');

// The site renders <a name="x"></a> before a heading as the heading's id and wraps its text in a link to it; the page's
// contents script gives every other h2-h4 an id from its text.
export function renderDoc(source: string): RenderedDoc {
	const { front, body } = frontMatter(source);
	const demos: string[] = [];
	const verbatim = body.replace(/<!-- START_VERBATIM -->([\s\S]*?)<!-- END_VERBATIM -->/g, (_, html: string) => {
		demos.push(html.trim());
		return `\n<div ${DEMO_MARK}="${demos.length - 1}"></div>\n`;
	});
	let html = md.render(verbatim);
	html = html.replace(/<p><a name="([^"]*)"><\/a><\/p>\n?/g, '<a name="$1"></a>\n');
	html = html.replace(/<a name="([^"]*)"><\/a>\n?(<h([1-6])>)([\s\S]*?)<\/h\3>/g, (_, id: string, _open: string, level: string, inner: string) => `<h${level} id="${id}"><a href="#${id}">${inner}</a></h${level}>`);
	html = html.replace(/<a name="[^"]*"><\/a>\n?/g, '');
	const headings: Heading[] = [];
	html = html.replace(/<h([234])( id="([^"]*)")?>([\s\S]*?)<\/h\1>/g, (whole, level: string, _attr: string | undefined, id: string | undefined, inner: string) => {
		const text = plain(inner);
		const finalId = id ?? text.replace(/\s+/g, '-').toLowerCase();
		headings.push({ id: finalId, text, level: Number(level) as 2 | 3 | 4 });
		return id ? whole : `<h${level} id="${finalId}">${inner}</h${level}>`;
	});
	return { front, html, demos, headings };
}
