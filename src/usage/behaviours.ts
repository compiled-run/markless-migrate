import { createHash } from 'node:crypto';
import { alpineExpression, defaultHtmxTrigger, parseAlpineAttribute, parseClassTools, parseHtmxSwap, parseHtmxTarget, parseHtmxTrigger, parseHyperscript } from './grammar.ts';
import { detectEmbeds, embedPlan, type PageEmbed } from '../embed/detect.ts';
import { classesOf, describe, within, type HtmlElement } from './html.ts';
import { analyseScript, type Effect, type Located } from './script.ts';
import { THEME_FEATURES, type ThemeFeature } from './themes.ts';
import type { Behaviour, BehaviourKind, UseSite } from './types.ts';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 8);

type Draft = Omit<Behaviour, 'id' | 'routes' | 'sites'> & { readonly key?: unknown };

/** Collects behaviours across pages: the same use on many pages (a shared header) is one behaviour with every route. */
export class Behaviours {
	private readonly byId = new Map<string, { b: Omit<Behaviour, 'routes' | 'sites'>; routes: Set<string>; sites: UseSite[]; seen: Set<string> }>();

	add(draft: Draft, route: string | undefined, site: UseSite): string {
		const { key, ...rest } = draft;
		const id = `${draft.library}:${draft.feature}:${hash(key ?? draft.details)}`;
		let entry = this.byId.get(id);
		if (!entry) {
			entry = { b: { id, ...rest }, routes: new Set(), sites: [], seen: new Set() };
			this.byId.set(id, entry);
		}
		if (route) entry.routes.add(route);
		const siteKey = JSON.stringify('route' in site ? { e: site.element, l: site.line } : site);
		// A shared element is one site however many pages show it; the first few routes are enough to find it.
		if (!entry.seen.has(siteKey) && entry.sites.length < 12) {
			entry.seen.add(siteKey);
			entry.sites.push(site);
		}
		return id;
	}

	has(id: string): boolean {
		return this.byId.has(id);
	}

	list(): Behaviour[] {
		return [...this.byId.values()].map(({ b, routes, sites }) => ({ ...b, routes: [...routes].sort(), sites })).sort((a, b) => a.id.localeCompare(b.id));
	}
}

export interface ScriptRef {
	readonly src?: string;
	readonly text?: string;
	readonly type?: string;
	readonly line: number;
	readonly route: string;
}

const VERBS = ['get', 'post', 'put', 'patch', 'delete'];
const htmxAttr = (el: HtmlElement, name: string) => el.attrs.get(`hx-${name}`) ?? el.attrs.get(`data-hx-${name}`);
// An attribute htmx inherits from an ancestor when the element does not set it.
const inherited = (el: HtmlElement, name: string) => {
	for (let e: HtmlElement | undefined = el; e; e = e.parent) {
		const v = htmxAttr(e, name);
		if (v !== undefined) return v;
	}
	return undefined;
};

function themeKind(feature: ThemeFeature): BehaviourKind {
	return feature.kind;
}

