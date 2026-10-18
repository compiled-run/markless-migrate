/// <reference path="./prismjs.d.ts" />
// A live code block's editor (use-editable's behaviour over prism-react-renderer's markup) and its preview: the
// code runs as react-live runs it, against a small React-compatible runtime that renders into the preview.
import prismThemes from './prism-themes.json';
import type { LiveHint } from './playground.ts';

type Props = Record<string, unknown> & { children?: unknown };
type ComponentFn = (props: Props) => unknown;
type ElementType = string | ComponentFn | typeof Component | ProviderType | ConsumerType | typeof Fragment;
interface LiveElement {
	readonly $live: true;
	type: ElementType;
	props: Props;
	key: string | null;
}
type ProviderType = { $provider: Context<unknown> };
type ConsumerType = { $consumer: Context<unknown> };
interface Context<T> {
	value: T;
	Provider: ProviderType;
	Consumer: ConsumerType;
}

export const Fragment = Symbol('live.fragment');

export function createElement(type: ElementType, config?: Record<string, unknown> | null, ...children: unknown[]): LiveElement {
	const props: Props = {};
	let key: string | null = null;
	for (const [name, value] of Object.entries(config ?? {})) {
		if (name === 'key') key = value == null ? null : String(value);
		else props[name] = value;
	}
	if (children.length === 1) props.children = children[0];
	else if (children.length > 1) props.children = children;
	const defaults = (type as { defaultProps?: Props }).defaultProps;
	if (defaults) for (const [name, value] of Object.entries(defaults)) if (props[name] === undefined) props[name] = value;
	return { $live: true, type, props, key };
}
export const isValidElement = (value: unknown): value is LiveElement => typeof value === 'object' && value !== null && (value as LiveElement).$live === true;
export const cloneElement = (element: LiveElement, config?: Record<string, unknown> | null, ...children: unknown[]): LiveElement => {
	const next = createElement(element.type, { ...element.props, key: element.key, ...config }, ...children);
	if (!children.length && element.props.children !== undefined && !(config && 'children' in config)) next.props.children = element.props.children;
	return next;
};

export function createContext<T>(value: T): Context<T> {
	const context = { value } as Context<T>;
	context.Provider = { $provider: context as Context<unknown> };
	context.Consumer = { $consumer: context as Context<unknown> };
	return context;
}

export class Component<P extends Props = Props, S extends Record<string, unknown> = Record<string, unknown>> {
	static isLiveComponent = true;
	props: P;
	state: S = {} as S;
	update: (() => void) | undefined;
	constructor(props: P) {
		this.props = props;
	}
	setState(partial: Partial<S> | ((state: S, props: P) => Partial<S>)): void {
		this.state = { ...this.state, ...(typeof partial === 'function' ? partial(this.state, this.props) : partial) };
		this.update?.();
	}
	forceUpdate(): void {
		this.update?.();
	}
	render(): unknown {
		return null;
	}
}
export class PureComponent<P extends Props = Props, S extends Record<string, unknown> = Record<string, unknown>> extends Component<P, S> {}

const toArray = (children: unknown): unknown[] => (children === undefined || children === null ? [] : Array.isArray(children) ? children.flat(Infinity) : [children]);
export const Children = {
	toArray: (children: unknown) => toArray(children).filter((c) => c !== null && c !== undefined && typeof c !== 'boolean'),
	map: (children: unknown, fn: (child: unknown, index: number) => unknown) => toArray(children).map(fn),
	forEach: (children: unknown, fn: (child: unknown, index: number) => void) => toArray(children).forEach(fn),
	count: (children: unknown) => toArray(children).length,
	only: (children: unknown) => {
		if (!isValidElement(children)) throw new Error('React.Children.only expected to receive a single React element child.');
		return children;
	},
};

type Hook = { state?: unknown; deps?: unknown[]; cleanup?: (() => void) | void; value?: unknown; current?: unknown };
type Store = { hooks: Hook[]; instance?: Component; seen: boolean };
type Effect = { hook: Hook; fn: () => (() => void) | void };

let current: { root: Root; store: Store; index: number } | undefined;
const hook = (): Hook => {
	if (!current) throw new Error('Invalid hook call. Hooks can only be called inside of the body of a function component.');
	const { store } = current;
	return (store.hooks[current.index++] ??= {});
};
const depsChanged = (prev: unknown[] | undefined, next: unknown[] | undefined) => !prev || !next || prev.length !== next.length || next.some((dep, i) => !Object.is(dep, prev[i]));

