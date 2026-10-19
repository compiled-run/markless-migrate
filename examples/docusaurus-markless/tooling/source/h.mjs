// A static element tree with React's JSX semantics (props, children, function components, fragments), so the old
// site's MDX output and the ported theme components render to plain markup: no state survives, no code ships.
export const Fragment = Symbol.for('mm.fragment');
const RAW = Symbol.for('mm.raw');

export function jsx(type, props, key) {
	return { $$el: true, type, props: props ?? {}, key };
}
export const jsxs = jsx;
export const jsxDEV = jsx;

export function h(type, props, ...children) {
	const all = { ...(props ?? {}) };
	if (children.length) all.children = children.length === 1 ? children[0] : children;
	return jsx(type, all);
}

// Markup the old site passes through as HTML (dangerouslySetInnerHTML, footer html items); parsed at render time.
export function raw(html) {
	return { [RAW]: html };
}

export const isElement = (value) => Boolean(value && value.$$el);

let rawParser;
export function setRawParser(parse) {
	rawParser = parse;
}

// Context: the page being rendered (its route, metadata, theme config), readable from every component.
let currentContext = {};
export function withContext(context, render) {
	const previous = currentContext;
	currentContext = { ...previous, ...context };
	try {
		return render();
	} finally {
		currentContext = previous;
	}
}
export const useContext = () => currentContext;

const ATTRIBUTE_ALIASES = {
	className: 'class',
	htmlFor: 'for',
	httpEquiv: 'http-equiv',
	acceptCharset: 'accept-charset',
	tabIndex: 'tabindex',
	readOnly: 'readonly',
	autoComplete: 'autocomplete',
	autoFocus: 'autofocus',
	autoPlay: 'autoplay',
	allowFullScreen: 'allowfullscreen',
	crossOrigin: 'crossorigin',
	srcSet: 'srcset',
	srcDoc: 'srcdoc',
	contentEditable: 'contenteditable',
	spellCheck: 'spellcheck',
	maxLength: 'maxlength',
	minLength: 'minlength',
	colSpan: 'colspan',
	rowSpan: 'rowspan',
	frameBorder: 'frameborder',
	referrerPolicy: 'referrerpolicy',
	encType: 'enctype',
	dateTime: 'datetime',
	itemProp: 'itemprop',
	itemScope: 'itemscope',
	itemType: 'itemtype',
	fetchPriority: 'fetchpriority',
	inputMode: 'inputmode',
	enterKeyHint: 'enterkeyhint',
	formAction: 'formaction',
	noValidate: 'novalidate',
	playsInline: 'playsinline',
	strokeWidth: 'stroke-width',
	strokeLinecap: 'stroke-linecap',
	strokeLinejoin: 'stroke-linejoin',
	strokeMiterlimit: 'stroke-miterlimit',
	strokeDasharray: 'stroke-dasharray',
	strokeDashoffset: 'stroke-dashoffset',
	strokeOpacity: 'stroke-opacity',
	fillRule: 'fill-rule',
	fillOpacity: 'fill-opacity',
	clipRule: 'clip-rule',
	clipPath: 'clip-path',
	stopColor: 'stop-color',
	stopOpacity: 'stop-opacity',
	fontFamily: 'font-family',
	fontSize: 'font-size',
	fontWeight: 'font-weight',
	textAnchor: 'text-anchor',
	dominantBaseline: 'dominant-baseline',
	xlinkHref: 'xlink:href',
	xmlnsXlink: 'xmlns:xlink',
	xmlSpace: 'xml:space',
	vectorEffect: 'vector-effect',
	shapeRendering: 'shape-rendering',
	colorInterpolationFilters: 'color-interpolation-filters',
	floodColor: 'flood-color',
	floodOpacity: 'flood-opacity',
	lightingColor: 'lighting-color',
	markerEnd: 'marker-end',
	markerStart: 'marker-start',
	markerMid: 'marker-mid',
	paintOrder: 'paint-order',
	letterSpacing: 'letter-spacing',
	wordSpacing: 'word-spacing',
	writingMode: 'writing-mode',
	alignmentBaseline: 'alignment-baseline',
	baselineShift: 'baseline-shift',
	enableBackground: 'enable-background',
	imageRendering: 'image-rendering',
	pointerEvents: 'pointer-events',
	textDecoration: 'text-decoration',
	textRendering: 'text-rendering',
	unicodeBidi: 'unicode-bidi',
	glyphOrientationVertical: 'glyph-orientation-vertical',
};
const BOOLEAN = new Set(['hidden', 'disabled', 'open', 'checked', 'readonly', 'required', 'selected', 'multiple', 'autofocus', 'autoplay', 'controls', 'loop', 'muted', 'default', 'defer', 'async', 'allowfullscreen', 'novalidate', 'itemscope', 'playsinline', 'reversed', 'nomodule', 'inert']);
const DROP = new Set(['children', 'key', 'ref', 'dangerouslySetInnerHTML', 'suppressHydrationWarning', 'suppressContentEditableWarning']);
const UNITLESS = new Set(['animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth', 'boxFlex', 'boxFlexGroup', 'boxOrdinalGroup', 'columnCount', 'columns', 'flex', 'flexGrow', 'flexPositive', 'flexShrink', 'flexNegative', 'flexOrder', 'gridArea', 'gridRow', 'gridRowEnd', 'gridRowSpan', 'gridRowStart', 'gridColumn', 'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart', 'fontWeight', 'lineClamp', 'lineHeight', 'opacity', 'order', 'orphans', 'scale', 'tabSize', 'widows', 'zIndex', 'zoom', 'fillOpacity', 'floodOpacity', 'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth']);

