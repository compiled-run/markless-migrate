import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { chromium } from 'playwright';
import { copyAssets, copyStaticDir, resourcePaths } from './assets.ts';
import { captureAll, type CapturedPage, type CapturedRef } from './capture.ts';
import { captureAllReveals, type Reveal } from './reveal.ts';
import { captureChoices, type Choice } from './choices.ts';
import { parseFragment } from 'parse5';
import { cleanDocument, frameworkBuilds, lateHead, type Dropped } from './clean.ts';
import { attr, body, childrenOf, elementChildren, head, html, isElement, outer, parseDocument, walk, type Document, type Element } from './dom.ts';
import { factor, GENERATED_ID, type Factored } from './factor.ts';
import { BaseTabsPlan, CheckablePlan, DisclosurePlan, InsertedDisclosurePlan, NotifyPlan, SelectPlan, SwitchPlan, TabsPlan } from './stateful.ts';
import { captureScenes, type Scene } from './scenes.ts';
import { ScenePlan } from './scene-plan.ts';
import { bindScroller, captureScrollers, useScrollerOpenings, type ScrollerOpening } from './scrollers.ts';
import { captureAccordions, captureHoverDelays, captureAllForms, captureAllSwitches, captureAllToggles, captureNotifications, type AccordionMode, type FormCapture, type HoverDelay, type Notify, type Switch, type ToggleGroup } from './toggles.ts';
import { bindMount, bindParts, bodyHandlers, candidatesOf, docsearchConfigured, useDocSearch, handledBy, portAttributes, portFor, onRoute, renamedFrom, UNPORTED, useMeasuredProps, useMounts, useResolver, writeParts, type PartUse } from './parts.ts';
import { sourceSlotResolver, usageResolver, type PartResolver } from './usage.ts';
import { stat } from 'node:fs/promises';
import { match } from 'path-to-regexp';
import { readSource } from '../plan/inventory.ts';
import { nextPattern, writeRouting, type EndpointPort } from './endpoints.ts';
import { bodyAfterModule, documentModule, extrasModule, HEAD_HELPER, LAYER_FILL, layerTable, splitBody } from './document.ts';
import { captureOtps, OtpPlan } from './otp.ts';
import { appUrlDeclaration, emitChildren, emitElement, emitHtmlChildren, withOriginToken, lit, mergeBindings, useOrigin, type Binding } from './tsrx.ts';

// Markless wires no handler written in document.tsrx, so each page's root carries the delegating handlers.
const ROOT_HANDLERS = '__MM_ROOT_HANDLERS__';
const PAGE_SHOWN = 'PAGE_SHOWN';
const NOT_FOUND = '/_markless-migrate/not-found';