export function useReducer<S, A>(reducer: (state: S, action: A) => S, initial: S, init?: (arg: S) => S): [S, (action: A) => void] {
	const h = hook();
	const root = current!.root;
	if (!('state' in h)) {
		h.state = init ? init(initial) : initial;
		h.value = (action: A) => {
			const next = reducer(h.state as S, action);
			if (Object.is(next, h.state)) return;
			h.state = next;
			root.schedule();
		};
	}
	return [h.state as S, h.value as (action: A) => void];
}
export function useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void] {
	return useReducer<S, S | ((prev: S) => S)>((state, action) => (typeof action === 'function' ? (action as (prev: S) => S)(state) : action), initial as S, typeof initial === 'function' ? (initial as () => S) : undefined);
}
function effectHook(list: 'layout' | 'passive', fn: () => (() => void) | void, deps?: unknown[]): void {
	const h = hook();
	if (!depsChanged(h.deps, deps) && 'deps' in h) return;
	h.deps = deps;
	current!.root.effects[list].push({ hook: h, fn });
}
export const useEffect = (fn: () => (() => void) | void, deps?: unknown[]) => effectHook('passive', fn, deps);
export const useLayoutEffect = (fn: () => (() => void) | void, deps?: unknown[]) => effectHook('layout', fn, deps);
export const useInsertionEffect = useLayoutEffect;
export function useRef<T>(initial: T): { current: T } {
	const h = hook();
	if (!('current' in h)) h.current = initial;
	return h as { current: T };
}
export function useMemo<T>(fn: () => T, deps?: unknown[]): T {
	const h = hook();
	if ('deps' in h && !depsChanged(h.deps, deps)) return h.value as T;
	h.deps = deps;
	h.value = fn();
	return h.value as T;
}
export const useCallback = <T>(fn: T, deps?: unknown[]): T => useMemo(() => fn, deps);
export function useContext<T>(context: Context<T>): T {
	const stack = current?.root.contexts.get(context as Context<unknown>);
	return (stack?.length ? stack[stack.length - 1] : context.value) as T;
}
let ids = 0;
export function useId(): string {
	const h = hook();
	return (h.value ??= `:r${(ids++).toString(32)}:`) as string;
}
export function useImperativeHandle<T>(ref: { current: T | null } | ((value: T | null) => void) | null | undefined, create: () => T, deps?: unknown[]): void {
	useLayoutEffect(() => {
		const value = create();
		if (typeof ref === 'function') ref(value);
		else if (ref) ref.current = value;
	}, deps);
}
export const useDebugValue = (): void => {};
export const useDeferredValue = <T>(value: T): T => value;
export const useTransition = (): [boolean, (fn: () => void) => void] => [false, (fn) => fn()];
export const startTransition = (fn: () => void): void => fn();
export const memo = <T>(type: T): T => type;
export const forwardRef = (render: (props: Props, ref: unknown) => unknown): ComponentFn => (props) => render(props, props.ref ?? null);
export const StrictMode = Fragment;
export const version = '19.3.0';

type Host = string | { tag: string; props: Props; children: Host[] };
type Mounted = { host: Host; dom: Node; children: Mounted[] };

const typeIds = new WeakMap<object, number>();
let nextTypeId = 0;
const typeId = (type: object) => {
	let id = typeIds.get(type);
	if (id === undefined) typeIds.set(type, (id = nextTypeId++));
	return id;
};

const UNITLESS = new Set(['animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth', 'boxFlex', 'boxFlexGroup', 'boxOrdinalGroup', 'columnCount', 'columns', 'flex', 'flexGrow', 'flexPositive', 'flexShrink', 'flexNegative', 'flexOrder', 'gridArea', 'gridRow', 'gridRowEnd', 'gridRowSpan', 'gridRowStart', 'gridColumn', 'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart', 'fontWeight', 'lineClamp', 'lineHeight', 'opacity', 'order', 'orphans', 'scale', 'tabSize', 'widows', 'zIndex', 'zoom', 'fillOpacity', 'floodOpacity', 'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth']);
const kebab = (name: string) => (name.startsWith('--') ? name : name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
const ALIASES: Record<string, string> = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex', readOnly: 'readonly', autoFocus: 'autofocus', spellCheck: 'spellcheck', contentEditable: 'contenteditable', crossOrigin: 'crossorigin', colSpan: 'colspan', rowSpan: 'rowspan', maxLength: 'maxlength', viewBox: 'viewBox', strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', fillRule: 'fill-rule', clipRule: 'clip-rule', xlinkHref: 'xlink:href' };
const EVENT_ALIASES: Record<string, string> = { doubleclick: 'dblclick', mouseenter: 'mouseenter', mouseleave: 'mouseleave' };
const listeners = new WeakMap<Element, Record<string, (event: Event) => unknown>>();