const kebab = (name) => (name.startsWith('--') ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^ms-/, '-ms-'));

// React's server rendering of a style object: `name:value;name:value`.
export function styleString(style) {
	return Object.entries(style)
		.filter(([, value]) => value !== undefined && value !== null && value !== '' && typeof value !== 'boolean')
		.map(([name, value]) => `${kebab(name)}:${typeof value === 'number' && value !== 0 && !UNITLESS.has(name) && !name.startsWith('--') ? `${value}px` : String(value).trim()}`)
		.join(';');
}

function attributes(type, props) {
	const out = [];
	for (const [name, value] of Object.entries(props)) {
		if (DROP.has(name) || /^on[A-Z]/.test(name) || value === undefined || value === null) continue;
		if (typeof value === 'function' || typeof value === 'symbol') continue;
		let attr = ATTRIBUTE_ALIASES[name] ?? name;
		if (name === 'defaultValue') attr = 'value';
		if (name === 'defaultChecked') attr = 'checked';
		if (attr === 'style' && typeof value === 'object') {
			const css = styleString(value);
			if (css) out.push(['style', css]);
			continue;
		}
		if (attr.startsWith('aria-') || attr.startsWith('data-')) {
			out.push([attr, String(value)]);
			continue;
		}
		if (BOOLEAN.has(attr.toLowerCase())) {
			if (!value) continue;
			out.push([attr.toLowerCase(), '']);
			continue;
		}
		if (value === false) continue;
		if (value === true) {
			out.push([attr, '']);
			continue;
		}
		if (attr === 'class' && value === '') {
			out.push(['class', '']);
			continue;
		}
		out.push([attr, String(value)]);
	}
	void type;
	return out;
}

