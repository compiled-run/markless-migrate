import { parse } from 'yuku';
import { errorsOf, lineIndex, patternNames, walk, type N } from '../source/js.ts';

/** What a plain script does in the browser, read from its syntax tree. */
export type Effect =
	| { readonly kind: 'listener'; readonly target: string; readonly event: string; readonly line: number }
	| { readonly kind: 'storage'; readonly store: 'localStorage' | 'sessionStorage' | 'cookie'; readonly op: 'read' | 'write' | 'remove'; readonly key?: string; readonly line: number }
	| { readonly kind: 'media-query'; readonly query: string; readonly line: number }
	| { readonly kind: 'timer'; readonly timer: 'setTimeout' | 'setInterval' | 'requestAnimationFrame'; readonly ms?: number; readonly line: number }
	| { readonly kind: 'fetch'; readonly api: 'fetch' | 'XMLHttpRequest' | 'sendBeacon' | 'EventSource' | 'WebSocket'; readonly url?: string; readonly method?: string; readonly line: number }
	| { readonly kind: 'navigation'; readonly api: string; readonly line: number }
	| { readonly kind: 'observer'; readonly observer: string; readonly line: number }
	| { readonly kind: 'dom-write'; readonly target: string; readonly write: string; readonly value?: string; readonly line: number }
	| { readonly kind: 'library-call'; readonly library: string; readonly call: string; readonly args?: string; readonly line: number };

/** An effect, and the listener (its index among the effects) whose handler runs it, when it runs inside one. */
export type Located = Effect & { readonly in?: number };

const literal = (n: N | undefined): string | undefined => {
	if (!n) return undefined;
	if (n.type === 'Literal' && (typeof n.value === 'string' || typeof n.value === 'number')) return String(n.value);
	if (n.type === 'TemplateLiteral' && n.quasis?.length === 1) return n.quasis[0].value.cooked;
	return undefined;
};

/** `document.documentElement`, `window`, `#nav`, `el` (a local), as written: what an effect lands on. */
function targetOf(n: N | undefined): string {
	if (!n) return '?';
	if (n.type === 'Identifier') return n.name;
	if (n.type === 'ThisExpression') return 'this';
	if (n.type === 'MemberExpression' && !n.computed) return `${targetOf(n.object)}.${n.property.name}`;
	if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression') {
		const method = n.callee.property?.name;
		const arg = literal(n.arguments?.[0]);
		if (method === 'getElementById' && arg) return `#${arg}`;
		if ((method === 'querySelector' || method === 'querySelectorAll' || method === 'closest') && arg) return arg;
		if (method) return `${targetOf(n.callee.object)}.${method}()`;
	}
	return n.type;
}

const GLOBAL_LIBRARIES: Readonly<Record<string, string>> = { htmx: 'htmx', Alpine: 'alpine', _hyperscript: 'hyperscript', sinon: 'sinon', jQuery: 'jQuery', $: 'jQuery', docsearch: 'docsearch', Prism: 'prismjs', hljs: 'highlight.js', gtag: 'gtag', dataLayer: 'gtag', plausible: 'plausible', Swal: 'sweetalert2', Sortable: 'sortablejs', bootstrap: 'bootstrap', UIkit: 'uikit', Chart: 'chart.js', echarts: 'echarts', Highcharts: 'highcharts', ApexCharts: 'apexcharts', Plotly: 'plotly.js', Swiper: 'swiper', flatpickr: 'flatpickr', TomSelect: 'tom-select', Choices: 'choices.js', Quill: 'quill', monaco: 'monaco-editor', CodeMirror: 'codemirror', THREE: 'three', mapboxgl: 'mapbox-gl', maplibregl: 'maplibre-gl', Handsontable: 'handsontable', agGrid: 'ag-grid-community', Tabulator: 'tabulator-tables', d3: 'd3', Mark: 'mark.js', MiniSearch: 'minisearch', lottie: 'lottie-web', gsap: 'gsap' };

export interface ScriptAnalysis {
	readonly effects: Located[];
	readonly parsed: boolean;
	/** Functions the script declares at its top level: other scripts on the page call them as its API. */
	readonly defines: string[];
}

