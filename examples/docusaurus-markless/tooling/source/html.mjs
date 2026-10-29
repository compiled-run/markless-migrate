// Parses HTML into the importer's node shape ({ tag, attrs, children } and strings), dropping comments.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { website } from './site.mjs';

const require = createRequire(join(website, '../node_modules/.pnpm/parse5@7.3.0/node_modules/parse5/package.json'));
const parse5 = require('parse5');

function convert(node) {
	if (node.nodeName === '#text') return node.value;
	if (node.nodeName === '#comment' || node.nodeName === '#documentType') return null;
	if (!node.tagName) return null;
	const content = node.tagName === 'template' ? node.content.childNodes : node.childNodes;
	return {
		tag: node.tagName,
		attrs: node.attrs.map((a) => [a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value]),
		children: merge((content ?? []).map(convert).filter((n) => n !== null)),
	};
}

function merge(nodes) {
	const out = [];
	for (const node of nodes) {
		if (typeof node === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += node;
		else out.push(node);
	}
	return out;
}

export function parseHtml(html) {
	return merge(parse5.parseFragment(html).childNodes.map(convert).filter((n) => n !== null));
}

export function parseDocument(html) {
	return convert(parse5.parse(html).childNodes.find((n) => n.tagName === 'html'));
}
