import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';

/** An element of the converted app's markup, as its `.tsrx` writes it. */
export interface PortElement {
	readonly file: string;
	/** Index among the file's elements, in document order. */
	readonly index: number;
	readonly tag: string;
	/** Attributes with a literal value; an expression's attribute is present with the value `{}`. */
	readonly attrs: Readonly<Record<string, string>>;
	/** Events whose handler the markup writes itself (Markless handlers), not the delegating `behave(event)`. */
	readonly handlers: readonly string[];
	/** Static text inside it, whitespace removed. */
	readonly text: string;
	/** The `@case` values it sits under. */
	readonly cases: readonly string[];
	/** The key of the layer it is part of (a menu's content, mounted when its trigger is used), if any. */
	readonly layer?: string;
	/** Index of its parent element in the same file. */
	readonly parent?: number;
}

export interface PortFile {
	readonly file: string;
	readonly elements: readonly PortElement[];
	/** The routes a page's header lists. */
	readonly routes: readonly string[];
	/** Local component name to the file it is imported from. */
	readonly imports: ReadonlyMap<string, string>;
	readonly text: string;
}

// Enough text to find a control by; a container's whole page of text is never matched against.
const MAX_TEXT = 400;
const UNINDEXED = new Set(['class', 'style', 'd', 'viewBox', 'points', 'transform']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['style', 'script', 'textarea', 'title']);
const CONTROL = /^@(switch|case|default|if|else|for)\b/;
const EVENT_PROP: Readonly<Record<string, string>> = { onClick: 'click', onKeyDown: 'keydown', onKeyUp: 'keyup', onInput: 'input', onChange: 'input', onSubmit: 'submit', onPointerDown: 'pointerdown', onPointerOver: 'pointerover', onPointerOut: 'pointerout', onFocusIn: 'focusin', onFocusOut: 'focusout', onContextMenu: 'contextmenu', onMouseDown: 'pointerdown' };

/** Index of the end of a `{...}` (or `(...)`) group starting at `at`, past strings, templates and comments. */
export function groupEnd(text: string, at: number): number {
	const open = text[at]!;
	const close = open === '{' ? '}' : open === '(' ? ')' : ']';
	let depth = 0;
	for (let i = at; i < text.length; i++) {
		const c = text[i]!;
		if (c === '"' || c === "'" || c === '`') {
			i = stringEnd(text, i);
			continue;
		}
		if (c === '/' && text[i + 1] === '/') {
			const nl = text.indexOf('\n', i);
			i = nl < 0 ? text.length : nl;
			continue;
		}
		if (c === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2);
			i = end < 0 ? text.length : end + 1;
			continue;
		}
		if (c === '{' || c === '(' || c === '[') depth++;
		else if (c === '}' || c === ')' || c === ']') {
			depth--;
			if (depth === 0 && c === close) return i;
		}
	}
	return text.length - 1;
}

function stringEnd(text: string, at: number): number {
	const q = text[at]!;
	for (let i = at + 1; i < text.length; i++) {
		const c = text[i]!;
		if (c === '\\') {
			i++;
			continue;
		}
		if (q === '`' && c === '$' && text[i + 1] === '{') {
			i = groupEnd(text, i + 1);
			continue;
		}
		if (c === q) return i;
	}
	return text.length - 1;
}