/** Every use of htmx, its extensions, _hyperscript, Alpine, inline handlers, theme features and embeds one page's markup makes. */
export function pageBehaviours(elements: readonly HtmlElement[], route: string, into: Behaviours, embeds: readonly PageEmbed[] = detectEmbeds(elements, route)): ScriptRef[] {
	const scripts: ScriptRef[] = [];
	const site = (el: HtmlElement): UseSite => ({ route, element: describe(el), line: el.line });
	const themeSeen = new Set<string>();
	const theme = pageTheme(elements);
	for (const el of elements) {
		if (el.tag === 'script') {
			const type = el.attrs.get('type');
			if (type === 'text/hyperscript') {
				for (const f of parseHyperscript(el.text ?? '')) into.add({ library: 'hyperscript', feature: f.feature === 'on' ? `on ${f.events.join(' or ')}` : f.feature, kind: f.commands.some((c) => c.name === 'toggle') ? 'toggle' : 'listener', summary: `a <script type="text/hyperscript"> ${f.feature} feature: ${f.commands.map((c) => `${c.name} ${c.args}`.trim()).join(', then ')}`, details: { ...f } }, route, site(el));
				continue;
			}
			if (type && !/^(text|application)\/(javascript|ecmascript)$|^module$/.test(type)) continue;
			scripts.push({ ...(el.attrs.get('src') ? { src: el.attrs.get('src')! } : { text: el.text ?? '' }), ...(type ? { type } : {}), line: el.line, route });
			continue;
		}
		for (const [name, value] of el.attrs) {
			const bare = name.startsWith('data-hx-') ? name.slice(5) : name;
			const verb = VERBS.find((v) => bare === `hx-${v}`);
			if (verb) {
				const explicit = htmxAttr(el, 'trigger');
				const triggers = explicit ? parseHtmxTrigger(explicit) : [{ event: defaultHtmxTrigger(el.tag, el.attrs), modifiers: {} }];
				const target = parseHtmxTarget(inherited(el, 'target'));
				const swap = parseHtmxSwap(inherited(el, 'swap'));
				const details = { method: verb.toUpperCase(), url: value, triggers, target, swap, ...Object.fromEntries(['select', 'push-url', 'replace-url', 'indicator', 'confirm', 'vals', 'include', 'params', 'sync', 'disabled-elt', 'headers', 'encoding', 'select-oob', 'swap-oob', 'ext'].flatMap((a) => (inherited(el, a) !== undefined ? [[a, inherited(el, a)]] : []))) };
				into.add({ library: 'htmx', feature: `hx-${verb}`, kind: 'request', summary: `${triggers.map((t) => (t.event === 'every' ? `every ${t.every}` : t.event)).join(' or ')} on ${describe(el)}: ${verb.toUpperCase()} ${value}, swap ${swap.style} into ${target.relation}${target.selector ? ` ${target.selector}` : ''}`, details }, route, site(el));
			} else if (bare === 'hx-boost' && value !== 'false') {
				into.add({ library: 'htmx', feature: 'hx-boost', kind: 'boost', summary: `links and forms inside ${describe(el)} load the next page by AJAX and swap the body`, details: { scope: el.tag }, key: { boost: true } }, route, site(el));
			} else if (bare.startsWith('hx-on')) {
				const event = bare.replace(/^hx-on[:-]+/, '').replace(/^:/, 'htmx:');
				const effects = analyseScript(value).effects;
				into.add({ library: 'htmx', feature: 'hx-on', kind: 'listener', summary: `${event} on ${describe(el)} runs: ${summarizeEffects(effects) || value.slice(0, 60)}`, details: { event, code: value, effects } }, route, site(el));
			} else if (bare === 'hx-ext') {
				for (const ext of value.split(',').map((s) => s.trim()).filter(Boolean)) into.add({ library: 'htmx', feature: `extension ${ext}`, kind: ext === 'preload' ? 'navigation' : ext === 'class-tools' ? 'class-timeline' : 'component', summary: `the ${ext} extension is active inside ${describe(el)}`, details: { extension: ext }, key: { ext } }, route, site(el));
			} else if (name === 'classes') {
				const steps = parseClassTools(value);
				into.add({ library: 'class-tools', feature: 'classes', kind: 'class-timeline', summary: `${describe(el)}: ${steps.map((s) => `${s.op} .${s.className} after ${s.delay}`).join(', ')}`, details: { steps } }, route, site(el));
			} else if (name === 'preload') {
				into.add({ library: 'htmx', feature: 'preload', kind: 'navigation', summary: `${describe(el)}: links are fetched ahead on ${value || 'mousedown'}`, details: { on: value || 'mousedown' }, key: { on: value } }, route, site(el));
			} else if (name === '_' || name === 'data-script') {
				for (const f of parseHyperscript(value)) {
					const toggles = f.commands.some((c) => c.name === 'toggle' || c.name === 'add' || c.name === 'remove');
					into.add({ library: 'hyperscript', feature: f.feature === 'on' ? `on ${f.events.join(' or ')}` : f.feature, kind: toggles ? 'toggle' : 'listener', summary: `${f.events.join(' or ') || f.feature} on ${describe(el)}: ${f.commands.map((c) => `${c.name} ${c.args}`.trim()).join(', then ')}`, details: { ...f, on: describe(el), source: value } }, route, site(el));
				}
			} else if (/^on[a-z]+$/.test(name) && value.trim()) {
				const effects = analyseScript(value).effects;
				into.add({ library: 'script', feature: `inline ${name}`, kind: 'listener', summary: `${name.slice(2)} on ${describe(el)} runs: ${summarizeEffects(effects) || value.slice(0, 60)}`, details: { event: name.slice(2), code: value, effects } }, route, site(el));
			} else {
				const alpine = parseAlpineAttribute(name);
				if (!alpine) continue;
				const expression = value ? alpineExpression(value) : { magics: [], keys: [], parsed: true };
				const kind: BehaviourKind = { 'x-data': 'state', 'x-show': 'show-hide', 'x-if': 'show-hide', 'x-transition': 'show-hide', 'x-on': 'listener', 'x-model': 'model', 'x-for': 'list', 'x-bind': 'bind', 'x-text': 'bind', 'x-html': 'bind', 'x-collapse': 'disclosure', 'x-trap': 'dialog' }[alpine.directive] as BehaviourKind | undefined ?? 'component';
				into.add({ library: 'alpine', feature: `${alpine.directive}${alpine.value ? `:${alpine.value}` : ''}`, kind, summary: `${name}="${value.slice(0, 50)}" on ${describe(el)}`, details: { ...alpine, expression: value, magics: expression.magics, keys: expression.keys } }, route, site(el));
			}
		}
		for (const feature of THEME_FEATURES) {
			if (feature.theme !== theme || !feature.match(el)) continue;
			// A theme feature counts once per page, on its outermost element (a category's caret and its link are one category).
			if (feature.kind !== 'disclosure' && themeSeen.has(feature.feature)) continue;
			if (within(el.parent ?? el, (p) => p !== el && feature.match(p))) continue;
			themeSeen.add(feature.feature);
			into.add({ library: feature.theme, feature: feature.feature, kind: themeKind(feature), summary: feature.summary, details: { component: feature.component }, key: { feature: feature.feature } }, route, site(el));
		}
	}
	for (const e of embeds) {
		const plan = embedPlan(e);
		into.add({ library: 'embed', feature: e.providerName, kind: 'embed-frame', summary: `${e.providerName} ${e.form === 'facade' ? 'facade' : e.form} ${e.element}${e.key ? ` (${e.key})` : ''}: ${plan}`, details: { embed: e.id, provider: e.provider, form: e.form, key: e.key, ...(e.url ? { url: e.url } : {}), ...(e.adapter ? { adapter: e.adapter } : {}), ...(e.keep ? { keep: e.keep } : {}), attributes: e.attributes }, key: { embed: e.id } }, route, e.site);
	}
	return scripts;
}