function eventName(prop: string, el: Element): string {
	const name = prop.slice(2).replace(/Capture$/, '').toLowerCase();
	if (name === 'change' && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio)$/.test((el as HTMLInputElement).type)) return 'input';
	return EVENT_ALIASES[name] ?? name;
}
function setProp(el: Element, name: string, value: unknown, prev: unknown): void {
	if (name === 'children' || name === 'ref' || name === 'key' || name === 'dangerouslySetInnerHTML') return;
	if (/^on[A-Z]/.test(name)) {
		const event = eventName(name, el);
		const map = listeners.get(el) ?? {};
		listeners.set(el, map);
		if (!map[event]) el.addEventListener(event, (e) => map[event]?.(e));
		if (typeof value === 'function') map[event] = value as (event: Event) => unknown;
		else delete map[event];
		return;
	}
	if (name === 'style') {
		const style = (el as HTMLElement).style;
		if (typeof value === 'string') return el.setAttribute('style', value);
		const before = (typeof prev === 'object' && prev) || {};
		for (const key of Object.keys(before)) if (!value || !(key in (value as object))) style.removeProperty(kebab(key));
		for (const [key, v] of Object.entries((value as Record<string, unknown>) ?? {})) {
			if (v === null || v === undefined || typeof v === 'boolean' || v === '') style.removeProperty(kebab(key));
			else style.setProperty(kebab(key), typeof v === 'number' && v !== 0 && !UNITLESS.has(key) && !key.startsWith('--') ? `${v}px` : String(v));
		}
		if (!el.getAttribute('style')) el.removeAttribute('style');
		return;
	}
	if ((name === 'value' || name === 'checked' || name === 'selected') && name in el) {
		(el as unknown as Record<string, unknown>)[name] = value ?? (name === 'value' ? '' : false);
		return;
	}
	const attr = ALIASES[name] ?? (el.namespaceURI === 'http://www.w3.org/2000/svg' ? name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`).replace(/^view-box$/, 'viewBox') : name.toLowerCase() === name ? name : name.toLowerCase());
	if (value === null || value === undefined || value === false || typeof value === 'function' || typeof value === 'symbol') el.removeAttribute(attr);
	else el.setAttribute(attr, value === true ? '' : String(value));
}
function setRef(ref: unknown, value: unknown): void {
	if (typeof ref === 'function') ref(value);
	else if (ref && typeof ref === 'object') (ref as { current: unknown }).current = value;
}

class Root {
	stores = new Map<string, Store>();
	contexts = new Map<Context<unknown>, unknown[]>();
	effects: { layout: Effect[]; passive: Effect[] } = { layout: [], passive: [] };
	mounted: Mounted[] = [];
	element: unknown = null;
	scheduled = false;
	dead = false;
	constructor(
		readonly container: HTMLElement,
		readonly onError: (error: unknown) => void,
	) {}
	render(element: unknown): void {
		this.element = element;
		this.flush();
	}
	schedule(): void {
		if (this.scheduled || this.dead) return;
		this.scheduled = true;
		queueMicrotask(() => {
			this.scheduled = false;
			if (!this.dead) this.flush();
		});
	}
	flush(): void {
		let hosts: Host[];
		try {
			for (const store of this.stores.values()) store.seen = false;
			hosts = this.expand(this.element, '');
		} catch (error) {
			current = undefined;
			this.effects = { layout: [], passive: [] };
			this.onError(error);
			return;
		}
		for (const [path, store] of this.stores) {
			if (store.seen) continue;
			this.stores.delete(path);
			for (const h of store.hooks) if (typeof h.cleanup === 'function') h.cleanup();
			(store.instance as { componentWillUnmount?: () => void } | undefined)?.componentWillUnmount?.();
		}
		this.mounted = this.patch(this.container, this.mounted, hosts, false);
		const { layout, passive } = this.effects;
		this.effects = { layout: [], passive: [] };
		this.run(layout);
		if (passive.length) setTimeout(() => this.run(passive), 0);
	}
	run(effects: Effect[]): void {
		if (this.dead) return;
		try {
			for (const { hook: h } of effects) if (typeof h.cleanup === 'function') h.cleanup();
			for (const effect of effects) effect.hook.cleanup = effect.fn();
		} catch (error) {
			this.onError(error);
		}
	}
	unmount(): void {
		this.dead = true;
		for (const store of this.stores.values()) {
			for (const h of store.hooks) if (typeof h.cleanup === 'function') h.cleanup();
			(store.instance as { componentWillUnmount?: () => void } | undefined)?.componentWillUnmount?.();
		}
		this.stores.clear();
	}
	store(path: string): Store {
		let store = this.stores.get(path);
		if (!store) this.stores.set(path, (store = { hooks: [], seen: false }));
		store.seen = true;
		return store;
	}
	expand(node: unknown, path: string): Host[] {
		if (node === null || node === undefined || typeof node === 'boolean') return [];
		if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return [String(node)];
		if (Array.isArray(node)) return node.flatMap((child, i) => this.expand(child, `${path}.${isValidElement(child) && child.key !== null ? `k${child.key}` : i}`));
		if (!isValidElement(node)) throw new Error(`Objects are not valid as a React child (found: ${Object.prototype.toString.call(node) === '[object Object]' ? `object with keys {${Object.keys(node).join(', ')}}` : String(node)}).`);
		const { type, props } = node;
		if (type === Fragment) return this.expand(props.children, `${path}/f`);
		if (typeof type === 'string') return [{ tag: type, props, children: props.dangerouslySetInnerHTML ? [] : this.expand(props.children, `${path}/${type}`) }];
		if (typeof type === 'object' && '$provider' in type) {
			const stack = this.contexts.get(type.$provider) ?? [];
			this.contexts.set(type.$provider, stack);
			stack.push(props.value);
			try {
				return this.expand(props.children, `${path}/p`);
			} finally {
				stack.pop();
			}
		}
		if (typeof type === 'object' && '$consumer' in type) {
			const stack = this.contexts.get(type.$consumer);
			return this.expand((props.children as (value: unknown) => unknown)(stack?.length ? stack[stack.length - 1] : type.$consumer.value), `${path}/c`);
		}
		const id = `${path}:${typeId(type as object)}`;
		const store = this.store(id);
		const previous = current;
		current = { root: this, store, index: 0 };
		try {
			if ((type as typeof Component).isLiveComponent) return this.expandClass(type as typeof Component, props, store, id);
			const result = (type as ComponentFn)(props);
			current = previous;
			return this.expand(result, `${id}/`);
		} finally {
			current = previous;
		}
	}
	expandClass(type: typeof Component, props: Props, store: Store, id: string): Host[] {
		const boundary = type as unknown as { getDerivedStateFromError?: (error: unknown) => Record<string, unknown> };
		let instance = store.instance;
		if (!instance) {
			instance = store.instance = new type(props);
			instance.update = () => this.schedule();
			const mount = (instance as { componentDidMount?: () => void }).componentDidMount;
			if (mount) this.effects.layout.push({ hook: {}, fn: () => mount.call(instance) });
		}
		instance.props = props;
		current = undefined;
		try {
			return this.expand(instance.render(), `${id}/`);
		} catch (error) {
			if (!boundary.getDerivedStateFromError) throw error;
			instance.state = { ...instance.state, ...boundary.getDerivedStateFromError(error) };
			(instance as { componentDidCatch?: (error: unknown) => void }).componentDidCatch?.(error);
			return this.expand(instance.render(), `${id}/`);
		}
	}
	patch(parent: Node, prev: Mounted[], next: Host[], svg: boolean): Mounted[] {
		const out: Mounted[] = [];
		next.forEach((host, i) => {
			const old = prev[i];
			let mounted: Mounted;
			if (old && typeof host === 'string' && typeof old.host === 'string') {
				if (old.host !== host) old.dom.textContent = host;
				mounted = { host, dom: old.dom, children: [] };
			} else if (old && typeof host !== 'string' && typeof old.host !== 'string' && old.host.tag === host.tag) {
				const el = old.dom as Element;
				this.updateProps(el, old.host.props, host.props);
				mounted = { host, dom: el, children: host.props.dangerouslySetInnerHTML ? [] : this.patch(el, old.children, host.children, svg || host.tag === 'svg') };
				if (old.host.props.ref !== host.props.ref) {
					setRef(old.host.props.ref, null);
					setRef(host.props.ref, el);
				}
			} else {
				mounted = this.create(host, svg);
				if (old) parent.replaceChild(mounted.dom, old.dom);
				else parent.appendChild(mounted.dom);
			}
			out.push(mounted);
		});
		for (const old of prev.slice(next.length)) {
			old.dom.parentNode?.removeChild(old.dom);
			if (typeof old.host !== 'string') setRef(old.host.props.ref, null);
		}
		return out;
	}
	create(host: Host, svg: boolean): Mounted {
		if (typeof host === 'string') return { host, dom: document.createTextNode(host), children: [] };
		const inSvg = svg || host.tag === 'svg';
		const el = inSvg ? document.createElementNS('http://www.w3.org/2000/svg', host.tag) : document.createElement(host.tag);
		this.updateProps(el, {}, host.props);
		const children = host.props.dangerouslySetInnerHTML ? [] : this.patch(el, [], host.children, inSvg && host.tag !== 'foreignObject');
		setRef(host.props.ref, el);
		return { host, dom: el, children };
	}
	updateProps(el: Element, prev: Props, next: Props): void {
		for (const name of Object.keys(prev)) if (!(name in next)) setProp(el, name, undefined, prev[name]);
		for (const [name, value] of Object.entries(next)) if (prev[name] !== value || name === 'value' || name === 'checked') setProp(el, name, value, prev[name]);
		const html = (next.dangerouslySetInnerHTML as { __html?: string } | undefined)?.__html;
		if (html !== undefined && html !== (prev.dangerouslySetInnerHTML as { __html?: string } | undefined)?.__html) el.innerHTML = html;
	}
}

export function ButtonExample(props: Props): LiveElement {
	return createElement('button', { type: 'button', ...props, style: { backgroundColor: 'white', color: 'black', border: 'solid red', borderRadius: 20, padding: 10, cursor: 'pointer', ...(props.style as object) } });
}

const React = { Children, Component, Fragment, PureComponent, StrictMode, cloneElement, createContext, createElement, forwardRef, isValidElement, memo, startTransition, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useTransition, version };
const scope: Record<string, unknown> = { React, ...React, ButtonExample };

// react-live's errorBoundary(Element): a function becomes <Element />, an element stays, anything else renders nothing.
function asElement(value: unknown): unknown {
	return typeof value === 'function' ? createElement(value as ComponentFn) : isValidElement(value) ? value : null;
}
function evalCode(code: string, extra: Record<string, unknown>): unknown {
	const all = { React, ...scope, ...extra };
	return new Function(...Object.keys(all), code)(...Object.values(all));
}

type Token = { types: string[]; content: string; empty?: boolean };
type PrismLike = { languages: Record<string, unknown>; tokenize: (code: string, grammar: unknown) => unknown[]; hooks: { run: (name: string, env: unknown) => void } };
type Tokenize = (code: string, language: string) => Token[][];
let tokenizer: Promise<Tokenize> | undefined;
let loadedTokenize: Tokenize | undefined;
function loadTokenizer(): Promise<Tokenize> {
	return (tokenizer ??= (async () => {
		const global = window as unknown as { Prism?: unknown };
		const before = global.Prism;
		global.Prism = { manual: true, disableWorkerMessageHandler: true };
		await import('prismjs/components/prism-core.js');
		// The languages prism-react-renderer bundles, in its order, that the tsx grammar is built from.
		await import('prismjs/components/prism-markup.js');
		await import('prismjs/components/prism-regex.js');
		await import('prismjs/components/prism-clike.js');
		await import('prismjs/components/prism-javascript.js');
		await import('prismjs/components/prism-javadoclike.js');
		await import('prismjs/components/prism-css.js');
		await import('prismjs/components/prism-typescript.js');
		await import('prismjs/components/prism-jsdoc.js');
		await import('prismjs/components/prism-js-extras.js');
		await import('prismjs/components/prism-jsx.js');
		await import('prismjs/components/prism-tsx.js');
		const Prism = global.Prism as PrismLike;
		global.Prism = before;
		return (loadedTokenize = (code: string, language: string) => {
			const grammar = Prism.languages[language];
			if (grammar == null) return normalizeTokens([code]);
			const env = { code, grammar, language, tokens: [] as unknown[] };
			Prism.hooks.run('before-tokenize', env);
			env.tokens = Prism.tokenize(code, grammar);
			Prism.hooks.run('after-tokenize', env);
			return normalizeTokens(env.tokens);
		});
	})());
}
type PrismToken = { type: string; alias?: string | string[]; content: unknown };
const appendTypes = (types: string[], add: string | string[]): string[] => (types.length > 0 && types[types.length - 1] === add ? types : types.concat(add));
function normalizeEmptyLines(line: Token[]): void {
	if (line.length === 0) line.push({ types: ['plain'], content: '\n', empty: true });
	else if (line.length === 1 && line[0]!.content === '') {
		line[0]!.content = '\n';
		line[0]!.empty = true;
	}
}
function normalizeTokens(tokens: unknown[]): Token[][] {
	const typeArrStack: string[][] = [[]];
	const tokenArrStack: unknown[][] = [tokens];
	const tokenArrIndexStack = [0];
	const tokenArrSizeStack = [tokens.length];
	let i = 0;
	let stackIndex = 0;
	let currentLine: Token[] = [];
	const acc = [currentLine];
	while (stackIndex > -1) {
		while ((i = tokenArrIndexStack[stackIndex]!++) < tokenArrSizeStack[stackIndex]!) {
			let content: unknown;
			let types = typeArrStack[stackIndex]!;
			const token = tokenArrStack[stackIndex]![i] as string | PrismToken;
			if (typeof token === 'string') {
				types = stackIndex > 0 ? types : ['plain'];
				content = token;
			} else {
				types = appendTypes(types, token.type);
				if (token.alias) types = appendTypes(types, token.alias);
				content = token.content;
			}
			if (typeof content !== 'string') {
				stackIndex++;
				typeArrStack.push(types);
				tokenArrStack.push(content as unknown[]);
				tokenArrIndexStack.push(0);
				tokenArrSizeStack.push((content as unknown[]).length);
				continue;
			}
			const split = content.split(/\r\n|\r|\n/);
			currentLine.push({ types, content: split[0]! });
			for (let j = 1; j < split.length; j++) {
				normalizeEmptyLines(currentLine);
				acc.push((currentLine = []));
				currentLine.push({ types, content: split[j]! });
			}
		}
		stackIndex--;
		typeArrStack.pop();
		tokenArrStack.pop();
		tokenArrIndexStack.pop();
		tokenArrSizeStack.pop();
	}
	normalizeEmptyLines(currentLine);
	return acc;
}

type PrismTheme = { plain: Record<string, string>; styles: { types: string[]; languages?: string[]; style: Record<string, string> }[] };
type Dict = Record<string, Record<string, string | undefined> | undefined>;
function themeDict(language: string): Dict {
	const theme = (prismThemes as unknown as Record<string, PrismTheme>)[document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light']!;
	const dict: Dict = {};
	for (const entry of theme.styles) {
		if (entry.languages && !entry.languages.includes(language)) continue;
		for (const type of entry.types) dict[type] = { ...dict[type], ...entry.style };
	}
	dict.root = theme.plain;
	dict.plain = { ...theme.plain, backgroundColor: undefined };
	return dict;
}
function applyStyle(el: HTMLElement, style: Record<string, string | undefined> | undefined, keepPlace = false): void {
	if (keepPlace) el.style.cssText = '';
	else el.removeAttribute('style');
	for (const [name, value] of Object.entries(style ?? {})) if (value) el.style.setProperty(kebab(name), value);
	if (!el.getAttribute('style')) el.removeAttribute('style');
}

let sucrase: Promise<typeof import('sucrase')> | undefined;
const loadSucrase = () => (sucrase ??= import('sucrase'));
const trimCode = (code: string) => code.trim().replace(/;$/, '');
async function compile(code: string, noInline: boolean): Promise<string> {
	const { transform } = await loadSucrase();
	const run = (transforms: ('jsx' | 'typescript' | 'imports')[]) => (input: string) => transform(input, { transforms, production: true }).code;
	const input = `${code};`;
	if (noInline) return run(['jsx', 'typescript', 'imports'])(input);
	return run(['imports'])(trimCode(run(['jsx', 'typescript'])(`return (${trimCode(input)})`)));
}

// use-editable's text and caret model: the text is every text node in order, the caret an offset into it.
type Position = { position: number; extent: number; content: string; line: number };
function toText(element: HTMLElement): string {
	const queue: (Node | null)[] = [element.firstChild];
	let content = '';
	let node: Node | null | undefined;
	while ((node = queue.pop())) {
		if (node.nodeType === Node.TEXT_NODE) content += node.textContent;
		else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'BR') content += '\n';
		if (node.nextSibling) queue.push(node.nextSibling);
		if (node.firstChild) queue.push(node.firstChild);
	}
	if (content[content.length - 1] !== '\n') content += '\n';
	return content;
}
function getPosition(element: HTMLElement): Position {
	const range = window.getSelection()!.getRangeAt(0);
	const extent = range.collapsed ? 0 : range.toString().length;
	const until = document.createRange();
	until.setStart(element, 0);
	until.setEnd(range.startContainer, range.startOffset);
	const text = until.toString();
	const lines = text.split('\n');
	return { position: text.length, extent, content: lines[lines.length - 1]!, line: lines.length - 1 };
}
function makeRange(element: HTMLElement, start: number, end?: number): Range {
	if (start <= 0) start = 0;
	if (!end || end < 0) end = start;
	const range = document.createRange();
	const queue: (Node | null)[] = [element.firstChild];
	let current = 0;
	let position = start;
	let node: Node | null | undefined;
	while ((node = queue[queue.length - 1])) {
		if (node.nodeType === Node.TEXT_NODE) {
			const length = node.textContent!.length;
			if (current + length >= position) {
				const offset = position - current;
				if (position === start) {
					if (offset < length) range.setStart(node, offset);
					else range.setStartAfter(node);
					if (end !== start) {
						position = end;
						continue;
					} else break;
				} else {
					if (offset < length) range.setEnd(node, offset);
					else range.setEndAfter(node);
					break;
				}
			}
			current += length;
		} else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'BR') {
			if (current + 1 >= position) {
				if (position === start) {
					if (node.textContent!.length > 0) range.setStart(node, 0);
					else range.setStartAfter(node);
					if (end !== start) {
						position = end;
						continue;
					} else break;
				} else {
					if (node.textContent!.length > 0) range.setEnd(node, 0);
					else range.setEndAfter(node);
					break;
				}
			}
			current++;
		}
		queue.pop();
		if (node.nextSibling) queue.push(node.nextSibling);
		if (node.firstChild) queue.push(node.firstChild);
	}
	return range;
}
function select(range: Range): void {
	const selection = window.getSelection()!;
	selection.empty();
	selection.addRange(range);
}
const isUndoRedo = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && !event.altKey && event.code === 'KeyZ';
const INDENT = 2;

class Playground {
	readonly pre: HTMLPreElement;
	readonly preview: HTMLElement;
	readonly language: string;
	code: string;
	lines: Token[][];
	root: Root | undefined;
	error: string | undefined;
	observer = new MutationObserver((records) => this.queue.push(...records));
	queue: MutationRecord[] = [];
	history: [Position, string][] = [];
	historyAt = -1;
	position: Position | null = null;
	disconnected = false;
	lastTrack = 0;
	plaintext = true;
	generation = 0;
	readonly cleanup: (() => void)[] = [];

	constructor(
		readonly container: HTMLElement,
		readonly hint: LiveHint,
	) {
		this.pre = container.querySelector<HTMLPreElement>('pre.prism-code')!;
		const editor = this.pre.parentElement!;
		const children = [...container.children];
		this.preview = (children[1] === editor ? children[3] : children[1]) as HTMLElement;
		this.language = hint.language;
		this.code = hint.code;
		this.lines = [...this.pre.children].map((line) => [...line.children].map((span) => ({ types: span.className.split(' ').slice(1), content: span.textContent ?? '' })));
		this.setupEditor();
		const reset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset code to original"]');
		if (reset) this.listen(reset, 'click', () => this.reset());
		this.paint();
		this.runCompiled(hint.compiled, hint.code);
	}
	listen<K extends string>(target: EventTarget, type: K, handler: (event: Event) => void): void {
		target.addEventListener(type, handler);
		this.cleanup.push(() => target.removeEventListener(type, handler));
	}
	destroy(): void {
		this.observer.disconnect();
		this.root?.unmount();
		for (const fn of this.cleanup) fn();
	}

	paint(): void {
		const dict = themeDict(this.language);
		applyStyle(this.pre, { margin: '0px', outline: 'none', padding: '10px', fontFamily: 'inherit', ...dict.root, tabSize: String(INDENT), whiteSpace: 'pre-wrap' }, true);
		const lines = this.lines.map((line) => {
			const el = document.createElement('span');
			el.className = 'token-line';
			applyStyle(el, dict.plain);
			for (const token of line.filter((t) => !t.empty)) {
				const span = document.createElement('span');
				span.className = ['token', ...token.types].join(' ');
				applyStyle(span, token.types.length === 1 && token.types[0] === 'plain' ? undefined : Object.assign({}, ...token.types.map((type) => dict[type])));
				span.textContent = token.content;
				el.append(span);
			}
			el.append('\n');
			return el;
		});
		this.observer.disconnect();
		this.pre.replaceChildren(...lines);
		this.queue.length = 0;
		this.disconnected = false;
		this.observer.observe(this.pre, { characterData: true, characterDataOldValue: true, childList: true, subtree: true });
		if (this.position && document.activeElement === this.pre) select(makeRange(this.pre, this.position.position, this.position.position + this.position.extent));
	}
	setCode(code: string): void {
		this.code = code;
		const generation = ++this.generation;
		if (loadedTokenize) {
			this.lines = loadedTokenize(code, this.language);
			this.paint();
			return;
		}
		this.lines = code.split('\n').map((line) => (line ? [{ types: ['plain'], content: line }] : []));
		void loadTokenizer().then((tokenize) => {
			if (generation !== this.generation) return;
			this.lines = tokenize(code, this.language);
			this.paint();
		});
		this.paint();
	}

	setupEditor(): void {
		const pre = this.pre;
		try {
			pre.contentEditable = 'plaintext-only';
		} catch {
			pre.contentEditable = 'true';
			this.plaintext = false;
		}
		const indent = ' '.repeat(INDENT);
		const dedentLine = new RegExp(`^(?:${indent})`);
		const trailingIndent = new RegExp(`^(?:${indent})*(${indent})$`);
		const warm = () => {
			void loadTokenizer();
			void loadSucrase();
		};
		this.listen(pre, 'focus', warm);
		this.listen(pre, 'pointerdown', warm);
		this.listen(document, 'selectstart', (event) => {
			this.position = window.getSelection()!.rangeCount && event.target === pre ? getPosition(pre) : null;
		});
		this.listen(window, 'keydown', (e) => {
			const event = e as KeyboardEvent;
			if (event.defaultPrevented || event.target !== pre) return;
			if (this.disconnected) {
				event.preventDefault();
				this.paint();
				return;
			}
			if (isUndoRedo(event)) {
				event.preventDefault();
				let entry: [Position, string] | undefined;
				if (event.shiftKey) {
					entry = this.history[++this.historyAt];
					if (!entry) this.historyAt = this.history.length - 1;
				} else {
					entry = this.history[--this.historyAt];
					if (!entry) this.historyAt = 0;
				}
				if (entry) {
					this.observer.disconnect();
					this.disconnected = true;
					this.position = entry[0];
					this.onEdit(entry[1]);
				}
				return;
			}
			this.track();
			if (event.key === 'Enter') {
				event.preventDefault();
				const position = getPosition(pre);
				const match = /\S/g.exec(position.content);
				this.insert(`\n${position.content.slice(0, match ? match.index : position.content.length)}`);
			} else if ((!this.plaintext || INDENT) && event.key === 'Backspace') {
				event.preventDefault();
				if (window.getSelection()!.getRangeAt(0).collapsed) {
					const match = trailingIndent.exec(getPosition(pre).content);
					this.insert('', match ? -match[1]!.length : -1);
				} else this.insert('', 0);
			} else if (event.key === 'Tab') {
				event.preventDefault();
				const position = getPosition(pre);
				const start = position.position - position.content.length;
				const text = toText(pre);
				this.update(event.shiftKey ? text.slice(0, start) + position.content.replace(dedentLine, '') + text.slice(start + position.content.length) : text.slice(0, start) + indent + text.slice(start));
			}
			if (event.repeat) this.flush();
		});
		this.listen(pre, 'keyup', (e) => {
			const event = e as KeyboardEvent;
			if (event.defaultPrevented || event.isComposing) return;
			if (!isUndoRedo(event)) this.track();
			this.flush();
			pre.focus();
		});
		this.listen(pre, 'paste', (e) => {
			const event = e as ClipboardEvent;
			event.preventDefault();
			this.track(true);
			this.insert(event.clipboardData?.getData('text/plain') ?? '');
			this.track(true);
			this.flush();
		});
	}
	track(force = false): void {
		if (!this.position) return;
		const text = toText(this.pre);
		const position = getPosition(this.pre);
		const now = Date.now();
		const last = this.history[this.historyAt];
		if ((!force && now - this.lastTrack < 500) || (last && last[1] === text)) {
			this.lastTrack = now;
			return;
		}
		const at = ++this.historyAt;
		this.history[at] = [position, text];
		this.history.splice(at + 1);
		if (at > 500) {
			this.historyAt--;
			this.history.shift();
		}
	}
	flush(): void {
		this.queue.push(...this.observer.takeRecords());
		const position = getPosition(this.pre);
		if (!this.queue.length) return;
		this.observer.disconnect();
		this.disconnected = true;
		const text = toText(this.pre);
		this.position = position;
		this.queue.length = 0;
		this.onEdit(text);
	}
	insert(text: string, offset = 0): void {
		let range = window.getSelection()!.getRangeAt(0);
		range.deleteContents();
		range.collapse();
		const position = getPosition(this.pre);
		const start = position.position + (offset < 0 ? offset : 0);
		range = makeRange(this.pre, start, position.position + (offset > 0 ? offset : 0));
		range.deleteContents();
		if (text) range.insertNode(document.createTextNode(text));
		select(makeRange(this.pre, start + text.length));
	}
	update(content: string): void {
		const position = getPosition(this.pre);
		position.position += content.length - toText(this.pre).length;
		this.position = position;
		this.onEdit(content);
	}
	onEdit(text: string): void {
		const code = text.slice(0, -1);
		this.setCode(code);
		void this.transpile(code);
	}
	async transpile(code: string): Promise<void> {
		const generation = this.generation;
		let compiled: string;
		try {
			if (this.hint.noInline && !/render\s*\(/.test(`${code};`)) throw new SyntaxError('No-Inline evaluations must call `render`.');
			compiled = await compile(code, this.hint.noInline);
		} catch (error) {
			if (generation === this.generation) this.showError(error);
			return;
		}
		if (generation === this.generation) this.runCompiled(compiled, code);
	}
	runCompiled(compiled: string, code: string): void {
		this.root?.unmount();
		this.preview.replaceChildren();
		this.error = undefined;
		const root = (this.root = new Root(this.preview, (error) => this.showError(error)));
		try {
			if (this.hint.noInline) {
				if (!/render\s*\(/.test(`${code};`)) throw new SyntaxError('No-Inline evaluations must call `render`.');
				root.render([createElement('div', null)]);
				evalCode(compiled, {
					render: (element: unknown) => {
						if (typeof element === 'undefined') this.showError(new SyntaxError('`render` must be called with valid JSX.'));
						else root.render([createElement('div', null, asElement(element))]);
					},
				});
			} else root.render([createElement('div', null, asElement(evalCode(compiled, {})))]);
		} catch (error) {
			this.showError(error);
		}
	}
	showError(error: unknown): void {
		this.root?.unmount();
		this.preview.replaceChildren();
		this.error = String(error);
		const root = (this.root = new Root(this.preview, () => {}));
		root.render([createElement('div', null), createElement('pre', null, this.error)]);
	}
	reset(): void {
		this.history = [];
		this.historyAt = -1;
		this.position = null;
		this.setCode(this.hint.code);
		this.runCompiled(this.hint.compiled, this.hint.code);
	}
}

const mounted = new Set<Playground>();
let themeObserver: MutationObserver | undefined;

export function mount(container: HTMLElement, hint: LiveHint): void {
	mounted.add(new Playground(container, hint));
	themeObserver ??= new MutationObserver(() => {
		for (const playground of mounted) playground.paint();
	});
	themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

export function sweep(): void {
	for (const playground of mounted) {
		if (playground.container.isConnected) continue;
		playground.destroy();
		mounted.delete(playground);
	}
}