/** A JS string literal's value, or undefined when `expr` is anything else. */
function stringLiteral(expr: string): string | undefined {
	const e = expr.trim();
	if (!/^(["'])[\s\S]*\1$/.test(e) && !/^`[^`$]*`$/.test(e)) return undefined;
	if (e[0] === '`') return e.slice(1, -1);
	try {
		return e[0] === '"' ? (JSON.parse(e) as string) : (JSON.parse(`"${e.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) as string);
	} catch {
		return undefined;
	}
}

export type Token =
	| { readonly t: 'open'; readonly tag: string; readonly attrs: readonly (readonly [string, string | undefined, string | undefined])[]; readonly self: boolean }
	| { readonly t: 'close'; readonly tag: string }
	| { readonly t: 'text'; readonly text: string }
	| { readonly t: 'control'; readonly kind: string; readonly arg: string }
	| { readonly t: 'end' };

/**
 * The markup of a `.tsrx` module as tokens: elements (attribute name, literal value, expression source), text, and the
 * `@switch`/`@case`/`@if`/`@for` blocks around them. Script statements between are skipped or read as text.
 */
export function tokenize(text: string): Token[] {
	const out: Token[] = [];
	let i = text.indexOf('@{');
	if (i < 0) return out;
	i += 2;
	const depth: number[] = [];
	let inMarkup = false;
	let raw: string | undefined;
	while (i < text.length) {
		if (raw) {
			const end = text.indexOf(`</${raw}`, i);
			const stop = end < 0 ? text.length : end;
			if (stop > i) out.push({ t: 'text', text: text.slice(i, stop) });
			i = stop;
			raw = undefined;
			continue;
		}
		const c = text[i]!;
		if (c === '<' && /[A-Za-z>/]/.test(text[i + 1] ?? '')) {
			const prev = text.slice(Math.max(0, i - 1), i);
			if (!inMarkup && /[\w)\]]/.test(prev)) {
				i++;
				continue;
			}
			inMarkup = true;
			if (text[i + 1] === '/') {
				const end = text.indexOf('>', i);
				out.push({ t: 'close', tag: text.slice(i + 2, end).trim() });
				i = end + 1;
				continue;
			}
			if (text[i + 1] === '>') {
				out.push({ t: 'open', tag: '', attrs: [], self: false });
				i += 2;
				continue;
			}
			const name = /^[A-Za-z][\w.:-]*/.exec(text.slice(i + 1, i + 200))![0];
			let j = i + 1 + name.length;
			const attrs: [string, string | undefined, string | undefined][] = [];
			let self = false;
			while (j < text.length) {
				while (/\s/.test(text[j] ?? '')) j++;
				const ch = text[j];
				if (ch === '>') {
					j++;
					break;
				}
				if (ch === '/' && text[j + 1] === '>') {
					self = true;
					j += 2;
					break;
				}
				if (ch === '{') {
					const end = groupEnd(text, j);
					attrs.push(['...', undefined, text.slice(j + 1, end)]);
					j = end + 1;
					continue;
				}
				const an = /^[^\s=/>{]+/.exec(text.slice(j, j + 200))?.[0];
				if (!an) {
					j++;
					continue;
				}
				j += an.length;
				if (text[j] !== '=') {
					attrs.push([an, '', undefined]);
					continue;
				}
				j++;
				if (text[j] === '"' || text[j] === "'") {
					const end = text.indexOf(text[j]!, j + 1);
					attrs.push([an, text.slice(j + 1, end), undefined]);
					j = end + 1;
				} else if (text[j] === '{') {
					const end = groupEnd(text, j);
					const expr = text.slice(j + 1, end);
					attrs.push([an, stringLiteral(expr), expr]);
					j = end + 1;
				}
			}
			out.push({ t: 'open', tag: name, attrs, self });
			if (!self && RAW.has(name.toLowerCase())) raw = name;
			i = j;
			continue;
		}
		if (c === '@') {
			const m = CONTROL.exec(text.slice(i, i + 12));
			if (m) {
				let j = i + m[0].length;
				while (/\s/.test(text[j] ?? '')) j++;
				let arg = '';
				if (text[j] === '(') {
					const end = groupEnd(text, j);
					arg = text.slice(j + 1, end);
					j = end + 1;
				} else if (m[1] === 'case') {
					const colon = text.indexOf(':', /["'`]/.test(text[j] ?? '') ? stringEnd(text, j) : j);
					arg = text.slice(j, colon).trim();
					j = colon + 1;
				} else if (m[1] === 'default') j = text.indexOf(':', j) + 1;
				const brace = text.indexOf('{', j);
				out.push({ t: 'control', kind: m[1]!, arg: m[1] === 'case' ? (stringLiteral(arg) ?? arg) : arg });
				depth.push(out.length);
				i = brace + 1;
				continue;
			}
		}
		if (c === '{') {
			const end = groupEnd(text, i);
			const lit = stringLiteral(text.slice(i + 1, end));
			if (lit !== undefined && inMarkup) out.push({ t: 'text', text: lit });
			i = end + 1;
			continue;
		}
		if (c === '}') {
			if (depth.length) {
				depth.pop();
				out.push({ t: 'end' });
			}
			i++;
			continue;
		}
		const next = text.slice(i).search(/[<@{}]/);
		const stop = next < 0 ? text.length : i + Math.max(1, next);
		if (inMarkup) out.push({ t: 'text', text: text.slice(i, stop) });
		i = stop;
	}
	return out;
}

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function handlersOf(attrs: readonly (readonly [string, string | undefined, string | undefined])[]): string[] {
	const out: string[] = [];
	for (const [name, , expr] of attrs) {
		const event = EVENT_PROP[name];
		if (event && expr !== undefined && !/^\s*\(?\s*event\s*\)?\s*=>\s*behave\(event\)\s*$/.test(expr)) out.push(event);
	}
	return out;
}