/** The documentation theme that drew the page, from its generator tag or the root element the theme renders into. */
function pageTheme(elements: readonly HtmlElement[]): ThemeFeature['theme'] | undefined {
	for (const el of elements) {
		const generator = el.tag === 'meta' && el.attrs.get('name') === 'generator' ? (el.attrs.get('content') ?? '') : '';
		if (/docusaurus/i.test(generator) || el.attrs.get('id') === '__docusaurus') return 'docusaurus-theme';
		if (/vitepress/i.test(generator) || el.attrs.get('id') === 'VPContent' || classesOf(el).includes('VPApp')) return 'vitepress-theme';
	}
	return undefined;
}

export function summarizeEffects(effects: readonly Effect[]): string {
	return effects
		.slice(0, 6)
		.map((e) => {
			switch (e.kind) {
				case 'listener':
					return `listens for ${e.event} on ${e.target}`;
				case 'storage':
					return `${e.op}s ${e.store}${e.key ? ` "${e.key}"` : ''}`;
				case 'media-query':
					return `reads ${e.query}`;
				case 'timer':
					return `${e.timer}${e.ms !== undefined ? ` ${e.ms} ms` : ''}`;
				case 'fetch':
					return `${e.method ?? ''} ${e.api}${e.url ? ` ${e.url}` : ''}`.trim();
				case 'navigation':
					return e.api;
				case 'observer':
					return `a ${e.observer}`;
				case 'dom-write':
					return `${e.write}${e.value ? ` ${e.value}` : ''} on ${e.target}`;
				case 'library-call':
					return `calls ${e.call}${e.args ? `("${e.args.slice(0, 30)}")` : ''}`;
			}
		})
		.join('; ');
}

