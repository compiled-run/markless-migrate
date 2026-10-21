// HTML to TSRX markup with the same DOM: text and attribute values that TSRX would read as syntax become string
// expressions, `<markless-component>` placeholders become component tags, and asset URLs become imported bindings.
import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BOOLEAN = new Set([
	'hidden',
	'disabled',
	'checked',
	'multiple',
	'selected',
	'readonly',
	'required',
	'open',
	'async',
	'defer',
	'autofocus',
	'controls',
	'autoplay',
	'loop',
	'muted',
	'playsinline',
	'allowfullscreen',
	'novalidate',
	'reversed',
	'nomodule',
	'inert',
]);
const ATTRIBUTE_NAME = /^[A-Za-z_][\w.-]*(:[A-Za-z_][\w-]*)?$/;

export interface Converted {
	readonly tsrx: string;
	readonly imports: ReadonlyMap<string, string>;
}

export interface Options {
	// An attribute value the page must import (a source asset), or undefined to keep the value.
	readonly asset?: (value: string, attribute: string, tag: string) => { readonly specifier: string; readonly suffix: string } | undefined;
}

// Vite's import.meta.glob transform reads .tsrx sources before Markless compiles them, so the phrase never appears verbatim.
const lit = (text: string) => JSON.stringify(text).replace(/import\.meta/g, 'import\\u002emeta');
// TSRX reads `//` and `/*` in template text as comments.
const escapeText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/@/g, '&#64;').replace(/\/(?=[/*])/g, '&#47;');
const collapse = (t: string) => t.replace(/[ \t\n\r\f]+/g, ' ');
const textOut = (t: string) => (/[\n\t\r\f\u00a0\u200b]| {2}|^ | $|import\.meta/.test(t) || !t.replace(/[ \t\n\r\f]/g, '') ? `{${lit(t)}}` : escapeText(t));

class Writer {
	readonly imports = new Map<string, string>();
	readonly options: Options;
	constructor(options: Options) {
		this.options = options;
	}

	binding(specifier: string): string {
		let name = this.imports.get(specifier);
		if (!name) {
			name = `asset${this.imports.size}`;
			this.imports.set(specifier, name);
		}
		return name;
	}

	attributes(el: Element): string {
		return el.attrs
			.filter((a) => ATTRIBUTE_NAME.test(a.name))
			.map((a) => {
				const name = a.prefix === 'xlink' && a.name === 'href' ? 'xlink:href' : a.prefix ? `${a.prefix}:${a.name}` : a.name;
				// A style that points at a source asset: the url() takes the imported binding.
				if (name === 'style' && this.options.asset && /url\(/.test(a.value)) {
					const parts: string[] = [];
					let rest = a.value;
					let changed = false;
					for (const match of a.value.matchAll(/url\(([^)]+)\)/g)) {
						const found = this.options.asset(match[1]!, 'src', el.tagName);
						if (!found) continue;
						const at = rest.indexOf(match[0]);
						parts.push(lit(rest.slice(0, at + 4)), this.binding(found.specifier), lit(found.suffix + ')'));
						rest = rest.slice(at + match[0].length);
						changed = true;
					}
					if (changed) return ` style={${[...parts, lit(rest)].join(' + ')}}`;
				}
				const asset = this.options.asset?.(a.value, name, el.tagName);
				if (asset) {
					const binding = this.binding(asset.specifier);
					return asset.suffix ? ` ${name}={${binding} + ${lit(asset.suffix)}}` : ` ${name}={${binding}}`;
				}
				// TSRX drops a namespaced attribute written as one (xml:space, xlink:href); a spread keeps it. An xmlns:
				// declaration does nothing in an HTML document, and Markless would have to treat every SVG as dynamic.
				if (name.startsWith('xmlns:')) return '';
				if (name.includes(':')) return ` {...{ ${lit(name)}: ${lit(a.value)} }}`;
				if (a.value === '' && BOOLEAN.has(name)) return ` ${name}`;
				if (/["{}\\&@<>\n']|import\.meta/.test(a.value)) return ` ${name}={${lit(a.value)}}`;
				return ` ${name}="${a.value}"`;
			})
			.join('');
	}

	children(parent: ParentNode, pre: boolean): string {
		return parent.childNodes.map((n) => this.node(n, pre)).join('');
	}

	node(n: Node, pre: boolean): string {
		if (n.nodeName === '#text') {
			const t = (n as DefaultTreeAdapterMap['textNode']).value;
			return pre ? textOut(t) : textOut(collapse(t));
		}
		if (n.nodeName === '#comment' || n.nodeName === '#documentType') return '';
		const el = n as Element;
		const name = el.tagName;
		if (name === 'markless-component') {
			const attr = (key: string) => el.attrs.find((a) => a.name === key)?.value ?? '';
			const props = JSON.parse(attr('props') || '{}') as Record<string, unknown>;
			const rendered = Object.entries(props)
				.map(([key, value]) =>
					typeof value === 'string'
						? ` ${key}=${lit(value)}`
						: value && typeof value === 'object' && '$expression' in value
							? ` ${key}={${(value as { $expression: string }).$expression}}`
							: ` ${key}={${JSON.stringify(value)}}`,
				)
				.join('');
			return `<${attr('name')}${rendered} />`;
		}
		if (VOID.has(name)) return `<${name}${this.attributes(el)} />`;
		const inPre = pre || name === 'pre' || name === 'textarea';
		const content = name === 'template' ? this.children((el as DefaultTreeAdapterMap['template']).content, inPre) : this.children(el, inPre);
		return `<${name}${this.attributes(el)}>${content}</${name}>`;
	}
}

export function convert(html: string, options: Options = {}): Converted {
	const writer = new Writer(options);
	const fragment = parseFragment(html);
	const lines = fragment.childNodes.map((n) => writer.node(n, false)).filter(Boolean);
	return { tsrx: lines.join('\n'), imports: writer.imports };
}