/** Reads a `.tsrx` module into its elements, the routes its header names and the components it imports. */
export function readPortFile(file: string, text: string): PortFile {
	const routes = /^\/\/ Generated by markless-migrate convert from the old site;[^\n(]*\(([^\n]*)\)\s*$/m.exec(text)?.[1]?.split(', ').filter((r) => r.startsWith('/')) ?? [];
	const imports = new Map<string, string>();
	for (const m of text.matchAll(/^import\s+(\w+)\s+from\s+'([^']+\.tsrx)';/gm)) imports.set(m[1]!, m[2]!);
	const elements: PortElement[] = [];
	const stack: { tag: string; attrs: Record<string, string>; handlers: string[]; text: string[]; cases: string[]; index: number; layer?: string }[] = [];
	const cases: string[] = [];
	const controls: string[] = [];
	const finish = () => {
		const top = stack.pop()!;
		const own = top.text.join('').replace(/\s+/g, '').slice(0, MAX_TEXT);
		const parent = stack.at(-1)?.index;
		elements[top.index] = { file, index: top.index, tag: top.tag, attrs: top.attrs, handlers: top.handlers, text: own, cases: top.cases, ...(top.layer ? { layer: top.layer } : {}), ...(parent !== undefined ? { parent } : {}) };
		if (stack.length) stack[stack.length - 1]!.text.push(own);
	};
	for (const tok of tokenize(text)) {
		if (tok.t === 'open') {
			if (!tok.tag) continue;
			const attrs: Record<string, string> = {};
			for (const [n, v, e] of tok.attrs) if (n !== '...' && !UNINDEXED.has(n) && !/^on[A-Z]/.test(n)) attrs[n] = v !== undefined ? decode(v) : e !== undefined ? '{}' : '';
			const layer = attrs['data-mm-layer'] || attrs['data-mm-layer-keys']?.split(' ')[0] || stack.at(-1)?.layer || (/(^|\/)layers\//.test(file) ? file : undefined);
			const entry = { tag: tok.tag, attrs, handlers: handlersOf(tok.attrs), text: [] as string[], cases: [...cases], index: elements.length, ...(layer ? { layer } : {}) };
			elements.push(undefined as unknown as PortElement);
			stack.push(entry);
			if (tok.self || VOID.has(tok.tag)) finish();
		} else if (tok.t === 'close') {
			if (!tok.tag) continue;
			const at = stack.map((s) => s.tag).lastIndexOf(tok.tag);
			if (at < 0) continue;
			while (stack.length > at) finish();
		} else if (tok.t === 'text') {
			if (stack.length) stack[stack.length - 1]!.text.push(decode(tok.text));
		} else if (tok.t === 'control') {
			controls.push(tok.kind);
			if (tok.kind === 'case') cases.push(tok.arg);
			if (tok.kind === 'default') cases.push('');
		} else if (tok.t === 'end') {
			const kind = controls.pop();
			if (kind === 'case' || kind === 'default') cases.pop();
		}
	}
	while (stack.length) finish();
	return { file, elements: elements.filter(Boolean), routes, imports, text };
}

async function listTsrx(dir: string, out: string[] = []): Promise<string[]> {
	for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) await listTsrx(path, out);
		} else if (entry.name.endsWith('.tsrx')) out.push(path);
	}
	return out;
}

