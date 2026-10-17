// Runs in the browser: writes a DOM subtree as TSRX markup. Every text node becomes a string expression, so
// whitespace, entities and braces survive exactly; comments and scripts are dropped.
export function toTsrx(root, options = {}) {
	const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
	const skip = options.skip ?? (() => false);
	const attr = (name, value) => {
		if (value === '') return ` ${name}=""`;
		if (/["{}<>&\n]/.test(value)) return ` ${name}={${JSON.stringify(value)}}`;
		return ` ${name}="${value}"`;
	};
	const walk = (node, depth) => {
		const pad = '\t'.repeat(depth);
		if (node.nodeType === 3) {
			const text = node.data;
			if (text === '') return '';
			return `${pad}{${JSON.stringify(text)}}\n`;
		}
		if (node.nodeType !== 1) return '';
		const el = node;
		const tag = el.tagName.toLowerCase();
		if (tag === 'script' || skip(el)) return '';
		const attrs = [...el.attributes].map((a) => attr(a.name, a.value)).join('');
		const extra = options.attrs?.(el) ?? '';
		if (VOID.has(tag)) return `${pad}<${tag}${attrs}${extra} />\n`;
		const kids = [...el.childNodes].map((c) => walk(c, depth + 1)).join('');
		if (!kids) return `${pad}<${tag}${attrs}${extra}></${tag}>\n`;
		return `${pad}<${tag}${attrs}${extra}>\n${kids}${pad}</${tag}>\n`;
	};
	return walk(root, options.depth ?? 0);
}
