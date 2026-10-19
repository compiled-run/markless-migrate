import { parseSync } from 'oxc-parser';
import { walk, type N } from '../source/js.ts';

/**
 * Which script is another framework's runtime. No such code is ever kept in a Markless port: what the
 * old site uses of it is inventoried and implemented in Markless, and only static assets are copied byte for byte.
 * Each runtime is recognised by what its code defines (its public API object, its internal symbols), read from the
 * syntax tree, so a page whose text merely talks about htmx or React is not mistaken for one.
 */
export type Runtime = 'react' | 'vue' | 'svelte' | 'angular' | 'solid' | 'preact' | 'htmx' | 'alpine' | 'hyperscript' | 'jquery' | 'turbo' | 'sinon' | 'webpack';

export const RUNTIME_NAMES: Readonly<Record<Runtime, string>> = {
	react: 'React',
	vue: 'Vue',
	svelte: 'Svelte',
	angular: 'Angular',
	solid: 'Solid',
	preact: 'Preact',
	htmx: 'htmx',
	alpine: 'Alpine.js',
	hyperscript: '_hyperscript',
	jquery: 'jQuery',
	turbo: 'Turbo',
	sinon: 'Sinon',
	webpack: 'webpack/rspack chunk loader',
};

const HTMX_API = ['onLoad', 'process', 'on', 'off', 'trigger', 'ajax', 'find', 'findAll', 'closest', 'values', 'remove', 'addClass', 'removeClass', 'toggleClass', 'takeClass', 'swap', 'defineExtension', 'removeExtension', 'logAll', 'logNone', 'parseInterval'];
const ALPINE_API = ['start', 'data', 'store', 'plugin', 'directive', 'magic', 'bind', 'reactive', 'effect', 'nextTick', 'evaluate', 'initTree', 'mutateDom', 'setReactivityEngine', 'prefix', 'closestDataStack'];
const REACT_SYMBOLS = new Set(['react.element', 'react.transitional.element', 'react.portal', 'react.fragment']);
const REACT_KEYS = new Set(['__reactFiber$', '__reactContainer$', '__reactProps$', '__reactEvents$']);
const VUE_KEYS = new Set(['__v_isRef', '__v_isVNode', '__v_skip', '__vue_app__', '__VUE__', '_isVue']);

const keyName = (n: N | undefined): string | undefined => (!n ? undefined : n.type === 'Identifier' ? n.name : n.type === 'Literal' && typeof n.value === 'string' ? n.value : undefined);
const propertyName = (m: N): string | undefined => (m.computed ? keyName(m.property?.type === 'Literal' ? m.property : undefined) : keyName(m.property));

/**
 * JavaScript-only libraries (no UI framework of their own): kept as they are during a migration and listed as kept
 * libraries; `upgrade` measures each one on the migrated site and suggests the Markless ports worth making.
 * Recognised by their licence banner (a `/*!`, `@preserve` or `@license` comment) or by the global their UMD build defines.
 */