// Renders a JSX value to nodes: strings, and { tag, attrs, children }.
export function render(value) {
	const out = [];
	const push = (node) => {
		if (typeof node === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += node;
		else out.push(node);
	};
	const walk = (item) => {
		if (item === null || item === undefined || item === false || item === true) return;
		if (Array.isArray(item)) return item.forEach(walk);
		if (typeof item === 'string' || typeof item === 'number' || typeof item === 'bigint') return push(String(item));
		if (item[RAW] !== undefined) {
			const nodes = render(rawParser(item[RAW]));
			const mark = (node) => {
				if (typeof node === 'string') return;
				Object.defineProperty(node, 'raw', { value: true });
				node.children.forEach(mark);
			};
			nodes.forEach(mark);
			return nodes.forEach(push);
		}
		if (item.tag !== undefined && item.attrs) return push(item);
		if (!isElement(item)) {
			if (typeof item[Symbol.iterator] === 'function') return [...item].forEach(walk);
			throw new Error(`cannot render ${JSON.stringify(item)?.slice(0, 200)}`);
		}
		const { type, props } = item;
		if (type === Fragment) return walk(props.children);
		if (typeof type === 'function') return walk(type(props));
		if (typeof type === 'object' && type && type.$$component) return walk(type.$$component(props));
		if (typeof type !== 'string') throw new Error(`unknown element type ${String(type)}`);
		const children = [];
		if (props.dangerouslySetInnerHTML) children.push(...render(raw(props.dangerouslySetInnerHTML.__html)));
		else children.push(...render(props.children));
		const attrs = attributes(type, props);
		const node = { tag: type, attrs, children: type === 'textarea' && props.value !== undefined ? [String(props.value)] : children };
		if (type === 'img' && props.src != null && typeof props.src !== 'string') node.noPreload = true;
		push(node);
	};
	walk(value);
	return out;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
export const isVoid = (tag) => VOID.has(tag);

const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const RAW_TEXT = new Set(['script', 'style']);

export function toHtml(nodes) {
	return nodes
		.map((node) => {
			if (typeof node === 'string') return escapeText(node);
			const attrs = node.attrs.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');
			if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
			const inner = RAW_TEXT.has(node.tag) ? node.children.join('') : toHtml(node.children);
			return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
		})
		.join('');
}

// TSRX markup. Text is written as text (entity-escaped) so it stays part of the static template; JSX-style
// whitespace rules would drop or collapse text that contains a newline, so that text is a string expression, and an
// element holding text is written on one line (a line break next to text would be trimmed away).
const escapeTsrxText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
const tsrxAttr = (name, value) => {
	if (value && typeof value === 'object' && value.expression) return ` ${name}={${value.expression}}`;
	if (value === '') return ` ${name}=""`;
	if (/["{}<>&\n\\]/.test(value)) return ` ${name}={${JSON.stringify(value)}}`;
	return ` ${name}="${value}"`;
};
const hasText = (nodes) => nodes.some((n) => typeof n === 'string' || (n.children && hasText(n.children)));
// A <style> in TSRX markup is the component's scoped CSS, so a page's own <style> element (an SVG's, a page's) is
// written as a script that puts the same element in its place while the page is parsed.
function styleScript(node) {
	const attrs = node.attrs.map(([n, v]) => `e.setAttribute(${JSON.stringify(n)},${JSON.stringify(v)});`).join('');
	return `(function(s){var e=document.createElementNS(s.parentNode.namespaceURI,"style");${attrs}e.textContent=${JSON.stringify(node.children.join(''))};s.replaceWith(e)})(document.currentScript)`;
}
// Markless 0.5.0 drops namespaced attributes (xlink:href, xml:space) from markup, so an element that has them gets a
// script as its first child that sets them while the page is parsed.
const NS = { xlink: 'http://www.w3.org/1999/xlink', xml: 'http://www.w3.org/XML/1998/namespace', xmlns: 'http://www.w3.org/2000/xmlns/' };
function namespaced(node) {
	const ns = node.attrs.filter(([n]) => /^(xlink|xml|xmlns):/.test(n));
	if (!ns.length || VOID.has(node.tag) || RAW_TEXT.has(node.tag)) return node;
	const sets = ns.map(([n, v]) => `e.setAttributeNS(${JSON.stringify(NS[n.split(':')[0]])},${JSON.stringify(n)},${JSON.stringify(v)});`).join('');
	const script = { tag: 'script', attrs: [], children: [`(function(s){var e=s.parentNode;${sets}s.remove()})(document.currentScript)`] };
	return { ...node, attrs: node.attrs.filter(([n]) => !/^(xlink|xml|xmlns):/.test(n)), children: [script, ...node.children] };
}
function inline(nodes, options) {
	return nodes
		.map((node) => {
			if (typeof node === 'string') return node === '' ? '' : node.includes('\n') ? `{${JSON.stringify(node)}}` : escapeTsrxText(node);
			if (node.attrs) node = namespaced(node);
			if (node.expression !== undefined) return node.expression;
			const attrs = node.attrs.map(([n, v]) => tsrxAttr(n, v)).join('') + (options.extra?.(node) ?? '');
			if (VOID.has(node.tag)) return `<${node.tag}${attrs} />`;
			if (node.tag === 'style') return `<script>{${JSON.stringify(styleScript(node))}}</script>`;
			if (RAW_TEXT.has(node.tag)) return `<${node.tag}${attrs}>{${JSON.stringify(node.children.join(''))}}</${node.tag}>`;
			return `<${node.tag}${attrs}>${inline(node.children, options)}</${node.tag}>`;
		})
		.join('');
}
export function toTsrx(nodes, depth = 0, options = {}) {
	const pad = '\t'.repeat(depth);
	return nodes
		.map((node) => {
			if (typeof node === 'string') return node === '' ? '' : `${pad}{${JSON.stringify(node)}}\n`;
			if (node.attrs) node = namespaced(node);
			if (node.expression !== undefined) return `${pad}${node.expression}\n`;
			if (hasText(node.children ?? []) || VOID.has(node.tag) || RAW_TEXT.has(node.tag) || !node.children.length) return `${pad}${inline([node], options)}\n`;
			const attrs = node.attrs.map(([n, v]) => tsrxAttr(n, v)).join('') + (options.extra?.(node) ?? '');
			return `${pad}<${node.tag}${attrs}>\n${toTsrx(node.children, depth + 1, options)}${pad}</${node.tag}>\n`;
		})
		.join('');
}

export function textContent(nodes) {
	return nodes.map((node) => (typeof node === 'string' ? node : textContent(node.children))).join('');
}

// React.Children-like helpers the ported components use.
export function toArray(children) {
	const out = [];
	const walk = (item) => {
		if (item === null || item === undefined || typeof item === 'boolean') return;
		if (Array.isArray(item)) return item.forEach(walk);
		out.push(item);
	};
	walk(children);
	return out;
}