/** Imports the parts runtime's functions a generated module calls, after its first line. */
function withPartImports(source: string, dir: string): string {
	const used = ['behave', 'listen', 'mount'].filter((name) => source.includes(`=> ${name}(`));
	let out = used.length ? source.replace('\n', `\nimport { ${used.join(', ')} } from '${dir}/index.ts';\n`) : source;
	const rovingNames = ['roving', 'tabValue'].filter((name) => new RegExp(`\\b${name}\\(event\\)`).test(out));
	if (rovingNames.length) out = out.replace('\n', `\nimport { ${rovingNames.join(', ')} } from '${dir}/radix/roving.ts';\n`);
	if (/\baccordionKeys\(/.test(out)) out = out.replace('\n', `\nimport { accordionKeys } from '${dir}/radix/disclosure-motion.ts';\n`);
	const motion = ['panelEnter', 'panelExit'].filter((name) => new RegExp(`\\b${name}\\(`).test(out));
	if (motion.length) out = out.replace('\n', `\nimport { ${motion.join(', ')} } from '${dir}/panel-motion.ts';\n`);
	if (/\bradioKeys\(event/.test(out)) out = out.replace('\n', `\nimport { radioKeys } from '${dir}/toggle.ts';\n`);
	if (/\bwriteCookies\(/.test(out)) out = out.replace('\n', `\nimport { writeCookies } from '${dir}/switch.ts';\n`);
	if (/\bplayScene\(event/.test(out)) out = out.replace('\n', `\nimport { playScene } from '${dir}/scene.ts';\n`);
	return out;
}

// The packages the ported handlers import are traced into the server output as Next.js leaves node_modules
// external: bundled, a CommonJS package that reads __filename (TypeScript, under ts-morph) stops the server at start.
// TypeScript's compiler is one self-contained 9 MB file: copied whole with its package, never parsed by the tracer.
const TYPESCRIPT_BUNDLES: Readonly<Record<string, { readonly pkg: string; readonly file: string }>> = {
	'ts-morph': { pkg: '@ts-morph/common', file: '@ts-morph/common/dist/typescript.js' },
	typescript: { pkg: 'typescript', file: 'typescript/lib/typescript.js' },
};
const traceConfig = (packages: readonly string[]): string => {
	if (!packages.length) return '';
	const bundles = packages.flatMap((p) => (TYPESCRIPT_BUNDLES[p] ? [TYPESCRIPT_BUNDLES[p]] : []));
	const deps = [...packages, ...bundles.map((b) => `${b.pkg}*`)];
	const ignore = bundles.length ? `\n\t\ttraceOpts: { nft: { ignore: (path: string) => ${JSON.stringify(bundles.map((b) => b.file))}.some((file) => path.endsWith(file)) } },` : '';
	return `\n\t\ttraceDeps: ${JSON.stringify(deps)},${ignore}`;
};
export const viteConfig = (packages: readonly string[]) => `// Generated by markless-migrate convert; change the converter, not this file.
import { fileURLToPath } from 'node:url';
import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
	nitro: {
		// The old app's redirects, rewrites and route handlers answer before the pages.
		handlers: [{ middleware: true, handler: fileURLToPath(new URL('./server/routing.ts', import.meta.url)) }],
		serverAssets: [{ baseName: 'built', dir: fileURLToPath(new URL('./server/built', import.meta.url)) }],${traceConfig(packages)}
	},
	plugins: [markless(), router()],
});
`;

export const GENERATED = '// Generated by markless-migrate convert from the old site; change the converter, not this file.';

export interface ConvertOptions {
	/** The old site's origin. */
	readonly old: string;
	/** The Markless app to write into. */
	readonly app: string;
	/** The old app's source, when its framework serves a static directory as it is (Next.js's `public/`). */
	readonly source?: string;
	readonly concurrency?: number;
	readonly log?: (line: string) => void;
	/** Only these routes (for iterating on one page); the generated route table still lists every route. */
	readonly only?: readonly string[];
	/** For a preview of some pages: the old deployment that answers every page not converted. */
	readonly fallthrough?: string;
	/** Which library part renders each element, from the old source; by default plan's libraries.json. */
	readonly resolver?: PartResolver;
	/** Use every control that holds content back on the old pages, to carry that content (default on). */
	readonly reveal?: boolean;
}

export interface HeadTag {
	readonly tag: 'meta' | 'link' | 'title' | 'script' | 'base';
	readonly attrs: Readonly<Record<string, string>>;
	readonly text?: string;
	/** Attribute values that named the old origin, by attribute, as the path after it: the new page writes its own origin there. */
	readonly self?: Readonly<Record<string, string>>;
}

export interface ConvertedRoute {
	readonly route: string;
	readonly page: string;
	readonly bytes: number;
	readonly parts: readonly PartUse[];
}

export interface ConvertReport {
	readonly routes: readonly ConvertedRoute[];
	readonly dropped: Readonly<Record<string, number>>;
	readonly shared: readonly { readonly component: string; readonly pages: number; readonly bytes: number }[];
	readonly assets: { readonly copied: number; readonly missing: readonly string[] };
	readonly styles: number;
	readonly unconverted: readonly { readonly route: string; readonly reason: string }[];
	readonly endpoints: readonly EndpointPort[];
	/** Library parts the source renders that no port implements yet, with how many routes show them (only where a route renders the part itself, not in a shared region). */
	readonly unported: readonly { readonly part: string; readonly routes: number }[];
}

/** The page file a route is served from: `/` is `pages/index.tsrx`, a path with routes under it is its folder's index. */
export function pageFile(pathname: string, folders: ReadonlySet<string>): string {
	const clean = pathname.replace(/\/+$/, '') || '/';
	if (clean === '/') return 'pages/index.tsrx';
	const segments = clean.slice(1).split('/').map((s) => decodeURIComponent(s).replace(/[^\w.-]/g, '_'));
	return folders.has(clean) ? `pages/${segments.join('/')}/index.tsrx` : `pages/${segments.join('/')}.tsrx`;
}

function folderSet(pathnames: readonly string[]): Set<string> {
	const out = new Set<string>();
	for (const p of pathnames) {
		const parts = p.split('/').filter(Boolean);
		for (let i = 1; i < parts.length; i++) out.add(`/${parts.slice(0, i).join('/')}`);
	}
	return out;
}

function attrsOf(el: Element): Record<string, string> {
	return Object.fromEntries(el.attrs.map((a) => [a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value]));
}

function selfReferences(attrs: Record<string, string>, origin: string): Record<string, string> | undefined {
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(attrs)) if (value.startsWith(origin) && /^(\/|$|\?|#)/.test(value.slice(origin.length))) out[name] = value.slice(origin.length);
	return Object.keys(out).length ? out : undefined;
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

interface Prepared {
	/** The same-origin resources the page loads, for the byte-for-byte copy. */
	readonly resources: readonly string[];
	readonly htmlAttrs: Record<string, string>;
	readonly bodyAttrs: Record<string, string>;
	readonly head: HeadTag[];
	/** The body child the page renders; the others are the document's or the page's extras. */
	readonly root: Element;
	readonly before: Element[];
	readonly after: Element[];
	/** Templates of what controls reveal, by the element they go in. */
	readonly appends: Map<Element, string>;
	/** What controls portal to the end of the body, rendered hidden by the Document. */
	readonly layers: readonly { readonly key: string; readonly markup: string; readonly shell: string; readonly fill: string }[];
	/** What copy controls write, by signature and occurrence. */
	readonly clipboard: Readonly<Record<string, string>>;
	/** The styles the old page's scripts injected after load, linked after the page so they never block its first paint. */
	readonly late: readonly string[];
}

// What a library's runtime adds around revealed content for focus handling; its Markless port adds its own.
const FOCUS_GUARD = /^data-[\w-]*focus-guard$|^aria-owns$/;

function elementAt(root: Element, path: readonly number[]): Element | undefined {
	let el: Element | undefined = root;
	for (const i of path) el = el ? elementChildren(el)[i] : undefined;
	return el;
}

function templateMarkup(reveal: Reveal, added: Reveal['added'][number], dropped: (what: string) => void): string {
	if (added.into === 'clipboard') return `<template data-mm-reveal=${JSON.stringify(reveal.key)} data-mm-into="clipboard">{${JSON.stringify(added.html)}}</template>`;
	const fragment = parseFragment(added.html);
	const kept = childrenOf(fragment as unknown as Element).filter((n): n is Element => isElement(n) && !n.attrs.some((a) => FOCUS_GUARD.test(a.name)));
	if (!kept.length) return '';
	const inner = kept.map((el) => emitElement(el, { dropped, bind: (e) => bindParts(e, templatePorts) })).join('');
	const placed = placement(kept);
	return `<template${placed} data-mm-reveal=${JSON.stringify(reveal.key)} data-mm-into=${JSON.stringify(typeof added.into === 'string' ? added.into : 'self')} data-mm-before="${added.before}" data-mm-action="${reveal.action}" data-mm-viewport="${reveal.viewport}">${inner}</template>`;
}

let placementResolver: PartResolver | undefined;
// Ports the parts inside revealed content need (a command palette exists only in its template).
const templatePorts = new Set<string>();
const isRadixTab = (el: Element) => attr(el, 'role') === 'tab' && portFor(el) === 'radix/roving';
const isRadixDisclosure = (el: Element) => portFor(el) === 'radix/disclosure-motion';
const isBaseTab = (el: Element) => attr(el, 'role') === 'tab' && /^base-ui-/.test(attr(el, 'id') ?? '');
// The panel each Base UI tab showed when chosen on the old page (Base UI renders only the chosen one).
const basePanels = new Map<Element, { attrs: Record<string, string>; inner: string }>();
// What the old page put in a Radix tab panel when its tab was chosen, as tsrx, by panel id (TabsPlan renders it on state).
const panelContent = new Map<Element, string>();

// The offsets a positioned part gets from the source (Radix's sideOffset and alignOffset), written on its template; the
// side and alignment are the content's own data-side and data-align.
function placement(kept: readonly Element[]): string {
	if (!placementResolver) return '';
	for (const root of kept) {
		for (const el of [root, ...walkAll(root)]) {
			const slot = attr(el, 'data-slot');
			if (!slot || attr(el, 'data-side') === undefined) continue;
			// The offsets of the library whose markup the element carries: Base UI's tooltip popup and Radix's tooltip
			// content share a data-slot, with defaults of 4 and 0.
			const own = candidatesOf(el, placementResolver);
			for (const c of own.length ? own : placementResolver.candidates(slot)) {
				const side = placementResolver.prop(c.library, c.export, 'sideOffset');
				const align = placementResolver.prop(c.library, c.export, 'alignOffset');
				if (side === undefined && align === undefined) continue;
				return `${side !== undefined ? ` data-mm-side-offset="${side}"` : ''}${align !== undefined ? ` data-mm-align-offset="${align}"` : ''}`;
			}
		}
	}
	return '';
}

function walkAll(root: Element): Element[] {
	const out: Element[] = [];
	for (const child of childrenOf(root)) if (isElement(child)) out.push(child, ...walkAll(child));
	return out;
}

// The same signature as the capture computes in the page: tag, data-slot and text.
function sigOf(el: Element): string {
	return `${el.tagName}|${attr(el, 'data-slot') ?? ''}|${textOf(el).trim().replace(/\s+/g, ' ').slice(0, 60)}`;
}

function textOf(node: Element): string {
	return childrenOf(node)
		.map((n) => (n.nodeName === '#text' ? (n as unknown as { value: string }).value : isElement(n) && n.tagName !== 'template' ? textOf(n) : ''))
		.join('');
}

// What the old page portaled to the end of the body on use (a dialog, a menu, a select), for the page being prepared:
// rendered by Markless, hidden and in its closed state, marked with the control's key.
let currentLayers: { key: string; markup: string; shell: string; fill: string }[] = [];
// What the old page's copy controls wrote, by the control's signature and occurrence.
let currentClipboard: Record<string, string> = {};
// Containers a control replaces its content in (View Code): the content it then shows, rendered hidden beside.
const replaced = new Map<Element, { key: string; trigger: Element; markup: string }>();
const replacedParts = new Map<Element, Binding>();
const unplaced: string[] = [];
const triggerKeys = new Map<Element, string>();
// Content disclosures mounted inside the page on opening, by trigger: rendered by Markless in an arm where they went.
const inserted: { trigger: Element; parent: Element; before: Element | null; markup: string; panelId?: string; panelDepth?: number }[] = [];

/**
 * Radix Select mounts the indicator only in the checked option: every other option of a captured listbox gets a hidden
 * copy where its own indicator would go (the option's empty first span), so choosing one only switches `hidden`.
 */
function selectIndicators(top: Element): void {
	for (const listbox of [top, ...walkAll(top)]) {
		if (attr(listbox, 'role') !== 'listbox' || attr(listbox, 'data-slot') !== 'select-content') continue;
		const optionsOf = walkAll(listbox).filter((o) => attr(o, 'role') === 'option');
		const holder = (o: Element) => elementChildren(o).find((c) => c.tagName === 'span' && !attr(c, 'id'));
		const checked = optionsOf.find((o) => attr(o, 'data-state') === 'checked');
		const indicator = checked && holder(checked) && elementChildren(holder(checked)!)[0];
		if (!indicator) continue;
		indicator.attrs = [...indicator.attrs, { name: 'data-mm-indicator', value: '' }];
		for (const o of optionsOf) {
			const h = holder(o);
			if (o === checked || !h || elementChildren(h).length) continue;
			const copy = parseFragment(outer(indicator)).childNodes[0] as unknown as Element;
			copy.attrs = [...copy.attrs, { name: 'hidden', value: '' }];
			copy.parentNode = h as never;
			h.childNodes.push(copy as never);
		}
	}
}

/** A portal's nodes in their closed state: data-state="closed", data-closed for data-open, hidden, and the control's key. */
/** Replaces every whitespace-separated token of every attribute that `rename` names. */
function renameIds(els: readonly Element[], rename: ReadonlyMap<string, string>): void {
	if (!rename.size) return;
	for (const el of els)
		for (const a of el.attrs) {
			if (!a.value) continue;
			if (a.name === 'id' && rename.has(a.value)) renamedFrom(el, a.value);
			a.value = a.value.split(/(\s+)/).map((t) => rename.get(t) ?? t).join('');
		}
}

/**
 * The element of an inserted disclosure its motion runs from: a root with an id, else the element its trigger names
 * (Radix NavigationMenu's content inside its viewport), with how many ancestors up to the root close with it.
 */
function panelOf(kept: readonly Element[], controls: string | undefined): { panelId?: string; panelDepth?: number } {
	const own = kept.map((e) => attr(e, 'id')).find(Boolean);
	if (own) return { panelId: own };
	for (const top of kept) {
		const named = controls ? walkAll(top).find((el) => attr(el, 'id') === controls) : undefined;
		if (!named) continue;
		let depth = 0;
		for (let n = named; n !== top && n.parentNode; n = n.parentNode as Element) depth++;
		return { panelId: controls!, panelDepth: depth };
	}
	return {};
}

const layerElements = (added: Reveal['added'][number]) => childrenOf(parseFragment(added.html) as unknown as Element).filter((n): n is Element => isElement(n) && !n.attrs.some((a) => FOCUS_GUARD.test(a.name)));

/**
 * The ids a framework generated per render inside a layer (Radix's and React's useId), and the layer's key when it is
 * one, given names from the layer's own content: the same dialog on two pages differs only by those ids, and is then
 * one layer component instead of one per page.
 */
function layerIds(key: string, kept: readonly Element[]): Map<string, string> {
	const own: string[] = [];
	for (const top of kept) for (const el of [top, ...walkAll(top)]) {
		const id = attr(el, 'id');
		if (id && GENERATED_ID.test(id) && !own.includes(id)) own.push(id);
	}
	if (GENERATED_ID.test(key) && !own.includes(key)) own.push(key);
	if (!own.length) return new Map();
	let text = kept.map((e) => outer(e)).join('');
	own.forEach((id, k) => (text = text.split(id).join(`@${k}`)));
	const h = hash(text).slice(0, 8);
	return new Map(own.map((id, k) => [id, `mm-${h}-${k}`]));
}

/**
 * The element of a layer most of its markup sits in (a command palette's list): a served layer's page keeps the layer
 * with this element emptied as its shell, and the file holds this element's content.
 */
function hollowOf(kept: readonly Element[]): Element | undefined {
	const size = (el: Element) => outer(el).length;
	let at = [...kept].sort((x, y) => size(y) - size(x))[0];
	for (let next = at; next; ) {
		at = next;
		const total = size(at);
		next = elementChildren(at).find((child) => size(child) >= total * 0.9);
	}
	return at;
}

/**
 * A layer as tsrx; its shell (the same with its largest content emptied and marked with LAYER_FILL); and that content as
 * HTML, for a layer served as a file: the shell renders at once on use, the content when the file lands.
 */
function layerMarkup(reveal: Reveal, added: Reveal['added'][number], dropped: (what: string) => void, rename: ReadonlyMap<string, string> = new Map(), kept: Element[] = layerElements(added)): { markup: string; shell: string; fill: string } {
	const placed = placement(kept);
	for (const top of kept) renameIds([top, ...walkAll(top)], rename);
	const key = rename.get(reveal.key) ?? reveal.key;
	const extra = placed ? placed.trim().split(/\s+(?=data-)/) : [];
	for (const top of kept) {
		for (const el of [top, ...walkAll(top)]) {
			for (const a of el.attrs) if (a.name === 'data-state' && a.value === 'open') a.value = 'closed';
			if (el.attrs.some((a) => a.name === 'data-open')) el.attrs = [...el.attrs.filter((a) => a.name !== 'data-open'), { name: 'data-closed', value: '' }];
		}
		selectIndicators(top);
		top.attrs = [...top.attrs.filter((a) => a.name !== 'hidden'), { name: 'hidden', value: '' }, { name: 'data-mm-layer', value: key }, ...(reveal.viewport !== 'desktop' ? [{ name: 'data-mm-viewport', value: reveal.viewport }] : [])];
	}
	const hollow = hollowOf(kept);
	const emit = (shell: boolean) =>
		kept
			.map((top) =>
				emitElement(top, {
					dropped,
					bind: (x) => {
						const own = x === top ? mergeBindings(bindParts(x, templatePorts), extra.length ? { extra } : undefined) : bindParts(x, templatePorts);
						return shell && x === hollow ? mergeBindings(own, { children: '', extra: [`data-mm-layer-fill="${LAYER_FILL}"`] }) : own;
					},
				}),
			)
			.join('');
	// The shell goes into a <template>, whose content Markless never resumes: its origin is the token, like the file's.
	return { markup: emit(false), shell: withOriginToken(() => emit(true)), fill: hollow ? emitHtmlChildren(hollow) : '' };
}

/** A resolver that asks `first`, and `then` for what `first` does not know. */
function combined(first: PartResolver, then: PartResolver): PartResolver {
	return {
		name: `${first.name}, then ${then.name}`,
		// The second adds what the first does not know: a slot a wrapper passes on to another library's part.
		candidates: (slot) => {
			const own = first.candidates(slot);
			return [...own, ...then.candidates(slot).filter((c) => !own.some((o) => o.library === c.library && o.export === c.export))];
		},
		libraries: () => new Map([...then.libraries(), ...first.libraries()]),
		prop: (library, exportName, prop) => first.prop(library, exportName, prop) ?? then.prop(library, exportName, prop),
	};
}

// A timed delay includes the old page's render after its timer fired (10 to 30 ms): the round delay at or below it.
const ROUND_DELAYS = [0, 10, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000, 1500, 2000];
const delayOf = (ms: number) => ROUND_DELAYS.filter((d) => d <= ms).at(-1) ?? 0;

/** Finds an element of a page by its signature and occurrence, as reveals and toggles were captured. */
function locator(root: Element): (sig: string, nth: number) => Element | undefined {
	const bySig = new Map<string, Element[]>();
	const index = (el: Element) => {
		for (const child of childrenOf(el)) {
			if (!isElement(child) || child.tagName === 'template') continue;
			const sig = sigOf(child);
			(bySig.get(sig) ?? bySig.set(sig, []).get(sig)!).push(child);
			index(child);
		}
	};
	index(root);
	return (sig, nth) => bySig.get(sig)?.[nth];
}

function resolveReveals(doc: Document, reveals: readonly Reveal[], dropped: (what: string) => void): Map<Element, string> {
	const appends = new Map<Element, string>();
	const root = body(doc);
	const add = (el: Element, markup: string) => markup && appends.set(el, (appends.get(el) ?? '') + markup);
	const bySig = new Map<string, Element[]>();
	const index = (el: Element) => {
		for (const child of childrenOf(el)) {
			if (!isElement(child) || child.tagName === 'template') continue;
			const sig = sigOf(child);
			(bySig.get(sig) ?? bySig.set(sig, []).get(sig)!).push(child);
			index(child);
		}
	};
	index(root);
	const byId = new Map<string, Element>();
	for (const el of walk(root)) {
		const id = attr(el, 'id');
		if (id) byId.set(id, el);
	}
	const pendingLayers: { reveal: Reveal; added: Reveal['added'][number]; trigger: Element | undefined; kept: Element[] }[] = [];
	for (const reveal of reveals) {
		const atPath = elementAt(root, reveal.path);
		const trigger = reveal.sig !== undefined && (!atPath || sigOf(atPath) !== reveal.sig) ? (bySig.get(reveal.sig)?.[reveal.nth ?? 0] ?? atPath) : atPath;
		const panel = trigger && (isRadixTab(trigger) || isRadixDisclosure(trigger)) ? byId.get(attr(trigger, 'aria-controls') ?? '') : undefined;
		if (trigger && isBaseTab(trigger)) {
			const shown = reveal.added.filter((a) => typeof a.into !== 'string').flatMap((a) => childrenOf(parseFragment(a.html) as unknown as Element).filter(isElement)).find((e) => attr(e, 'role') === 'tabpanel');
			if (shown) basePanels.set(trigger, { attrs: Object.fromEntries(shown.attrs.map((a) => [a.name, a.value])), inner: childrenOf(shown).map((n) => outer(n)).join('') });
			continue;
		}
		if (panel) {
			const markup = reveal.added
				.filter((a) => typeof a.into !== 'string')
				.map((a) => childrenOf(parseFragment(a.html) as unknown as Element).filter(isElement).map((e) => emitElement(e, { dropped, bind: (x) => bindParts(x, templatePorts) })).join(''))
				.join('');
			if (markup) panelContent.set(panel, markup);
			continue;
		}
		for (const added of reveal.added) {
			if (added.into === 'body') {
				pendingLayers.push({ reveal, added, trigger, kept: layerElements(added) });
			} else if (added.into === 'clipboard') {
				if (reveal.sig !== undefined) currentClipboard[`${reveal.sig}#${reveal.nth ?? 0}`] = added.html;
			} else if (added.into === 'replace') {
				let container: Element | null = trigger ?? null;
				for (let depth = added.before; depth > 0 && container; depth--) container = container.parentNode as Element | null;
				if (container && trigger) {
					const after = childrenOf(parseFragment(added.html) as unknown as Element).filter(isElement);
					const markup = after.map((top) => emitElement(top, { dropped, bind: (x) => (x === top ? mergeBindings(bindParts(x, templatePorts), { extra: ['hidden', `data-mm-after=${JSON.stringify(reveal.key)}`] }) : bindParts(x, templatePorts)) })).join('');
					replaced.set(container, { key: reveal.key, trigger, markup });
				}
			} else {
				const kept = childrenOf(parseFragment(added.html) as unknown as Element).filter((n): n is Element => isElement(n) && !n.attrs.some((a) => FOCUS_GUARD.test(a.name)));
				if (!kept.length) continue;
				const parent = elementAt(root, added.into);
				// A disclosure that mounts its content where it opens (Base UI Collapsible and Accordion, a Radix
				// Collapsible whose content leaves while closed): a layer's trigger (aria-haspopup) is a portal's.
				const inPlace = trigger && parent && attr(trigger, 'aria-expanded') === 'false' && attr(trigger, 'aria-haspopup') === undefined && !reveal.added.some((a) => a.into === 'body');
				const panel = panelOf(kept, attr(trigger!, 'aria-controls'));
				if (inPlace) inserted.push({ trigger: trigger!, parent: parent!, before: added.before >= 0 ? (elementChildren(parent!)[added.before] ?? null) : null, markup: kept.map((e) => emitElement(e, { dropped, bind: (x) => bindParts(x, templatePorts) })).join(''), ...panel });
				else unplaced.push(`${reveal.key}: content shown inside the page by a control no Markless state drives yet`);
			}
		}
	}
	// Layers last: their generated ids are renamed from their content, here and wherever the page names them.
	const rename = new Map<string, string>();
	const taken = new Set<string>();
	// Two alike layers on one page (the same tooltip on two buttons) keep distinct ids.
	for (const l of pendingLayers) for (const [from, to] of layerIds(l.reveal.key, l.kept)) {
		if (rename.has(from)) continue;
		let name = to;
		for (let n = 2; taken.has(name); n++) name = `${to}-${n}`;
		taken.add(name);
		rename.set(from, name);
	}
	renameIds([...walk(root)], rename);
	for (const l of pendingLayers) {
		const { markup, shell, fill } = layerMarkup(l.reveal, l.added, dropped, rename, l.kept);
		const key = rename.get(l.reveal.key) ?? l.reveal.key;
		if (markup) currentLayers.push({ key, markup, shell, fill });
		// A trigger that names its layer neither by id nor by aria-controls (a Radix tooltip's) is marked with the key.
		if (markup && l.trigger && !attr(l.trigger, 'id') && !attr(l.trigger, 'aria-controls') && !triggerKeys.has(l.trigger)) triggerKeys.set(l.trigger, key);
	}
	return appends;
}

/** Pulls each inline `<style>` out of `parent` into a stylesheet file, linked from where it stood. */
function extractStyles(parent: Element, styles: Map<string, string>): void {
	const list = childrenOf(parent);
	for (let i = 0; i < list.length; i++) {
		const node = list[i]!;
		if (!isElement(node)) continue;
		if (node.tagName === 'style') {
			const css = childrenOf(node)
				.map((n) => ('value' in n ? (n as { value: string }).value : ''))
				.join('');
			const path = `/_converted/styles/${hash(css)}.css`;
			styles.set(path, css);
			const link: Element = { nodeName: 'link', tagName: 'link', attrs: [{ name: 'rel', value: 'stylesheet' }, { name: 'href', value: path }, ...node.attrs.filter((a) => a.name === 'media')], namespaceURI: node.namespaceURI, childNodes: [], parentNode: parent } as unknown as Element;
			list[i] = link;
		} else extractStyles(node, styles);
	}
}

function prepare(capture: CapturedPage, reveals: readonly Reveal[], origin: string, dropped: Dropped, styles: Map<string, string>): Prepared {
	const builds = frameworkBuilds(capture.server).map((b) => b.path);
	const ctx = { builds, frameworkScripts: new Set<string>(), origin };
	const doc = parseDocument(capture.settled.desktop ?? Object.values(capture.settled)[0] ?? capture.server);
	currentLayers = [];
	currentClipboard = {};
	const appends = resolveReveals(doc, reveals, (what) => dropped.set(`${what}: not writable as an attribute`, (dropped.get(`${what}: not writable as an attribute`) ?? 0) + 1));
	const layers = currentLayers;
	const clipboard = currentClipboard;
	cleanDocument(doc, ctx, dropped);
	// Only the served <html> element's attributes are read: what precedes <head> is parsed, not the whole document.
	const headAt = capture.server.search(/<head[\s>]/i);
	const served = parseDocument(headAt > 0 ? capture.server.slice(0, headAt) : capture.server);
	cleanDocument(served, ctx, new Map());
	const late = lateHead(doc, parseDocument(capture.server), dropped).map((el) => {
		const holder = { nodeName: 'div', tagName: 'div', attrs: [], childNodes: [el] } as unknown as Element;
		extractStyles(holder, styles);
		return attr(childrenOf(holder)[0] as Element, 'href')!;
	});
	extractStyles(head(doc), styles);
	extractStyles(body(doc), styles);
	const tags: HeadTag[] = [];
	for (const node of childrenOf(head(doc))) {
		if (!isElement(node)) continue;
		const tag = node.tagName as HeadTag['tag'];
		if (!['meta', 'link', 'title', 'script', 'base'].includes(tag)) continue;
		if (tag === 'meta' && attr(node, 'name') === 'next-size-adjust') {
			dropped.set("<meta name=next-size-adjust>: the old framework's font marker", (dropped.get("<meta name=next-size-adjust>: the old framework's font marker") ?? 0) + 1);
			continue;
		}
		const attrs = attrsOf(node);
		const text = tag === 'title' || tag === 'script' ? childrenOf(node).map((n) => ('value' in n ? (n as { value: string }).value : '')).join('') : undefined;
		const self = selfReferences(attrs, origin);
		tags.push({ tag, attrs, ...(text !== undefined ? { text } : {}), ...(self ? { self } : {}) });
	}
	const kids = elementChildren(body(doc));
	const root = kids.reduce((a, b) => (outer(b).length > outer(a).length ? b : a));
	const at = kids.indexOf(root);
	return { resources: resourcePaths(doc, origin), htmlAttrs: attrsOf(html(served)), bodyAttrs: attrsOf(body(doc)), head: tags, root, before: kids.slice(0, at), after: kids.slice(at + 1), appends, layers, clipboard, late };
}

function headModule(byRoute: Map<string, Prepared>): string {
	const table: HeadTag[] = [];
	const index = new Map<string, number>();
	const routes: Record<string, { tags: number[]; html: Record<string, string>; body: Record<string, string>; late: readonly string[] }> = {};
	for (const [route, p] of byRoute) {
		const ids = p.head.map((t) => {
			const key = JSON.stringify(t);
			if (!index.has(key)) {
				index.set(key, table.length);
				table.push(t);
			}
			return index.get(key)!;
		});
		routes[route] = { tags: ids, html: p.htmlAttrs, body: p.bodyAttrs, late: p.late };
	}
	return `${GENERATED}
export interface HeadTag {
	readonly tag: 'meta' | 'link' | 'title' | 'script' | 'base';
	readonly attrs: Readonly<Record<string, string>>;
	readonly text?: string;
	readonly self?: Readonly<Record<string, string>>;
}

export const TAGS: readonly HeadTag[] = ${JSON.stringify(table)};

export const ROUTES: Readonly<Record<string, { readonly tags: readonly number[]; readonly html: Readonly<Record<string, string>>; readonly body: Readonly<Record<string, string>>; readonly late: readonly string[] }>> = ${JSON.stringify(routes)};
`;
}

/**
 * Turns every HTML route of the old site into a Markless page: the document a visitor's browser ends up with (captured
 * the way `check` loads it), without the old framework's runtime, as `.tsrx`; the head per route; shared regions as
 * components; the old browser behaviour of known parts bound to Markless handlers; and every resource copied byte for byte.
 */
export async function convert(options: ConvertOptions): Promise<ConvertReport> {
	const log = options.log ?? (() => {});
	const app = options.app;
	const state = join(app, '.migrate');
	const planned = JSON.parse(await readFile(join(state, 'inventory.json'), 'utf8')) as { routes: { route: string; status: number }[]; allRoutes?: { route: string; status?: number; contentType?: string }[] };
	// allRoutes carries each route's content type; routes only those the browser inventoried.
	const types = new Map((planned.allRoutes ?? []).map((r) => [r.route, r]));
	const inventory = { routes: [...new Map([...planned.routes.map((r) => [r.route, { route: r.route, status: r.status, contentType: types.get(r.route)?.contentType }] as const), ...(planned.allRoutes ?? []).filter((r) => r.status !== undefined).map((r) => [r.route, { route: r.route, status: r.status!, contentType: r.contentType }] as const)]).values()] };
	const htmlRoutes = inventory.routes.filter((r) => r.status === 200 && (r.contentType ?? 'text/html').includes('html')).map((r) => r.route);
	const routes = options.only?.length ? htmlRoutes.filter((r) => options.only!.includes(r)) : htmlRoutes;
	const browser = await chromium.launch();
	let captures: CapturedRef[];
	const revealed = new Map<string, readonly Reveal[]>();
	const toggled = new Map<string, readonly ToggleGroup[]>();
	const switched = new Map<string, readonly Switch[]>();
	const submitted = new Map<string, FormCapture['forms']>();
	const notified = new Map<string, readonly Notify[]>();
	const accordionModes = new Map<string, readonly AccordionMode[]>();
	const hoverDelays = new Map<string, readonly HoverDelay[]>();
	const scrollerOpenings = new Map<string, readonly ScrollerOpening[]>();
	const scenes = new Map<string, { scene: Scene; listed: string }[]>();
	const choices: Record<string, Record<string, Choice>> = {};
	try {
		// The old site's not-found page, from a path no route has: the new app's 404 page.
		captures = await captureAll(browser, options.old, options.only?.length ? routes : [...routes, NOT_FOUND], join(state, 'convert', 'captures'), { concurrency: options.concurrency ?? 4, log });
		// Controls the site's own components reveal content with, beside those ARIA marks (lib/site/controls.json).
		const listed = await readFile(join(app, 'lib', 'site', 'controls.json'), 'utf8').then((t) => JSON.parse(t) as { selector: string; action: Reveal['action'] | 'toggle' | 'notify' | 'play'; routes?: string }[], () => []);
		const extra = listed.flatMap((c) => (c.action === 'toggle' || c.action === 'notify' || c.action === 'play' ? [] : [[c.selector, c.action] as const]));
		// Controls whose use the demo's own state answers (Send, Replay, Show more): every use recorded frame by frame.
		for (const c of listed.filter((x) => x.action === 'play'))
			for (const r of routes.filter((x) => !c.routes || new RegExp(c.routes).test(x))) scenes.set(r, [...(scenes.get(r) ?? []), ...(await captureScenes(browser, options.old, r, join(state, 'convert', 'scenes'), c.selector)).scenes.map((scene) => ({ scene, listed: c.selector }))]);
		// Controls whose use shows a notification (a toast), on the routes the site lists them for.
		for (const c of listed.filter((x) => x.action === 'notify')) {
			const on = routes.filter((r) => !c.routes || new RegExp(c.routes).test(r));
			for (const r of on) notified.set(r, [...(notified.get(r) ?? []), ...(await captureNotifications(browser, options.old, r, join(state, 'convert', 'toggles'), [c.selector])).notifications]);
		}
		if (options.reveal !== false) for (const r of await captureAllReveals(browser, options.old, routes, join(state, 'convert', 'reveals'), { concurrency: options.concurrency ?? 4, log, extra })) revealed.set(r.route, r.reveals);
		// Whether each accordion lets several items be open, on the routes where one revealed an item's content.
		for (const [route, reveals] of revealed) if (reveals.some((r) => r.sig?.includes('|accordion-trigger|'))) accordionModes.set(route, (await captureAccordions(browser, options.old, route, join(state, 'convert', 'toggles'))).accordions);
		for (const [route, reveals] of revealed) if (reveals.some((r) => r.sig?.includes('|hover-card-trigger|'))) hoverDelays.set(route, (await captureHoverDelays(browser, options.old, route, join(state, 'convert', 'toggles'))).delays);
		for (const c of captures) if (c && (await c.load()).server.includes('data-slot="message-scroller"')) scrollerOpenings.set(c.route, (await captureScrollers(browser, options.old, c.route, join(state, 'convert', 'toggles'))).scrollers);
		if (options.reveal !== false) for (const t of await captureAllToggles(browser, options.old, routes, join(state, 'convert', 'toggles'), { concurrency: options.concurrency ?? 4, log })) toggled.set(t.route, t.groups);
		// Controls the site lists as switching attributes in place (lib/site/controls.json, action "toggle").
		const switchSelectors = listed.filter((c) => c.action === 'toggle').map((c) => c.selector);
		if (options.reveal !== false) for (const f of await captureAllForms(browser, options.old, routes, join(state, 'convert', 'toggles'), { concurrency: options.concurrency ?? 4 })) submitted.set(f.route, f.forms);
		if (options.reveal !== false) for (const c of await captureAllSwitches(browser, options.old, routes, join(state, 'convert', 'toggles'), switchSelectors, { concurrency: options.concurrency ?? 4, log })) switched.set(c.route, c.switches);
		// Options revealed without a link (a command palette's items): what choosing each did, once per control.
		const seenKeys = new Set<string>();
		for (const [route, reveals] of revealed)
			for (const reveal of reveals) {
				if (seenKeys.has(reveal.key) || !reveal.added.some((a) => a.into === 'body' && /cmdk-item|role="option"|role="menuitem"/.test(a.html))) continue;
				seenKeys.add(reveal.key);
				const found = await captureChoices(browser, options.old, route, reveal, join(state, 'convert', 'choices'), log);
				if (Object.values(found).some((c) => c.href || c.copied !== undefined)) choices[reveal.key] = found;
			}
	} finally {
		await browser.close();
	}
	const usagePath = join(state, 'usage.json');
	const librariesPath = join(state, 'libraries.json');
	const hasUsage = await stat(usagePath).then(() => true, () => false);
	const hasLibraries = await stat(librariesPath).then(() => true, () => false);
	// The usage inventory first; a data-slot it has no part for (a component it did not reach) from plan's libraries.json.
	const resolver: PartResolver = options.resolver ?? (hasUsage ? (hasLibraries ? combined(await usageResolver(usagePath, options.source), await sourceSlotResolver(librariesPath, options.source)) : await usageResolver(usagePath, options.source)) : await sourceSlotResolver(librariesPath, options.source));
	useResolver(resolver);
	useDocSearch(hasUsage ? ((JSON.parse(await readFile(usagePath, 'utf8')) as { docsearch?: Parameters<typeof useDocSearch>[0] }).docsearch) : undefined);
	useOrigin(new URL(options.old).origin);
	placementResolver = resolver;
	templatePorts.clear();
	log(`parts resolved by: ${resolver.name}`);
	const dropped: Dropped = new Map();
	const styles = new Map<string, string>();
	const unconverted: { route: string; reason: string }[] = [];
	const prepared = new Map<string, Prepared>();
	// Each capture (the served HTML and the settled documents, a few MB) is read from the cache only while its page is parsed.
	for (const ref of captures) {
		if (ref.status !== 200 && !(ref.route === NOT_FOUND && ref.status === 404)) {
			unconverted.push({ route: ref.route, reason: `the old site answered ${ref.status} while capturing` });
			continue;
		}
		prepared.set(ref.route, prepare(await ref.load(), revealed.get(ref.route) ?? [], options.old, dropped, styles));
	}

	const bodyParts = splitBody(new Map([...prepared].map(([route, p]) => [route, { route, before: p.before, after: p.after, htmlAttrs: p.htmlAttrs, bodyAttrs: p.bodyAttrs, head: p.head }])));
	const pathOf = (route: string) => new URL(route, options.old).pathname;
	const sharedParts: PartUse[] = [];
	const usedPorts = templatePorts;
	const appendOf = (el: Element) => {
		for (const p of prepared.values()) {
			const markup = p.appends.get(el);
			if (markup) return markup;
		}
		return undefined;
	};
	const appended = new Map<Element, string>();
	for (const p of prepared.values()) for (const [el, markup] of p.appends) appended.set(el, markup);
	useMounts(await readFile(join(app, 'lib', 'site', 'mounts.json'), 'utf8').then((t) => JSON.parse(t) as string[], () => []));
	const tabs = new TabsPlan();
	let tabGroups = 0;
	for (const p of prepared.values()) tabGroups += tabs.add(p.root, isRadixTab, (panel) => panelContent.get(panel));
	if (tabGroups) log(`tabs on Markless state: ${tabGroups} tab lists`);
	const baseTabs = new BaseTabsPlan();
	let baseTabGroups = 0;
	const emitPanel = (html: string) => emitChildren(parseFragment(html) as unknown as Element, { bind: (el) => bindParts(el, templatePorts) });
	for (const p of prepared.values()) baseTabGroups += baseTabs.add(p.root, isBaseTab, (t) => basePanels.get(t), emitPanel);
	if (baseTabGroups) {
		log(`Base UI tab lists on Markless state: ${baseTabGroups}`);
		templatePorts.add('radix/roving');
	}
	const ownDelays = new Map<Element, Record<string, string>>();
	for (const [route, p] of prepared) {
		const delays = hoverDelays.get(route) ?? [];
		const locate = delays.length ? locator(p.root.parentNode as Element) : undefined;
		for (const d of delays) {
			const el = locate!(d.sig, d.nth);
			if (el) ownDelays.set(el, { openDelay: String(delayOf(d.open)), delay: String(delayOf(d.open)), closeDelay: String(delayOf(d.close)) });
		}
	}
	useMeasuredProps(ownDelays);
	const openings = new Map<Element, ScrollerOpening['position']>();
	for (const [route, p] of prepared) {
		const list = scrollerOpenings.get(route) ?? [];
		const locate = list.length ? locator(p.root.parentNode as Element) : undefined;
		for (const s of list) {
			const el = locate!(s.sig, s.nth);
			if (el) openings.set(el, s.position);
		}
	}
	useScrollerOpenings(openings);
	const multipleAccordions = new Set<Element>();
	for (const [route, p] of prepared) {
		const several = (accordionModes.get(route) ?? []).filter((a) => a.multiple);
		const locate = several.length ? locator(p.root.parentNode as Element) : undefined;
		for (const a of several) {
			const el = locate!(a.sig, a.nth);
			if (el) multipleAccordions.add(el);
		}
	}
	if (multipleAccordions.size) log(`accordions with several items open at once: ${multipleAccordions.size}`);
	const multiple = (accordion: Element) => multipleAccordions.has(accordion);
	const disclosures = new DisclosurePlan();
	let disclosureGroups = 0;
	for (const p of prepared.values()) disclosureGroups += disclosures.add(p.root, isRadixDisclosure, (panel) => panelContent.get(panel), multiple);
	if (disclosureGroups) log(`accordions and collapsibles on Markless state: ${disclosureGroups}`);
	const insertedDisclosures = new InsertedDisclosurePlan();
	const insertedGroups = insertedDisclosures.add(inserted, [...prepared.values()].map((p) => p.root), multiple);
	if (insertedGroups) log(`disclosures that mount their content in place, on Markless state: ${insertedGroups}`);
	// A form the old page's script handled (submitting it left the page where it was) does not submit natively.
	const handledForms = new Set<Element>();
	for (const [route, p] of prepared) {
		const locate = locator(p.root.parentNode as Element);
		for (const f of submitted.get(route) ?? []) {
			const el = f.navigates ? undefined : locate(f.sig, f.nth);
			if (el?.tagName === 'form') handledForms.add(el);
		}
	}
	const formBinding: Binding = { extra: ['data-mm-form=""', 'onSubmit={(event) => event.preventDefault()}'] };
	if (handledForms.size) templatePorts.add('form');
	const notifyPlan = new NotifyPlan();
	let notifyCount = 0;
	for (const [route, p] of prepared) notifyCount += notifyPlan.add(notified.get(route) ?? [], locator(p.root.parentNode as Element), (html) => emitChildren(parseFragment(html) as unknown as Element));
	if (notifyCount) log(`notifications on Markless state: ${notifyCount}`);
	// The shared body children holding a live region a page shows its notifications in: that page renders them.
	const ownAfter = new Map<string, number[]>();
	for (const route of prepared.keys())
		bodyParts.after.forEach((c, i) => {
			const el = c.byRoute.get(route);
			if (el && [...walk(el)].some((x) => notifyPlan.hosts(x))) (ownAfter.get(route) ?? ownAfter.set(route, []).get(route)!).push(i);
		});
	// A route whose own body children hold such a region renders all of them itself, after its root.
	const ownExtras = new Map<string, readonly Element[]>();
	for (const [route, extras] of bodyParts.extras) if (extras.some((el) => [...walk(el)].some((x) => notifyPlan.hosts(x)))) ownExtras.set(route, extras);
	const switchPlan = new SwitchPlan();
	let switchGroups = 0;
	for (const [route, p] of prepared) switchGroups += switchPlan.add(switched.get(route) ?? [], locator(p.root.parentNode as Element));
	if (switchGroups) {
		log(`site switches on Markless state: ${switchGroups}`);
		templatePorts.add('switch');
	}
	const checkables = new CheckablePlan();
	let checkableGroups = 0;
	const emitHtml = (html: string) => emitChildren(parseFragment(html) as unknown as Element, { dropped: (what) => dropped.set(`${what}: not writable as an attribute`, (dropped.get(`${what}: not writable as an attribute`) ?? 0) + 1) });
	for (const [route, p] of prepared) checkableGroups += checkables.add(p.root, toggled.get(route) ?? [], locator(p.root.parentNode as Element), emitHtml);
	if (checkableGroups) {
		log(`checkboxes, switches, toggles and radio groups on Markless state: ${checkableGroups}`);
		templatePorts.add('toggle');
	}
	handledBy((el) => checkables.bind(el) !== undefined || baseTabs.bind(el) !== undefined || insertedDisclosures.bind(el) !== undefined);
	// input-otp fields, used once each on the old page for the caret their site renders and the text that shows their value.
	const otps = new OtpPlan();
	const otpRoutes = [...prepared].filter(([, p]) => [...walk(p.root)].some((el) => attr(el, 'data-input-otp-container') !== undefined));
	if (otpRoutes.length && options.reveal !== false) {
		const otpBrowser = await chromium.launch();
		try {
			let fields = 0;
			for (const [route, p] of otpRoutes) fields += otps.add((await captureOtps(otpBrowser, options.old, route, join(state, 'convert', 'toggles'))).fields, locator(p.root.parentNode as Element), (html) => emitChildren(parseFragment(html) as unknown as Element));
			if (fields) log(`input-otp fields on Markless state: ${fields}`);
		} finally {
			await otpBrowser.close();
		}
	}
	const selects = new SelectPlan();
	for (const p of prepared.values()) selects.add(p.root, (el) => portFor(el) === 'base-ui/select' || portFor(el) === 'radix/select');
	// A demo's recorded uses never take over an element another plan puts on Markless state (a disclosure, a tab, a toggle).
	const scenePlan = new ScenePlan((el) => [tabs, baseTabs, disclosures, insertedDisclosures, selects, checkables, switchPlan, notifyPlan, otps].some((plan) => plan.bind(el) !== undefined));
	let sceneCount = 0;
	for (const [route, p] of prepared) {
		const list = scenes.get(route) ?? [];
		const locate = list.length ? locator(p.root.parentNode as Element) : undefined;
		for (const { scene, listed } of list) {
			const region = locate!(scene.sig, scene.nth);
			if (region && scenePlan.add(scene, region, listed)) sceneCount++;
			else if (!region) log(`  recorded uses not played: ${scene.sig}#${scene.nth} is not on the converted page`);
		}
	}
	if (sceneCount) {
		log(`demos playing their recorded uses on Markless state: ${sceneCount}`);
		templatePorts.add('scene');
		templatePorts.add('form');
	}
	for (const why of scenePlan.refused) log(`  recorded uses not played: ${why}`);
	for (const [container, r] of replaced) {
		replacedParts.set(container, { append: r.markup });
		for (const child of childrenOf(container)) if (isElement(child)) replacedParts.set(child, mergeBindings(replacedParts.get(child), { extra: [`data-mm-before=${JSON.stringify(r.key)}`] })!);
		replacedParts.set(r.trigger, mergeBindings(replacedParts.get(r.trigger), { extra: [`data-mm-replace=${JSON.stringify(r.key)}`] })!);
	}
	const withAppend = (el: Element, binding: Binding | undefined): Binding | undefined => {
		const markup = appended.get(el);
		binding = mergeBindings(replacedParts.get(el), binding);
		const keyed = triggerKeys.get(el);
		binding = mergeBindings(binding, keyed ? { extra: [`data-mm-key=${JSON.stringify(keyed)}`] } : undefined);
		binding = mergeBindings(binding, portAttributes(el));
		binding = mergeBindings(binding, portFor(el) === 'shadcn/message-scroller' ? bindScroller(el) : undefined);
		const own = mergeBindings(scenePlan.bind(el), mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(tabs.bind(el), baseTabs.bind(el)), disclosures.bind(el)), insertedDisclosures.bind(el)), selects.bind(el)), checkables.bind(el)), switchPlan.bind(el)), mergeBindings(notifyPlan.bind(el), handledForms.has(el) ? formBinding : undefined)), mergeBindings(otps.bind(el), binding)), bindMount(el)));
		return markup ? mergeBindings(own, { append: markup }) : own;
	};
	void appendOf;
	const factored: Factored = factor(new Map([...prepared].map(([route, p]) => [route, p.root])), { bind: (el) => withAppend(el, bindParts(el, usedPorts)), extra: (el) => appended.get(el) ?? notifyPlan.nameOf(el) ?? scenePlan.nameOf(el) });
	const pathnames = [...new Set(htmlRoutes.map((r) => pathOf(r)))];
	const folders = folderSet(pathnames);
	const written = new Map<string, string>();
	const out: ConvertedRoute[] = [];
	const byFile = new Map<string, { route: string; search: string; markup: string; parts: PartUse[]; declarations: string[]; layers: readonly string[] }[]>();
	const noteDropped = (what: string) => dropped.set(`${what}: not writable as an attribute`, (dropped.get(`${what}: not writable as an attribute`) ?? 0) + 1);
	const layers = layerTable(new Map([...prepared].map(([route, p]) => [route, p.layers])));
	const bodyAfter = bodyAfterModule(bodyParts, (el) => bindParts(el, usedPorts), noteDropped, ownAfter.size > 0);
	for (const [route, p] of prepared) {
		const url = new URL(route, options.old);
		const file = route === NOT_FOUND ? 'pages/404.tsrx' : pageFile(url.pathname, folders);
		const parts: PartUse[] = [];
		const declarations: string[] = [];
		onRoute(route);
		const rootMarkup = emitElement(p.root, {
			declarations,
			bind: (el): Binding | undefined => {
				const own = factored.binding(route, el) ?? withAppend(el, bindParts(el, usedPorts));
				return el === p.root ? mergeBindings(own, { extra: [ROOT_HANDLERS] }) : own;
			},
			dropped: noteDropped,
		});
		// The layers only this page portals are the page's, beside its root at the end of the body, so its server code
		// carries only its own. Markless renders a fragment root of components only inside branches: both are arms of
		// a branch on a module constant, which never changes.
		const pageLayers = layers.own(route);
		let after = bodyAfter ? `<BodyAfter route={${lit(route)}} />` : '';
		const owned = ownAfter.get(route);
		if (bodyAfter && owned?.length) {
			let from = 0;
			after = '';
			for (const i of owned) {
				if (i > from) after += `<BodyAfter route={${lit(route)}} from={${from}} to={${i}} />`;
				after += emitElement(bodyParts.after[i]!.byRoute.get(route)!, { declarations, bind: (el) => mergeBindings(bindParts(el, usedPorts), notifyPlan.bind(el)), dropped: noteDropped });
				from = i + 1;
			}
			if (from < bodyParts.after.length) after += `<BodyAfter route={${lit(route)}} from={${from}} />`;
		}
		const extras = (ownExtras.get(route) ?? []).map((el) => emitElement(el, { declarations, bind: (x) => notifyPlan.bind(x), dropped: noteDropped })).join('');
		// A copy control's text rides in the page's HTML as the old page's props did (an attribute: template content must be literal).
		const copied = Object.entries(p.clipboard).map(([key, text]) => `<template data-mm-clipboard=${lit(key)} data-mm-text={${lit(text)}}></template>`).join('');
		const tail = `${after}${extras}${pageLayers.map((n) => `<${n} />`).join('')}${copied}`;
		const markup = tail ? `<>@if (${PAGE_SHOWN}) { ${rootMarkup} }@if (${PAGE_SHOWN}) { <>${tail}</> }</>` : rootMarkup;
		const list = byFile.get(file) ?? [];
		list.push({ route, search: url.search, markup, parts, declarations, layers: pageLayers });
		byFile.set(file, list);
	}
	const partsDir = (from: string) => relative(dirname(join(app, from)), join(app, 'lib', 'parts')).replace(/^(?!\.)/, './');
	for (const [file, variants] of byFile) {
		const imports = new Set<string>(["import type { PageProps } from '@markless/router';"]);
		for (const v of variants) for (const component of factored.used(v.route)) imports.add(`import ${component.name} from '${relative(dirname(join(app, file)), join(app, component.file)).replace(/^(?!\.)/, './')}';`);
		for (const v of variants) for (const part of v.parts) imports.add(part.import(partsDir(file)));
		if (bodyAfter) imports.add(`import BodyAfter from '${relative(dirname(join(app, file)), join(app, 'components', 'converted', 'body-after.tsrx')).replace(/^(?!\.)/, './')}';`);
		for (const v of variants) for (const name of v.layers) imports.add(`import ${name} from '${relative(dirname(join(app, file)), join(app, 'components', 'converted', 'layers', `${name.replace(/^Layer/, 'layer-')}.tsrx`)).replace(/^(?!\.)/, './')}';`);
		const base = variants.find((v) => v.search === '') ?? variants[0]!;
		const others = variants.filter((v) => v !== base);
		const pathExpr = lit(pathOf(base.route));
		let markup: string;
		if (!others.length) markup = `\t${base.markup}\n`;
		else {
			const arms = others.map((v) => `\t\t@case ${lit(v.search)}: {\n\t\t\t${v.markup}\n\t\t}`).join('\n');
			// A page whose root is a bare @switch builds but is no page module at request time; in a fragment it is.
			markup = `\t<>\n\t@switch (search) {\n${arms}\n\t\t@default: {\n\t\t\t${base.markup}\n\t\t}\n\t}\n\t</>\n`;
		}
		if (markup.includes(`(${PAGE_SHOWN})`)) imports.add(`const ${PAGE_SHOWN} = true;`);
		const usesPath = markup.includes('path={path}') || markup.includes('path ===');
		const declared = [...new Set(variants.flatMap((v) => v.declarations))];
		if (declared.length) imports.add("import { state } from '@markless/core';");
		const source = `${GENERATED} (${variants.map((v) => v.route).join(', ')})\n${[...imports].join('\n')}\n\nexport default function Page(${others.length ? '{ url }: PageProps' : '_props: PageProps'}) @{\n${usesPath ? `\tconst path = ${pathExpr};\n` : ''}${others.length ? '\tconst search = url.search;\n' : ''}${declared.map((d) => `\t${d}\n`).join('')}\n${markup}}\n`;
		written.set(file, source);
		for (const v of variants) out.push({ route: v.route, page: file, bytes: v.markup.length, parts: v.parts });
	}

	const siteParts = await stat(join(app, 'lib', 'site', 'parts.ts')).then(() => true, () => false);
	const handlers = bodyHandlers(usedPorts, siteParts).join(' ');
	for (const [file, source] of written) written.set(file, withPartImports(handlers ? source.replaceAll(ROOT_HANDLERS, handlers) : source.replaceAll(` ${ROOT_HANDLERS}`, ''), partsDir(file)));
	if (!options.only?.length) await rm(join(app, 'pages'), { recursive: true, force: true });
	await rm(join(app, 'components', 'converted'), { recursive: true, force: true });
	for (const [file, source] of written) {
		await mkdir(dirname(join(app, file)), { recursive: true });
		await writeFile(join(app, file), appUrlDeclaration(source));
	}
	for (const component of factored.components) {
		const imports = [...new Set(sharedParts.map((part) => part.import(partsDir(component.file))))].join('\n');
		await mkdir(dirname(join(app, component.file)), { recursive: true });
		await writeFile(join(app, component.file), appUrlDeclaration(withPartImports(imports ? component.source.replace('\n', `\n${imports}\n`) : component.source, partsDir(component.file))));
	}
	const documentParts: PartUse[] = [];
	// DocSearch's Ctrl key off Apple platforms is set before the first paint, as DocSearch's own button draws it.
	const headScripts = docsearchConfigured() ? ['PLATFORM_KEYS_SCRIPT'] : [];
	if (headScripts.length) usedPorts.add('docsearch');
	if (headScripts.length) documentParts.push({ part: 'docsearch', import: (dir) => `import { PLATFORM_KEYS_SCRIPT } from '${dir}/docsearch.ts';` });
	await writeFile(join(app, 'document.tsrx'), appUrlDeclaration(documentModule(bodyParts, (el) => bindParts(el, usedPorts), noteDropped, partsDir('document.tsrx'), documentParts, headScripts)));
	await writeFile(join(app, 'head.ts'), HEAD_HELPER);
	if (disclosureGroups || insertedGroups) usedPorts.add('panel-motion');
	await writeParts(app, usedPorts, choices);
	await mkdir(join(app, 'components', 'converted'), { recursive: true });
	await mkdir(join(app, 'components', 'converted', 'layers'), { recursive: true });
	for (const layer of layers.files) await writeFile(join(app, 'components', 'converted', layer.file), appUrlDeclaration(layer.source));
	await rm(join(app, 'public', '_converted', 'layers'), { recursive: true, force: true });
	for (const layer of layers.served) {
		await mkdir(dirname(join(app, 'public', layer.path)), { recursive: true });
		await writeFile(join(app, 'public', layer.path), layer.html);
	}
	await writeFile(join(app, 'components', 'converted', 'body-extras.tsrx'), appUrlDeclaration(extrasModule({ ...bodyParts, extras: new Map([...bodyParts.extras].filter(([route]) => !ownExtras.has(route))) }, noteDropped, layers)));
	if (bodyAfter) await writeFile(join(app, 'components', 'converted', 'body-after.tsrx'), appUrlDeclaration(bodyAfter));
	log(`layers: ${layers.files.length} distinct, each compiled once; ${layers.everywhere.length} on every page; ${layers.served.length} served as files and mounted on use`);
	await mkdir(join(app, 'lib', 'parts'), { recursive: true });
	await rm(join(app, 'lib', 'parts', 'clipboard'), { recursive: true, force: true });
	await rm(join(app, 'lib', 'parts', 'clipboard.ts'), { force: true });
	if (unplaced.length) log(`${unplaced.length} revealed contents not placed (no Markless state drives them yet): ${unplaced.slice(0, 3).join('; ')}`);
	await writeFile(join(app, 'heads.ts'), headModule(prepared));
	const publicDir = join(app, 'public');
	for (const [path, css] of styles) {
		await mkdir(dirname(join(publicDir, path)), { recursive: true });
		await writeFile(join(publicDir, path), css);
	}
	if (options.source) await copyStaticDir(join(options.source, 'public'), publicDir);
	const paths = new Set<string>();
	for (const p of prepared.values()) for (const path of p.resources) if (!path.startsWith('/_converted/')) paths.add(path);
	// Resources a query picks are served by the routing middleware from the old build's answers, not as files.
	const queried = [...paths].filter((p) => p.includes('?'));
	const assets = await copyAssets(options.old, [...paths].filter((p) => !p.includes('?')), publicDir, log);
	const endpoints: EndpointPort[] = [];
	if (options.source) {
		const scanned = await readSource(options.source);
		const handlerRoutes = scanned.routes.filter((r) => r.kind === 'endpoint' && r.file).map((r) => ({ route: r.path, file: r.file! }));
		const rewrites = (scanned.redirects ?? []).filter((r) => r.kind === 'rewrite' && r.to.startsWith('/'));
		const builtPaths = new Set<string>(queried);
		for (const e of handlerRoutes) {
			const pattern = nextPattern(e.file);
			if (!pattern.includes(':')) builtPaths.add(pattern);
			// An optional catch-all answers its bare path too (`/llm` for `/llm/:slug*`).
			const bare = pattern.replace(/\/:\w+\*$/, '') || '/';
			if (bare !== pattern && !bare.includes(':')) builtPaths.add(bare);
			for (const r of rewrites) {
				if (!match(pattern)(r.to.replace(/:\w+\*/g, 'a/b'))) continue;
				// Every page under the rewrite's source pattern: /docs/:path*.md takes each docs page.
				const prefix = r.from.split('/:')[0]!;
				for (const route of inventory.routes) {
					if (route.status !== 200 || !route.route.startsWith(`${prefix}/`) || route.route.includes('?')) continue;
					const rest = route.route.slice(prefix.length + 1);
					builtPaths.add(r.to.replace(/:\w+\*/, rest));
				}
			}
		}
		for (const route of inventory.routes) {
			if (route.status !== 200 || route.route.includes('?') || (route.contentType ?? 'text/html').includes('html')) continue;
			if (!(await stat(join(publicDir, route.route)).then((x) => x.isFile(), () => false))) builtPaths.add(route.route);
		}
		const routing = await writeRouting({ app, source: options.source, old: options.old, ...(options.fallthrough ? { fallthrough: options.fallthrough } : {}), pages: [...new Set(out.map((r) => new URL(r.route, options.old).pathname))], endpoints: handlerRoutes, redirects: scanned.redirects ?? [], builtPaths: [...builtPaths], log });
		endpoints.push(...routing.ports);
		const manifestPath = join(app, 'package.json');
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { dependencies?: Record<string, string>; overrides?: Record<string, unknown> };
		manifest.dependencies = { ...manifest.dependencies, ...routing.packages };
		if (Object.keys(routing.overrides).length) manifest.overrides = { ...manifest.overrides, ...routing.overrides };
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
		await writeFile(join(app, 'vite.config.ts'), viteConfig(Object.keys(routing.packages).filter((p) => p !== 'path-to-regexp').sort()));
	}
	const report: ConvertReport = {
		routes: out,
		dropped: Object.fromEntries(dropped),
		shared: factored.components.map((c) => ({ component: c.file, pages: c.pages, bytes: c.source.length })),
		assets: { copied: assets.copied.length, missing: assets.missing },
		styles: styles.size,
		unconverted,
		endpoints,
		unported: [...UNPORTED].map(([part, routes]) => ({ part, routes: routes.size })).sort((a, b) => b.routes - a.routes),
	};
	await writeFile(join(state, 'convert', 'report.json'), JSON.stringify(report, null, '\t'));
	return report;
}