/** Every `.tsrx` of a converted app (pages, converted components and layers, the site's own components), read. */
export async function readPort(app: string): Promise<Map<string, PortFile>> {
	const files = [...(await Promise.all(['pages', 'components', join('lib', 'site')].map((d) => listTsrx(join(app, d))))).flat(), join(app, 'document.tsrx')].sort();
	const out = new Map<string, PortFile>();
	await Promise.all(
		files.map(async (path) => {
			const file = relative(app, path).split(sep).join('/');
			const text = await readFile(path, 'utf8').catch(() => undefined);
			if (text !== undefined) out.set(file, readPortFile(file, text));
		}),
	);
	return out;
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * A page of the converted app as HTML for one route: components inlined, the `@case` of each `@switch` the route
 * selects (else its `@default`, else its first), `@if` branches kept and `@else` dropped, a `@for` body once.
 * Markless handlers are written as `data-mm-ledger-on`, and each element carries `data-mm-ledger` (file#index).
 */
export function renderRoute(port: ReadonlyMap<string, PortFile>, file: string, route: string, depth = 0): string {
	const pf = port.get(file);
	if (!pf || depth > 12) return '';
	const tokens = tokenOf(pf);
	const search = route.includes('?') ? route.slice(route.indexOf('?')) : '';
	const path = route.split('?')[0]!;
	const values = routeValues(pf, route, path);
	const valueOf = (expr: string | undefined) => {
		const key = expr && /^\s*values(?:\[["'](\w+)["']\]|\.(\w+))\s*$/.exec(expr);
		return key ? values[key[1] ?? key[2]!] : undefined;
	};
	let html = '';
	let index = 0;
	// Each open control: whether its content is kept.
	const keep: boolean[] = [];
	const kinds: string[] = [];
	const switches: { chosen?: string }[] = [];
	const kept = () => keep.every(Boolean);
	// The case each @switch keeps, found by scanning its cases first.
	const choose = (at: number): string | undefined => {
		const values: string[] = [];
		let d = 0;
		for (let k = at + 1; k < tokens.length; k++) {
			const t = tokens[k]!;
			if (t.t === 'control') {
				if (d === 0 && t.kind === 'case') values.push(t.arg);
				if (d === 0 && t.kind === 'default') values.push('\0default');
				d++;
			} else if (t.t === 'end') {
				if (d === 0) break;
				d--;
			}
		}
		return values.find((v) => v === route || v === path || (search && v === search)) ?? (values.includes('\0default') ? '\0default' : values[0]);
	};
	for (let k = 0; k < tokens.length; k++) {
		const tok = tokens[k]!;
		if (tok.t === 'control') {
			kinds.push(tok.kind);
			if (tok.kind === 'switch') {
				switches.push({ chosen: choose(k) });
				keep.push(true);
			} else if (tok.kind === 'case' || tok.kind === 'default') keep.push(switches.at(-1)?.chosen === (tok.kind === 'default' ? '\0default' : tok.arg));
			else keep.push(tok.kind !== 'else');
			continue;
		}
		if (tok.t === 'end') {
			keep.pop();
			if (kinds.pop() === 'switch') switches.pop();
			continue;
		}
		if (tok.t === 'open' && tok.tag) {
			const at = index++;
			if (!kept()) continue;
			if (/^[A-Z]/.test(tok.tag)) {
				const from = pf.imports.get(tok.tag);
				if (from) html += renderRoute(port, posix.normalize(posix.join(posix.dirname(file), from)), route, depth + 1);
				continue;
			}
			const on = handlersOf(tok.attrs);
			const attrs = tok.attrs.map(([n, v, e]) => [n, v ?? valueOf(e)] as const).filter(([n, v]) => n !== '...' && !/^on[A-Z]/.test(n) && v !== undefined).map(([n, v]) => (v === '' ? ` ${n}` : ` ${n}="${escapeAttr(v!)}"`));
			html += `<${tok.tag}${attrs.join('')} data-mm-ledger="${file}#${at}"${on.length ? ` data-mm-ledger-on="${on.join(' ')}"` : ''}${tok.self && !VOID.has(tok.tag) ? `></${tok.tag}>` : '>'}`;
		} else if (tok.t === 'close' && tok.tag && !/^[A-Z]/.test(tok.tag)) {
			if (kept() && !VOID.has(tok.tag)) html += `</${tok.tag}>`;
		} else if (tok.t === 'text' && kept()) html += tok.text.replace(/</g, '&lt;');
	}
	return html;
}

const tokens = new WeakMap<PortFile, Token[]>();
const tokenOf = (pf: PortFile): Token[] => {
	let t = tokens.get(pf);
	if (!t) tokens.set(pf, (t = tokenize(pf.text)));
	return t;
};

/**
 * What a component shared by several pages writes per page (`VALUES[path]`, a table of generated ids such as each
 * trigger's aria-controls), for this route.
 */
function routeValues(pf: PortFile, route: string, path: string): Readonly<Record<string, string>> {
	const name = /\bconst values = (\w+)\[(?:path|route)\]/.exec(pf.text)?.[1];
	if (!name) return {};
	const json = new RegExp(`^const ${name}\\b[^=]*= (\\{.*\\});$`, 'm').exec(pf.text)?.[1];
	if (!json) return {};
	try {
		const table = JSON.parse(json) as Record<string, Record<string, string>>;
		return table[route] ?? table[path] ?? {};
	} catch {
		return {};
	}
}

/** The page module that serves a route, by the routes each page's header names. */
export function pageOf(port: ReadonlyMap<string, PortFile>): Map<string, string> {
	const out = new Map<string, string>();
	for (const pf of port.values()) if (pf.file.startsWith('pages/')) for (const r of pf.routes) if (!out.has(r)) out.set(r, pf.file);
	return out;
}
