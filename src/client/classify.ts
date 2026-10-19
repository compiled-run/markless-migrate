import { parseSync } from 'oxc-parser';
import { walk, type N } from '../source/js.ts';

/**
 * Which script is another framework's or library's runtime. No such code is ever kept in a Markless port: what the
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

export interface Classified {
	readonly runtimes: Runtime[];
	readonly parsed: boolean;
}

/** Every runtime a script defines (a bundle may hold several: Docusaurus ships React and its router together). */
export function classifyScript(source: string): Classified {
	let result = parseSync('x.js', source, { sourceType: 'module', preserveParens: false });
	if (result.errors.length) {
		const script = parseSync('x.js', source, { sourceType: 'script', preserveParens: false });
		if (script.errors.length < result.errors.length) result = script;
	}
	const found = new Set<Runtime>();
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
			case 'AssignmentExpression':
				if (n.left?.type === 'MemberExpression' && propertyName(n.left) === '_hyperscript') found.add('hyperscript');
				break;
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
	return { runtimes: [...found], parsed: result.errors.length === 0 };
}