const LIBRARY_BANNERS: readonly (readonly [string, RegExp])[] = [
	['chart.js', /\bChart\.js v\d/],
	['leaflet', /\bLeaflet \d/],
	['sortablejs', /\bSortable(JS)? \d|SortableJS\/Sortable/],
	['sweetalert2', /\bsweetalert2 v\d/i],
	['bootstrap', /\bBootstrap v\d/],
	['echarts', /\bApache ECharts\b|\becharts\b.*\bApache\b/is],
	['highcharts', /\bHighcharts\b.*\bv?\d/],
	['apexcharts', /\bApexCharts\b/],
	['plotly.js', /\bplotly\.js v\d/i],
	['swiper', /\bSwiper \d/],
	['flatpickr', /\bflatpickr v\d/i],
	['tom-select', /\bTom Select v\d/i],
	['choices.js', /\bChoices\.js v\d/i],
	['quill', /\bQuill Editor v\d/i],
	['monaco-editor', /\bmonaco-editor\b/i],
	['codemirror', /\bCodeMirror\b/],
	['three', /\bthree\.js\b|\bThree\.js Authors\b/i],
	['mapbox-gl', /\bmapbox-gl\b/i],
	['maplibre-gl', /\bmaplibre-gl\b/i],
	['handsontable', /\bHandsontable\b/],
	['ag-grid-community', /\bag-grid-community\b|\bAG Grid\b/],
	['tabulator-tables', /\bTabulator v?\d/],
	['d3', /\bd3js\.org\b|https:\/\/d3js\.org/],
	['mark.js', /\bmark\.js v\d/i],
	['@rive-app/canvas', /\brive-app\b|\bRive\b.*\bruntime\b/is],
	['prismjs', /\bPrism: Lightweight\b|\bprismjs\.com\b/i],
	['highlight.js', /\bHighlight\.js v\d/i],
	['lottie-web', /\blottie-web\b|\bbodymovin\b/i],
	['gsap', /\bGSAP \d/],
];
const LIBRARY_GLOBALS: Readonly<Record<string, string>> = { Chart: 'chart.js', L: 'leaflet', Sortable: 'sortablejs', Sweetalert2: 'sweetalert2', Swal: 'sweetalert2', bootstrap: 'bootstrap', echarts: 'echarts', Highcharts: 'highcharts', ApexCharts: 'apexcharts', Plotly: 'plotly.js', Swiper: 'swiper', flatpickr: 'flatpickr', TomSelect: 'tom-select', Choices: 'choices.js', Quill: 'quill', monaco: 'monaco-editor', CodeMirror: 'codemirror', THREE: 'three', mapboxgl: 'mapbox-gl', maplibregl: 'maplibre-gl', Handsontable: 'handsontable', agGrid: 'ag-grid-community', Tabulator: 'tabulator-tables', d3: 'd3', Mark: 'mark.js', rive: '@rive-app/canvas', Prism: 'prismjs', hljs: 'highlight.js', lottie: 'lottie-web', gsap: 'gsap', MiniSearch: 'minisearch', focusTrap: 'focus-trap', FloatingUIDOM: '@floating-ui/dom' };
const UMD_ROOTS = new Set(['window', 'self', 'globalThis', 'global', 'this', 'root', 'e', 't', 'n', 'r', 'i', 'o', 'a', 's']);

export interface Classified {
	readonly runtimes: Runtime[];
	/** JavaScript-only libraries the script is (or bundles), by package name: kept, never a guard failure. */
	readonly libraries: string[];
	readonly parsed: boolean;
}

// Every check below needs one of these in the text, so a script without any is classified without being parsed.
const RUNTIME_TOKENS = /react\.|__react|__v_is|__v_skip|__vue|__VUE|_isVue|__svelte|\$\$\.fragment|__PREACT|ɵɵ|_\$HY|_hyperscript|defineExtension|directive|jquery|fakeServerWithClock|turbo-|__webpack_require__|__rspack_require__|data-webpack|data-rspack/;
const LIBRARY_TOKENS = new RegExp(`/\\*|\\.(${Object.keys(LIBRARY_GLOBALS).join('|')})\\s*=`);