const EFFECT_KIND: Readonly<Record<Effect['kind'], BehaviourKind>> = { listener: 'listener', storage: 'storage', 'media-query': 'media-query', timer: 'timer', fetch: 'fetch', navigation: 'navigation', observer: 'observer', 'dom-write': 'dom-write', 'library-call': 'component' };

/**
 * A plain script's effects become behaviours: each listener with what its handler does, each call into a library,
 * and what the script does at load grouped by kind. A script that reads a stored choice and the OS colour scheme and
 * writes an attribute on <html> before the page paints is one theme-init behaviour.
 */
export function scriptBehaviours(name: string, effects: readonly Located[], route: string | undefined, site: (line: number) => UseSite, into: Behaviours): void {
	const scheme = effects.find((e) => e.kind === 'media-query' && /prefers-color-scheme/.test(e.query));
	const rootWrites = effects.filter((e) => e.kind === 'dom-write' && /documentElement|^html$/.test(e.target) && /setAttribute|classList/.test(e.write));
	const stored = effects.find((e) => e.kind === 'storage' && e.op === 'read');
	const used = new Set<Located>();
	if (scheme && rootWrites.length) {
		const parts = [scheme, ...rootWrites, ...(stored ? [stored] : [])];
		for (const p of parts) used.add(p);
		into.add({ library: 'script', feature: 'theme init', kind: 'theme-init', summary: `${name} sets ${rootWrites.map((e) => (e.kind === 'dom-write' ? (e.value ?? e.write) : '')).join(', ')} on <html> from ${stored?.kind === 'storage' ? `${stored.store} "${stored.key}" or ` : ''}the OS colour scheme, before the page paints`, details: { script: name, effects: parts.map(({ line, ...e }) => e) }, key: { script: name, theme: true } }, route, site(scheme.line));
	}
	for (const [i, e] of effects.entries()) {
		if (e.kind !== 'listener') continue;
		const inside = effects.filter((x) => x.in === i);
		for (const x of inside) used.add(x);
		used.add(e);
		into.add({ library: 'script', feature: `on ${e.event}`, kind: inside.some((x) => x.kind === 'fetch') ? 'fetch' : inside.some((x) => x.kind === 'dom-write' && /classList\.toggle/.test(x.write)) ? 'toggle' : 'listener', summary: `${name}: ${e.event} on ${e.target}${inside.length ? ` ${summarizeEffects(inside)}` : ''}`, details: { script: name, event: e.event, target: e.target, effects: inside.map(({ line, in: _, ...x }) => x) }, key: { script: name, event: e.event, target: e.target, effects: inside.map(({ line, in: _, ...x }) => x) } }, route, site(e.line));
	}
	for (const e of effects) {
		if (e.kind !== 'library-call') continue;
		into.add({ library: e.library, feature: e.call, kind: 'component', summary: `${name} calls ${e.call}${e.args ? `("${e.args.slice(0, 40)}")` : ''}`, details: { script: name, call: e.call, args: e.args } }, route, site(e.line));
		used.add(e);
	}
	const atLoad = new Map<Effect['kind'], Located[]>();
	for (const e of effects) if (!used.has(e) && e.in === undefined) atLoad.set(e.kind, [...(atLoad.get(e.kind) ?? []), e]);
	for (const [kind, list] of atLoad) into.add({ library: 'script', feature: `${kind} at load`, kind: EFFECT_KIND[kind], summary: `${name} at load: ${summarizeEffects(list)}${list.length > 6 ? `; ${list.length - 6} more` : ''}`, details: { script: name, effects: list.map(({ line, in: _, ...x }) => x) }, key: { script: name, kind } }, route, site(list[0]!.line));
}