/** Every effect a plain script has, with its line: listeners, storage, media queries, timers, requests, navigation, observers, DOM writes and calls into a global library. */
/** `globals` names functions other scripts of the site define (demo.js's onGet), so calling one is a use of that script. */
export function analyseScript(source: string, firstLine = 1, globals: ReadonlyMap<string, string> = new Map()): ScriptAnalysis {
	let result = parse(source, { sourceType: 'script', preserveParens: false });
	const errors = errorsOf(result).length;
	if (errors) {
		const mod = parse(source, { sourceType: 'module', preserveParens: false });
		if (errorsOf(mod).length < errors) result = mod;
	}
	const line = lineIndex(source);
	const at = (n: N) => line(n.start) + firstLine - 1;
	const found: Effect[] = [];
	const aliases = new Map<string, string>();
	const owners: (number | undefined)[] = [];
	const listeners = new Map<N, number>();
	let ancestry: readonly N[] = [];
	const effects = {
		push(e: Effect) {
			let owner: number | undefined;
			for (let i = ancestry.length - 1; i >= 0 && owner === undefined; i--) owner = listeners.get(ancestry[i]!);
			found.push(e);
			owners.push(owner);
		},
	};
	const bound = new Set<string>();
	walk(result.program as unknown as N, (n) => {
		if (n.type === 'VariableDeclarator') for (const name of patternNames(n.id)) bound.add(name);
		else if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') && n.params) {
			if (n.id?.name) bound.add(n.id.name);
			for (const p of n.params as N[]) for (const name of patternNames(p)) bound.add(name);
		} else if (n.type === 'CatchClause' && n.param) for (const name of patternNames(n.param)) bound.add(name);
		else if (n.type === 'ClassDeclaration' && n.id?.name) bound.add(n.id.name);
		else if (n.type === 'ImportSpecifier' || n.type === 'ImportDefaultSpecifier' || n.type === 'ImportNamespaceSpecifier') bound.add(n.local.name);
	});
	walk(result.program as unknown as N, (n, ancestors) => {
		ancestry = ancestors;
		const before = found.length;
		visit(n);
		if (found.length > before && found[before]!.kind === 'listener') listeners.set(n, before);
	});
	const defines = ((result.program as unknown as N).body as N[]).flatMap((n) => (n.type === 'FunctionDeclaration' && n.id ? [n.id.name as string] : []));
	return { effects: found.map((e, i) => (owners[i] === undefined ? e : { ...e, in: owners[i] })), parsed: errorsOf(result).length === 0, defines };

	// A name the script binds itself is its own (a minifier's `$`), not the library global of that name.
	function libraryOf(root: string): string | undefined {
		return aliases.get(root) ?? (bound.has(root) ? undefined : (GLOBAL_LIBRARIES[root] ?? globals.get(root)));
	}

	function visit(n: N): void {
		if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && n.init) {
			const init = n.init.type === 'AwaitExpression' ? n.init.argument : n.init;
			const root = init?.type === 'CallExpression' || init?.type === 'NewExpression' ? targetOf(init.callee).split('.')[0]! : undefined;
			const lib = root ? libraryOf(root) : undefined;
			if (lib) aliases.set(n.id.name, lib);
		}
		if (n.type === 'CallExpression') {
			const callee = n.callee as N;
			const args = (n.arguments ?? []) as N[];
			if (callee.type === 'MemberExpression' && !callee.computed) {
				const method = callee.property.name as string;
				const object = targetOf(callee.object);
				const root = object.split('.')[0]!;
				if (method === 'addEventListener' && literal(args[0])) effects.push({ kind: 'listener', target: object, event: literal(args[0])!, line: at(n) });
				else if (/^(local|session)Storage$/.test(object.replace(/^window\./, '')) && /^(getItem|setItem|removeItem)$/.test(method)) {
					const key = literal(args[0]);
					effects.push({ kind: 'storage', store: object.replace(/^window\./, '') as 'localStorage' | 'sessionStorage', op: method === 'getItem' ? 'read' : method === 'setItem' ? 'write' : 'remove', ...(key !== undefined ? { key } : {}), line: at(n) });
				} else if (method === 'matchMedia' && literal(args[0])) effects.push({ kind: 'media-query', query: literal(args[0])!, line: at(n) });
				else if (/^(pushState|replaceState|back|forward|go)$/.test(method) && /history$/.test(object)) effects.push({ kind: 'navigation', api: `history.${method}`, line: at(n) });
				else if (/^(assign|replace|reload)$/.test(method) && /location$/.test(object)) effects.push({ kind: 'navigation', api: `location.${method}`, line: at(n) });
				else if (method === 'sendBeacon') effects.push({ kind: 'fetch', api: 'sendBeacon', ...(literal(args[0]) ? { url: literal(args[0])! } : {}), line: at(n) });
				else if (method === 'open' && args.length >= 2 && literal(args[0]) && /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/i.test(literal(args[0])!)) effects.push({ kind: 'fetch', api: 'XMLHttpRequest', method: literal(args[0])!.toUpperCase(), ...(literal(args[1]) ? { url: literal(args[1])! } : {}), line: at(n) });
				else if (/^(add|remove|toggle|replace)$/.test(method) && /\.classList$/.test(object)) effects.push({ kind: 'dom-write', target: object.replace(/\.classList$/, ''), write: `classList.${method}`, ...(literal(args[0]) ? { value: literal(args[0])! } : {}), line: at(n) });
				else if (/^(setAttribute|removeAttribute|toggleAttribute)$/.test(method)) effects.push({ kind: 'dom-write', target: object, write: method, ...(literal(args[0]) ? { value: literal(args[0])! } : {}), line: at(n) });
				else if (/^(insertAdjacentHTML|appendChild|append|prepend|replaceWith|replaceChildren|insertBefore|remove|attachShadow|scrollIntoView|scrollTo|focus)$/.test(method) && root !== 'console') effects.push({ kind: 'dom-write', target: object, write: method, line: at(n) });
				else if (libraryOf(root)) effects.push({ kind: 'library-call', library: libraryOf(root)!, call: `${aliases.has(root) ? `${aliases.get(root)}:` : ''}${object}.${method}`, ...(literal(args[0]) ? { args: literal(args[0])! } : {}), line: at(n) });
			} else if (callee.type === 'Identifier') {
				const name = callee.name as string;
				if (name === 'setTimeout' || name === 'setInterval' || name === 'requestAnimationFrame') {
					const ms = literal(args[1]);
					effects.push({ kind: 'timer', timer: name, ...(ms !== undefined && !Number.isNaN(Number(ms)) ? { ms: Number(ms) } : {}), line: at(n) });
				} else if (name === 'fetch') effects.push({ kind: 'fetch', api: 'fetch', ...(literal(args[0]) ? { url: literal(args[0])! } : {}), line: at(n) });
				else if (name === 'matchMedia' && literal(args[0])) effects.push({ kind: 'media-query', query: literal(args[0])!, line: at(n) });
				else if (libraryOf(name)) effects.push({ kind: 'library-call', library: libraryOf(name)!, call: name, ...(literal(args[0]) ? { args: literal(args[0])! } : {}), line: at(n) });
			}
		} else if (n.type === 'NewExpression' && n.callee?.type === 'Identifier') {
			const name = n.callee.name as string;
			if (/^(Intersection|Mutation|Resize|Performance)Observer$/.test(name)) effects.push({ kind: 'observer', observer: name, line: at(n) });
			else if (libraryOf(name)) effects.push({ kind: 'library-call', library: libraryOf(name)!, call: `new ${name}`, line: at(n) });
			else if (name === 'XMLHttpRequest' || name === 'EventSource' || name === 'WebSocket') effects.push({ kind: 'fetch', api: name, ...(literal(n.arguments?.[0]) ? { url: literal(n.arguments[0])! } : {}), line: at(n) });
		} else if (n.type === 'AssignmentExpression' && n.left?.type === 'MemberExpression' && !n.left.computed) {
			const prop = n.left.property.name as string;
			const object = targetOf(n.left.object);
			if (/^on[a-z]+$/.test(prop)) effects.push({ kind: 'listener', target: object, event: prop.slice(2), line: at(n) });
			else if (prop === 'cookie' && /document$/.test(object)) effects.push({ kind: 'storage', store: 'cookie', op: 'write', ...(literal(n.right)?.split('=')[0] ? { key: literal(n.right)!.split('=')[0]! } : {}), line: at(n) });
			else if (prop === 'href' && /location$/.test(object)) effects.push({ kind: 'navigation', api: 'location.href', line: at(n) });
			else if (/^(innerHTML|outerHTML|textContent|innerText|className|value|checked|hidden|src|href)$/.test(prop)) effects.push({ kind: 'dom-write', target: object, write: prop, line: at(n) });
			else if (/\.style$/.test(object)) effects.push({ kind: 'dom-write', target: object.replace(/\.style$/, ''), write: `style.${prop}`, ...(literal(n.right) ? { value: literal(n.right)! } : {}), line: at(n) });
		}
	}
}