/** Every runtime a script defines (a bundle may hold several: Docusaurus ships React and its router together). */
export function classifyScript(source: string): Classified {
	if (!RUNTIME_TOKENS.test(source) && !LIBRARY_TOKENS.test(source)) return { runtimes: [], libraries: [], parsed: true };
	let result = parseSync('x.js', source, { sourceType: 'module', preserveParens: false });
	if (result.errors.length) {
		const script = parseSync('x.js', source, { sourceType: 'script', preserveParens: false });
		if (script.errors.length < result.errors.length) result = script;
	}
	const found = new Set<Runtime>();
	const libraries = new Set<string>();
	for (const c of (result.comments ?? []) as { type: string; value: string; start: number }[]) {
		if (c.type !== 'Block' || !(c.start < 2048 || /^\s*[!*]|@preserve|@license/.test(c.value))) continue;
		for (const [name, banner] of LIBRARY_BANNERS) if (banner.test(c.value)) libraries.add(name);
	}
	const program = result.program as unknown as N;
	walk(program, (n) => {
		switch (n.type) {
			case 'CallExpression': {
				const callee = n.callee as N;
				if (callee.type === 'MemberExpression' && keyName(callee.object) === 'Symbol' && propertyName(callee) === 'for' && REACT_SYMBOLS.has(keyName(n.arguments?.[0]) ?? '')) found.add('react');
				if (callee.type === 'MemberExpression' && keyName(callee.object) === 'htmx' && propertyName(callee) === 'defineExtension') found.add('htmx');
				if (callee.type === 'MemberExpression' && propertyName(callee) === 'setAttribute' && /^data-(webpack|rspack)$/.test(keyName(n.arguments?.[0]) ?? '')) found.add('webpack');
				if (callee.type === 'MemberExpression' && keyName(callee.object) === 'customElements' && propertyName(callee) === 'define' && /^turbo-(frame|stream)$/.test(keyName(n.arguments?.[0]) ?? '')) found.add('turbo');
				break;
			}
			case 'BinaryExpression':
				if (n.operator === '+' && REACT_KEYS.has(keyName(n.left) ?? '')) found.add('react');
				break;
			case 'MemberExpression': {
				const name = propertyName(n);
				if (name && VUE_KEYS.has(name)) found.add('vue');
				if (name === '__svelte') found.add('svelte');
				if (name === '__PREACT_DEVTOOLS__') found.add('preact');
				break;
			}
			case 'Identifier':
				if (typeof n.name === 'string' && n.name.startsWith('ɵɵ')) found.add('angular');
				if (n.name === '_$HY') found.add('solid');
				if (n.name === '__webpack_require__' || n.name === '__rspack_require__') found.add('webpack');
				break;
			case 'AssignmentExpression': {
				if (n.left?.type === 'MemberExpression' && propertyName(n.left) === '_hyperscript') found.add('hyperscript');
				const global = n.left?.type === 'MemberExpression' ? propertyName(n.left) : undefined;
				const object = n.left?.type === 'MemberExpression' ? (n.left.object as N) : undefined;
				const root = !object ? undefined : object.type === 'ThisExpression' ? 'this' : object.type === 'AssignmentExpression' || object.type === 'LogicalExpression' ? 'this' : keyName(object);
				if (global && LIBRARY_GLOBALS[global] && root && UMD_ROOTS.has(root) && (n.right?.type === 'CallExpression' || n.right?.type === 'NewExpression' || n.right?.type === 'ObjectExpression' || n.right?.type === 'FunctionExpression' || n.right?.type === 'ClassExpression')) libraries.add(LIBRARY_GLOBALS[global]);
				break;
			}
			case 'ObjectExpression': {
				const keys = new Set((n.properties as N[]).flatMap((p) => (p.type === 'Property' ? [keyName(p.key)] : [])).filter((k): k is string => !!k));
				if (keys.size < 3) break;
				if (keys.has('defineExtension') && HTMX_API.filter((k) => keys.has(k)).length >= 8) found.add('htmx');
				if (keys.has('start') && keys.has('directive') && ALPINE_API.filter((k) => keys.has(k)).length >= 6) found.add('alpine');
				if (keys.has('jquery') && keys.has('constructor') && keys.has('toArray')) found.add('jquery');
				if (keys.has('fakeServer') && keys.has('fakeServerWithClock')) found.add('sinon');
				for (const k of keys) if (VUE_KEYS.has(k)) found.add('vue');
				break;
			}
		}
	});
	// A framework runtime that bundles a library (DocSearch's Preact) is the framework; the library inside is not kept on its own.
	return { runtimes: [...found], libraries: found.size ? [] : [...libraries], parsed: result.errors.length === 0 };
}