/** The report's few lines a person reads: pages written, what was left out, endpoints, and the parts still to port. */
export function summarizeConvert(report: ConvertReport): string {
	const lines = [`Converted ${report.routes.length} routes into ${new Set(report.routes.map((r) => r.page)).size} pages, ${report.shared.length} shared components; ${report.assets.copied} assets copied byte for byte${report.assets.missing.length ? ` (${report.assets.missing.length} not answered by the old site)` : ''}.`];
	const dropped = Object.entries(report.dropped).sort((a, b) => b[1] - a[1]);
	if (dropped.length) lines.push('Left out of the pages (the old framework\'s own):', ...dropped.slice(0, 8).map(([what, n]) => `  ${n} x ${what}`));
	for (const e of report.endpoints) lines.push(`  endpoint ${e.route}: ${e.how === 'handler' ? 'ported' : e.how === 'prerendered' ? 'ported, run at convert time' : e.how === 'build' ? 'NOT PORTED, served from the old build' : 'missing'} (${e.reason})`);
	if (report.unported.length) lines.push(`Library parts no port implements yet (${report.unported.length}):`, ...report.unported.slice(0, 12).map((u) => `  ${u.part}: ${u.routes} routes`));
	for (const u of report.unconverted) lines.push(`  not converted ${u.route}: ${u.reason}`);
	return `${lines.join('\n')}\n`;
}
