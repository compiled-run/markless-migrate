import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { chromium } from 'playwright';
import { copyAssets, copyStaticDir, resourcePaths } from './assets.ts';
import { captureAll, type CapturedPage, type CapturedRef } from './capture.ts';
import { atRest } from './at-rest.ts';
import { captureAllReveals, captureRacComboInputs, captureRacHovers, captureRacSubmenus, captureRadixSubmenus, type Reveal } from './reveal.ts';
import { captureChoices, type Choice } from './choices.ts';
import { parseFragment, serialize } from 'parse5';
import { cleanDocument, frameworkBuilds, lateHead, type Dropped } from './clean.ts';
import { attr, body, childrenOf, elementChildren, head, html, isElement, outer, parseDocument, textContent, walk, type Document, type Element } from './dom.ts';
import { factor, GENERATED_ID, type Factored } from './factor.ts';
import { BaseTabsPlan, CheckablePlan, RacTablePlan, DisclosurePlan, radixDisclosurePanel, InsertedDisclosurePlan, NotifyPlan, SelectPlan, SwitchPlan, TabsPlan } from './stateful.ts';
import { captureCharts, CHART_CSS, ChartPlan, MOTION_FILE, type ChartFacts } from './charts.ts';
import { captureScenes, type Scene } from './scenes.ts';
import { ScenePlan } from './scene-plan.ts';
import { bindScroller, captureScrollers, useScrollerOpenings, type ScrollerOpening } from './scrollers.ts';
import { captureAccordions, captureCarousels, restCarousel, captureComboboxEmpties, captureRacEmpties, type ComboboxEmpty, type EmptyReach, captureHoverDelays, captureAllForms, captureAllSwitches, captureAllToggles, captureNotifications, type AccordionMode, type CarouselFacts, type FormCapture, type HoverDelay, type Notify, type Switch, type ToggleGroup } from './toggles.ts';
import { bindMount, bindParts, bodyHandlers, candidatesOf, docsearchConfigured, docsearchShell, useDocSearch, handledBy, portAttributes, portFor, onRoute, renamedFrom, UNPORTED, useMeasuredProps, useMounts, useResolver, writeParts, type PartUse } from './parts.ts';
import { sourceSlotResolver, usageResolver, type PartResolver } from './usage.ts';
import { captureDayPickers, CONFIG_PREFIX, CONFIGS_MODULE, DayPickerPlan, type CapturedPickers } from './day-picker.ts';
import { captureRacCalendars, RAC_CONFIG_PREFIX, RAC_CONFIGS_MODULE, racCalendarMessages, RacCalendarPlan, type CapturedCalendars } from './rac-calendar.ts';
import type { CalendarMessages } from '../../parts/react-aria/calendar.ts';
import { stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { nextImageWidths, pairImages, planImages, type ImagePlan, type Optimizer } from './images.ts';
import { nextThemesOptions, themeToggleOf } from './theme.ts';
import { applyLateFonts, fontPreloads } from './fonts.ts';
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
	const dayPicker = ['dayPickerView', 'dayPickerModel', 'dayPickerEvent', 'dayPickerWake', 'dayPickerSet', 'dayPickerLabel', 'dayPickerClose'].filter((name) => new RegExp(`\\b${name}\\(`).test(out));
	const sharedPickers = [...new Set(out.match(/\bdpShared\d+(?=\(\))/g) ?? [])];
	if (sharedPickers.length) out = out.replace('\n', `\nimport { ${sharedPickers.join(', ')} } from '${dir}/../../components/converted/day-pickers.tsrx';\n`);
	if (dayPicker.length) out = out.replace('\n', `\nimport { computed } from '@markless/core';\nimport { ${dayPicker.join(', ')} } from '${dir}/day-picker.ts';\n`);
	const configs = [...new Set(out.match(new RegExp(`\\b${CONFIG_PREFIX}[0-9a-f]{10}\\b`, 'g')) ?? [])];
	if (configs.length) out = out.replace('\n', `\nimport { ${configs.join(', ')} } from '${dir}/${CONFIGS_MODULE.replace(/\.ts$/, '')}.ts';\n`);
	const racCalendar = ['racCalendarView', 'racCalendarModel', 'racCalendarEvent', 'racCalendarWake', 'racDateLabel'].filter((name) => new RegExp(`\\b${name}\\(`).test(out));
	if (racCalendar.length) out = out.replace('\n', `\n${dayPicker.length ? '' : "import { computed } from '@markless/core';\n"}import { ${racCalendar.join(', ')} } from '${dir}/react-aria/calendar.ts';\n`);
	const racConfigs = [...new Set(out.match(new RegExp(`\\b${RAC_CONFIG_PREFIX}[0-9a-f]{10}\\b`, 'g')) ?? [])];
	if (racConfigs.length) out = out.replace('\n', `\nimport { ${racConfigs.join(', ')} } from '${dir}/${RAC_CONFIGS_MODULE.replace(/\.ts$/, '')}.ts';\n`);
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
// Tabs that render only the chosen panel: Base UI's, and React Aria's (whose markup carries data-rac).
const isBaseTab = (el: Element) => attr(el, 'role') === 'tab' && (/^base-ui-/.test(attr(el, 'id') ?? '') || attr(el, 'data-rac') !== undefined);
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
			if ((attr(el, 'data-trigger') !== undefined || attr(el, 'role') === 'tooltip') && attr(el, 'data-rac') !== undefined) return racPlacement(el, placementResolver);
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

// React Aria's Popover and Tooltip: the side is the content's own data-placement; the alignment along it is where the
// trigger's anchor point sat (--trigger-anchor-point: at the start, the middle or the end of --trigger-width); the
// offsets are the source's where it renders the part with this element's data-slot.
function racPlacement(el: Element, resolver: PartResolver): string {
	const style = attr(el, 'style') ?? '';
	const side = attr(el, 'data-placement') ?? 'bottom';
	const [x = 0, y = 0] = (/--trigger-anchor-point:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(style) ?? []).slice(1).map(Number);
	const width = Number(/--trigger-width:\s*([\d.]+)px/.exec(style)?.[1] ?? NaN);
	const along = side === 'top' || side === 'bottom' ? (Math.abs(x) < 1 ? ' left' : !Number.isNaN(width) && Math.abs(x - width / 2) < 1 ? '' : !Number.isNaN(width) && Math.abs(x - width) < 1 ? ' right' : '') : Math.abs(y) < 1 ? ' top' : '';
	const slot = attr(el, 'data-slot');
	const own = candidatesOf(el, resolver).filter((c) => c.library === 'react-aria-components');
	const read = (prop: string) => {
		for (const c of own) {
			const value = (slot ? resolver.slotProp?.(c.library, c.export, slot, prop) : undefined) ?? resolver.prop(c.library, c.export, prop);
			if (value !== undefined && /^-?\d+(\.\d+)?$/.test(value)) return value;
		}
		return undefined;
	};
	const offset = read('offset');
	const cross = read('crossOffset');
	return ` data-mm-placement="${side}${along}"${offset !== undefined ? ` data-mm-offset="${offset}"` : ''}${cross !== undefined ? ` data-mm-cross-offset="${cross}"` : ''}`;
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
let currentLayers: { key: string; markup: string; shell: string; fill: string; declare?: readonly string[] }[] = [];
let currentRoute = '';
let layerPickers: ((route: string, reveal: Reveal, kept: readonly Element[]) => { readonly bind: (el: Element) => Binding | undefined; readonly declare: readonly string[] } | undefined) | undefined;
// The React Aria calendars the popovers of the route being prepared show (convert's RacCalendarPlan, set per route).
let racLayer: { readonly plan: RacCalendarPlan; readonly captured: ReadonlyMap<string, CapturedCalendars>; readonly messages: (locale: string) => CalendarMessages | undefined; route: string } | undefined;
// What the old page's copy controls wrote, by the control's signature and occurrence.
let currentClipboard: Record<string, string> = {};
// Routes with a block that waits for the load event to render (its web font is fetched after the load).
const lateFontPages = new Set<string>();
let fontPreloadCount = 0;
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

/**
 * Base UI Combobox mounts an item's indicator only while it is selected: every other item of a captured list gets a
 * hidden copy of a selected one's, so choosing one only switches `hidden`.
 */
function comboboxIndicators(top: Element): void {
	for (const list of [top, ...walkAll(top)]) {
		if (attr(list, 'data-slot') !== 'combobox-list') continue;
		const items = walkAll(list).filter((o) => attr(o, 'role') === 'option');
		const indicatorOf = (o: Element) => elementChildren(o).find((c) => c.tagName === 'span' && attr(c, 'aria-hidden') === 'true');
		const template = items.map(indicatorOf).find((i) => i !== undefined);
		if (!template) continue;
		for (const o of items) {
			const own = indicatorOf(o);
			if (own) {
				own.attrs = [...own.attrs.filter((a) => a.name !== 'data-mm-indicator'), { name: 'data-mm-indicator', value: '' }];
				continue;
			}
			const copy = parseFragment(outer(template)).childNodes[0] as unknown as Element;
			copy.attrs = [...copy.attrs.filter((a) => a.name !== 'data-selected' && a.name !== 'hidden' && a.name !== 'data-mm-indicator'), { name: 'hidden', value: '' }, { name: 'data-mm-indicator', value: '' }];
			copy.parentNode = o as never;
			o.childNodes.push(copy as never);
		}
	}
}

const textNodes = (el: Element) => el.childNodes.filter((n) => n.nodeName === '#text') as unknown as { value: string }[];

/**
 * Base UI Combobox with several values shows a chip per chosen item, mounted as it is chosen: the chips container gets a
 * hidden chip for every item of the list its input opens (from the old page's own chip), named by the item's text
 * (data-mm-chip), so choosing and removing only switch `hidden`.
 */
function comboboxChips(doc: Document, reveals: readonly Reveal[]): void {
	for (const chips of walk(body(doc))) {
		if (attr(chips, 'data-slot') !== 'combobox-chips') continue;
		const input = walkAll(chips).find((e) => attr(e, 'role') === 'combobox');
		const reveal = input && reveals.find((r) => r.key === attr(input, 'id'));
		const own = elementChildren(chips).filter((c) => attr(c, 'data-slot') === 'combobox-chip');
		const template = own[0];
		if (!reveal || !template) continue;
		const named = (chip: Element) => textNodes(chip).map((t) => t.value).join('').trim();
		const options = new Set<string>();
		for (const a of reveal.added) for (const o of walkAll(parseFragment(a.html) as unknown as Element)) if (attr(o, 'role') === 'option') options.add(textOf(o).trim());
		const shown = new Set(own.map(named));
		for (const chip of own) chip.attrs = [...chip.attrs.filter((a) => a.name !== 'data-mm-chip'), { name: 'data-mm-chip', value: named(chip) }];
		let after = own[own.length - 1]!;
		for (const text of options) {
			if (shown.has(text)) continue;
			const copy = parseFragment(outer(template)).childNodes[0] as unknown as Element;
			const first = textNodes(copy)[0];
			if (!first) continue;
			first.value = text;
			copy.attrs = [...copy.attrs.filter((a) => a.name !== 'data-mm-chip' && a.name !== 'hidden'), { name: 'hidden', value: '' }, { name: 'data-mm-chip', value: text }];
			copy.parentNode = chips as never;
			chips.childNodes.splice(chips.childNodes.indexOf(after as never) + 1, 0, copy as never);
			after = copy;
		}
	}
}

// React Aria renders a selectable item's check only while it is selected: a listbox option's in its last span, a
// menu checkbox or radio item's in its *-indicator span. Each empty one gets a hidden copy of a selected sibling's, so
// the port only shows it (data-mm-indicator) when the item is chosen.
function racIndicators(top: Element): void {
	for (const collection of [top, ...walkAll(top)]) {
		const role = attr(collection, 'role');
		if ((role !== 'listbox' && role !== 'menu') || attr(collection, 'data-rac') === undefined) continue;
		const kinds = role === 'listbox' ? ['option'] : ['menuitemcheckbox', 'menuitemradio'];
		for (const kind of kinds) {
			const items = walkAll(collection).filter((o) => attr(o, 'role') === kind);
			const holder = (o: Element) => {
				const spans = elementChildren(o).filter((c) => c.tagName === 'span');
				return role === 'listbox' ? spans[spans.length - 1] : spans.find((c) => /-indicator$/.test(attr(c, 'data-slot') ?? ''));
			};
			const on = (o: Element) => (role === 'listbox' ? attr(o, 'aria-selected') === 'true' : attr(o, 'aria-checked') === 'true');
			const checked = items.find((o) => on(o) && holder(o) && elementChildren(holder(o)!).length);
			const indicator = checked && elementChildren(holder(checked)!)[0];
			if (!indicator) continue;
			const mark = (el: Element) => {
				if (attr(el, 'data-mm-indicator') === undefined) el.attrs = [...el.attrs, { name: 'data-mm-indicator', value: '' }];
			};
			const html = outer(indicator);
			for (const o of items) {
				const h = holder(o);
				if (!h) continue;
				if (on(o)) {
					for (const c of elementChildren(h)) mark(c);
					continue;
				}
				if (elementChildren(h).length) continue;
				const copy = parseFragment(html).childNodes[0] as unknown as Element;
				mark(copy);
				copy.attrs = [...copy.attrs.filter((a) => a.name !== 'hidden'), { name: 'hidden', value: '' }];
				copy.parentNode = h as never;
				h.childNodes.push(copy as never);
			}
		}
	}
}

/** A portal's nodes in their closed state: data-state="closed", data-closed for data-open, hidden, and the control's key. */
/** A React Aria listbox's markup with what it renders when empty appended, hidden and marked data-mm-empty. */
function withEmptyState(html: string, empty: string): string {
	const frag = parseFragment(html) as unknown as Element;
	const listbox = [...walk(frag)].find((e) => (attr(e, 'role') === 'listbox' || attr(e, 'role') === 'menu') && attr(e, 'data-rac') !== undefined);
	if (!listbox) return html;
	appendEmptyState(listbox, empty);
	return serialize(frag as never);
}

/** Appends what a React Aria collection renders when empty, hidden and marked data-mm-empty. */
function appendEmptyState(collection: Element, empty: string): void {
	if (childrenOf(collection).some((c) => isElement(c) && attr(c, 'data-mm-empty') !== undefined)) return;
	for (const node of childrenOf(parseFragment(empty) as unknown as Element).filter(isElement)) {
		node.attrs = [...node.attrs.filter((a) => a.name !== 'hidden'), { name: 'hidden', value: '' }, { name: 'data-mm-empty', value: '' }];
		node.parentNode = collection as never;
		collection.childNodes.push(node as never);
	}
}

/**
 * A multiple-selection React Aria ComboBox's chips (a TagGroup of what is chosen): one per option, in the options'
 * order, those not chosen hidden, so choosing shows a chip rather than inserting one. New chips copy the first.
 */
function racChips(page: Element, reveal: Reveal): void {
	const html = reveal.added.find((a) => a.html.includes('data-trigger="ComboBox"') && a.html.includes('aria-multiselectable="true"'))?.html;
	const input = html && locator(page)(reveal.sig!, reveal.nth ?? 0);
	if (!input || input.tagName !== 'input') return;
	const options = [...walk(parseFragment(html) as unknown as Element)].filter((e) => attr(e, 'role') === 'option' && attr(e, 'data-key') !== undefined).map((o) => ({ key: attr(o, 'data-key')!, text: textOf(o).trim() }));
	let scope = input.parentNode as Element | undefined;
	let grid: Element | undefined;
	for (; scope && isElement(scope as never) && !grid; scope = scope.parentNode as Element | undefined) grid = [...walk(scope)].find((e) => attr(e, 'role') === 'grid' && attr(e, 'data-rac') !== undefined);
	if (!grid || !options.length) return;
	const chips = elementChildren(grid).filter((e) => attr(e, 'role') === 'row');
	const model = chips[0];
	if (!model || chips.some((c) => !options.some((o) => o.key === attr(c, 'data-key')))) return;
	const modelKey = attr(model, 'data-key')!;
	const modelText = options.find((o) => o.key === modelKey)!.text;
	const rows = options.map((o, i) => {
		const own = chips.find((c) => attr(c, 'data-key') === o.key);
		if (own) return own;
		const copy = childrenOf(parseFragment(outer(model)) as unknown as Element).find(isElement)!;
		for (const el of [copy, ...walkAll(copy)]) {
			el.attrs = el.attrs.map((a) => (a.name === 'data-key' ? { ...a, value: o.key } : a.name === 'id' || a.name === 'aria-labelledby' ? { ...a, value: a.value.split(/(\s+)/).map((t) => (t.trim() ? `${t}-${i}` : t)).join('') } : a));
			for (const c of childrenOf(el)) if (c.nodeName === '#text' && (c as unknown as { value: string }).value.trim() === modelText) (c as unknown as { value: string }).value = (c as unknown as { value: string }).value.replace(modelText, o.text);
		}
		copy.attrs = [...copy.attrs, { name: 'hidden', value: '' }];
		return copy;
	});
	const others = childrenOf(grid).filter((c) => !(isElement(c) && attr(c, 'role') === 'row'));
	grid.childNodes = [...others, ...rows].map((n) => ((n as { parentNode: unknown }).parentNode = grid, n)) as never;
}

// What each page's React Aria Autocomplete collections show once nothing matches, by the input's signature.
const racPageEmpties = new Map<string, readonly ComboboxEmpty[]>();

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
function layerMarkup(reveal: Reveal, added: Reveal['added'][number], dropped: (what: string) => void, rename: ReadonlyMap<string, string> = new Map(), kept: Element[] = layerElements(added)): { markup: string; shell: string; fill: string; declare: string[] } {
	// A calendar in the layer is bound on the view its opener shares (DayPickerPlan.layer): read before ids are renamed.
	const pickers = layerPickers?.(currentRoute, reveal, kept);
	const placed = placement(kept);
	for (const top of kept) renameIds([top, ...walkAll(top)], rename);
	const key = rename.get(reveal.key) ?? reveal.key;
	const extra = placed ? placed.trim().split(/\s+(?=data-)/) : [];
	for (const top of kept) {
		for (const el of [top, ...walkAll(top)]) atRest(el);
		selectIndicators(top);
		comboboxIndicators(top);
		racIndicators(top);
		top.attrs = [...top.attrs.filter((a) => a.name !== 'hidden'), { name: 'hidden', value: '' }, { name: 'data-mm-layer', value: key }, ...(reveal.viewport !== 'desktop' ? [{ name: 'data-mm-viewport', value: reveal.viewport }] : [])];
	}
	// A calendar the popover shows is Markless state of the layer's own component, which is then never a served file.
	const captured = racLayer && reveal.sig ? racLayer.captured.get(racLayer.route) : undefined;
	if (racLayer && captured && reveal.sig && racLayer.plan.addLayer(racLayer.route, captured, racLayer.messages, { sig: reveal.sig, nth: reveal.nth ?? 0 }, kept)) templatePorts.add('react-aria/calendar');
	const declarations: string[] = [];
	const hollow = hollowOf(kept);
	const emit = (shell: boolean) =>
		kept
			.map((top) =>
				emitElement(top, {
					dropped,
					declarations,
					bind: (x) => {
						const own = mergeBindings(racLayer?.plan.bind(x), mergeBindings(x === top ? mergeBindings(bindParts(x, templatePorts), extra.length ? { extra } : undefined) : bindParts(x, templatePorts), pickers?.bind(x)));
						return shell && x === hollow ? mergeBindings(own, { children: '', extra: [`data-mm-layer-fill="${LAYER_FILL}"`] }) : own;
					},
				}),
			)
			.join('');
	const markup = emit(false);
	if (declarations.length) return { markup, shell: '', fill: '', declare: declarations };
	// The shell goes into a <template>, whose content Markless never resumes: its origin is the token, like the file's.
	return { markup, shell: withOriginToken(() => emit(true)), fill: hollow ? emitHtmlChildren(hollow) : '', declare: declarations };
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
		slotProp: (library, exportName, slot, prop) => first.slotProp?.(library, exportName, slot, prop) ?? then.slotProp?.(library, exportName, slot, prop),
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
	const companions: { parent: Element; before: Element | null; kept: Element[]; key: string }[] = [];
	for (const reveal of reveals) {
		const atPath = elementAt(root, reveal.path);
		const trigger = reveal.sig !== undefined && (!atPath || sigOf(atPath) !== reveal.sig) ? (bySig.get(reveal.sig)?.[reveal.nth ?? 0] ?? atPath) : atPath;
		const controlled = trigger ? byId.get(attr(trigger, 'aria-controls') ?? '') : undefined;
		const panel = trigger && (isRadixTab(trigger) || isRadixDisclosure(trigger) || (controlled && attr(trigger, 'aria-expanded') !== undefined && radixDisclosurePanel(controlled))) ? controlled : undefined;
		if (trigger && isBaseTab(trigger)) {
			const shown = reveal.added.filter((a) => typeof a.into !== 'string').flatMap((a) => childrenOf(parseFragment(a.html) as unknown as Element).filter(isElement)).find((e) => attr(e, 'role') === 'tabpanel');
			if (shown) basePanels.set(trigger, { attrs: Object.fromEntries(shown.attrs.map((a) => [a.name, a.value])), inner: childrenOf(shown).map((n) => outer(n)).join('') });
			continue;
		}
		if (panel) {
			// Only what went into this panel: a tab that also switches its page's other lists (shadcn's package manager
			// choice) fills their panels in the same use.
			const markup = reveal.added
				.filter((a) => typeof a.into !== 'string' && elementAt(root, a.into) === panel)
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
				// One swap per control: a control captured twice (two passes, two keys) keeps the first.
				if (container && trigger && ![...replaced.values()].some((r) => r.trigger === trigger) && !replaced.has(container)) {
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
				// Radix NavigationMenu mounts its viewport, with the trigger's content, beside the list: a layer of the trigger's.
				const menu = trigger !== undefined && attr(trigger, 'data-slot') === 'navigation-menu-trigger';
				const inPlace = !menu && attr(trigger ?? ({ attrs: [] } as unknown as Element), 'data-slot') !== 'scroll-area' && trigger && parent && attr(trigger, 'aria-expanded') === 'false' && attr(trigger, 'aria-haspopup') === undefined && !reveal.added.some((a) => a.into === 'body');
				const panel = panelOf(kept, attr(trigger!, 'aria-controls'));
				if (inPlace) inserted.push({ trigger: trigger!, parent: parent!, before: added.before >= 0 ? (elementChildren(parent!)[added.before] ?? null) : null, markup: kept.map((e) => emitElement(e, { dropped, bind: (x) => bindParts(x, templatePorts) })).join(''), ...panel });
				// What opening a layer also puts beside its trigger (Base UI's visually hidden Dismiss button): rendered hidden
				// there, shown with the layer (data-mm-shown-with names the trigger's key).
				else if (trigger && parent && (menu || attr(trigger, 'aria-haspopup') !== undefined || attr(trigger, 'data-slot') === 'scroll-area')) companions.push({ parent, before: added.before >= 0 ? (elementChildren(parent)[added.before] ?? null) : null, kept, key: reveal.key });
				else unplaced.push(`${reveal.key}: content shown inside the page by a control no Markless state drives yet`);
			}
		}
	}
	const placedWith = new Set<string>();
	for (const c of companions) {
		const at = `${c.key}|${outer(c.kept[0]!)}`;
		if (placedWith.has(at)) continue;
		placedWith.add(at);
		const index = c.before ? c.parent.childNodes.indexOf(c.before as never) : c.parent.childNodes.length;
		const nodes = c.kept.map((e) => {
			e.attrs = [...e.attrs.filter((a) => a.name !== 'hidden' && a.name !== 'data-mm-shown-with'), { name: 'hidden', value: '' }, { name: 'data-mm-shown-with', value: c.key }];
			e.parentNode = c.parent as never;
			return e;
		});
		c.parent.childNodes.splice(index < 0 ? c.parent.childNodes.length : index, 0, ...(nodes as never[]));
	}
	// Layers last: their generated ids are renamed from their content, here and wherever the page names them.
	// Two triggers the old page gave one id (shadcn's React Aria date pickers): each later one takes the id its key names, or both would open one layer.
	for (const l of pendingLayers) {
		const id = l.trigger && attr(l.trigger, 'id');
		if (!id || id === l.reveal.key || !l.reveal.key.startsWith(`${id}-`) || !/^\d+$/.test(l.reveal.key.slice(id.length + 1))) continue;
		l.trigger!.attrs = l.trigger!.attrs.map((a) => (a.name === 'id' ? { ...a, value: l.reveal.key } : a));
		for (const top of l.kept) for (const el of [top, ...walkAll(top)]) el.attrs = el.attrs.map((a) => (/^aria-(labelledby|describedby)$/.test(a.name) ? { ...a, value: a.value.split(/(\s+)/).map((t) => (t === id ? l.reveal.key : t)).join('') } : a));
	}
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
		const { markup, shell, fill, declare } = layerMarkup(l.reveal, l.added, dropped, rename, l.kept);
		const key = rename.get(l.reveal.key) ?? l.reveal.key;
		if (markup) currentLayers.push({ key, markup, shell, fill, ...(declare.length ? { declare } : {}) });
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

function prepare(capture: CapturedPage, reveals: readonly Reveal[], origin: string, dropped: Dropped, styles: Map<string, string>, optimizer: Optimizer | undefined, images: ImagePlan): Prepared {
	currentRoute = capture.route;
	const builds = frameworkBuilds(capture.server).map((b) => b.path);
	const ctx = { builds, frameworkScripts: new Set<string>(), origin };
	const doc = parseDocument(capture.settled.desktop ?? Object.values(capture.settled)[0] ?? capture.server);
	const paired = pairImages(doc, capture.images);
	currentLayers = [];
	currentClipboard = {};
	comboboxChips(doc, reveals);
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
	if (applyLateFonts(doc, (capture.lateFonts ?? []).map((f) => f.id))) lateFontPages.add(capture.route);
	const plan = planImages(doc, paired, optimizer, dropped);
	for (const k of Object.keys(plan) as (keyof ImagePlan)[]) images[k] += plan[k];
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
	// The first screen's web fonts are fetched with the stylesheet, not after it: preloaded right after the charset.
	const preloaded = tags.filter((t) => t.tag === 'link' && /\bpreload\b/.test(t.attrs.rel ?? '') && t.attrs.as === 'font').length;
	const fonts = fontPreloads(capture.firstScreenFonts ?? [], origin, preloaded).map((f): HeadTag => ({ tag: 'link', attrs: { rel: 'preload', href: f.href, as: 'font', type: 'font/woff2', crossorigin: '' } }));
	if (fonts.length) {
		tags.splice(tags.findIndex((t) => t.tag === 'meta' && t.attrs.charset !== undefined) + 1, 0, ...fonts);
		fontPreloadCount += fonts.length;
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
	const carouselFacts = new Map<string, readonly CarouselFacts[]>();
	const chartFacts = new Map<string, readonly ChartFacts[]>();
	const chartRoutes: string[] = [];
	const scrollerOpenings = new Map<string, readonly ScrollerOpening[]>();
	const scenes = new Map<string, { scene: Scene; listed: string }[]>();
	const pickers = new Map<string, CapturedPickers>();
	const racCalendarsRead = new Map<string, CapturedCalendars>();
	const choices: Record<string, Record<string, Choice>> = {};
	try {
		// The old site's not-found page, from a path no route has: the new app's 404 page.
		captures = await captureAll(browser, options.old, options.only?.length ? routes : [...routes, NOT_FOUND], join(state, 'convert', 'captures'), { concurrency: options.concurrency ?? 4, log });
		// Controls the site's own components reveal content with, beside those ARIA marks (lib/site/controls.json).
		const listed = await readFile(join(app, 'lib', 'site', 'controls.json'), 'utf8').then((t) => JSON.parse(t) as { selector: string; action: Reveal['action'] | 'toggle' | 'notify' | 'play' | 'open' | 'theme'; routes?: string }[], () => []);
		const extra = listed.flatMap((c) => (c.action === 'toggle' || c.action === 'notify' || c.action === 'play' || c.action === 'open' || c.action === 'theme' ? [] : [[c.selector, c.action] as const]));
		// Controls the site lists as opening a layer no ARIA marks (a button whose click sets a dialog's open state).
		const opens = listed.filter((c) => c.action === 'open').map((c) => ({ selector: c.selector, routes: c.routes }));
		// Controls whose use the demo's own state answers (Send, Replay, Show more): every use recorded frame by frame.
		for (const c of listed.filter((x) => x.action === 'play'))
			for (const r of routes.filter((x) => !c.routes || new RegExp(c.routes).test(x))) scenes.set(r, [...(scenes.get(r) ?? []), ...(await captureScenes(browser, options.old, r, join(state, 'convert', 'scenes'), c.selector)).scenes.map((scene) => ({ scene, listed: c.selector }))]);
		// Controls whose use shows a notification (a toast), on the routes the site lists them for.
		for (const c of listed.filter((x) => x.action === 'notify')) {
			const on = routes.filter((r) => !c.routes || new RegExp(c.routes).test(r));
			for (const r of on) notified.set(r, [...(notified.get(r) ?? []), ...(await captureNotifications(browser, options.old, r, join(state, 'convert', 'toggles'), [c.selector])).notifications]);
		}
		// A control a demo's recorded uses play is the scene's, not a disclosure's: its reveal is not planned.
		const played = (route: string) => new Set((scenes.get(route) ?? []).flatMap(({ scene }) => scene.edges.map((e) => e.control.replace(/#\d+$/, ''))));
		if (options.reveal !== false) for (const r of await captureAllReveals(browser, options.old, routes, join(state, 'convert', 'reveals'), { concurrency: options.concurrency ?? 4, log, extra, opens })) revealed.set(r.route, r.reveals.filter((reveal) => !reveal.sig || !played(r.route).has(reveal.sig)));
		// React Aria tooltips and previews, on the pages whose server HTML has React Aria controls.
		if (options.reveal !== false) {
			const queue = [...captures];
			const worker = async () => {
				for (let c = queue.shift(); c; c = queue.shift()) {
					if (!(await c.load()).server.includes('data-react-aria-pressable')) continue;
					const route = c.route;
					const hovers = [...(await captureRacHovers(browser, options.old, route, join(state, 'convert', 'reveals'))), ...((await c.load()).server.includes('role="combobox"') ? await captureRacComboInputs(browser, options.old, route, join(state, 'convert', 'reveals')) : [])];
					const own = revealed.get(route) ?? [];
					const added = hovers.filter((h) => !own.some((r) => r.key === h.key));
					if (added.length) revealed.set(route, [...own, ...added]);
				}
			};
			await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
		}
		// React Aria and Radix submenus, on the routes where a revealed menu has an item that opens one.
		if (options.reveal !== false)
			for (const [route, reveals] of [...revealed]) {
				const submenus = await captureRacSubmenus(browser, options.old, route, join(state, 'convert', 'reveals'), reveals);
				// Radix's: the menus they open from come back with their sub-triggers keyed, in place of the menus' own reveals.
				const radix = await captureRadixSubmenus(browser, options.old, route, join(state, 'convert', 'reveals'), reveals);
				const same = (a: Reveal, b: Reveal) => a.key === b.key && a.action === b.action && a.viewport === b.viewport && a.path.join('.') === b.path.join('.');
				const all = [...reveals.map((r) => radix.find((m) => same(m, r)) ?? r), ...[...submenus, ...radix].filter((s) => !reveals.some((r) => same(r, s) || r.key === s.key))];
				if (all.length !== reveals.length || radix.length) revealed.set(route, all);
			}
		// What each Base UI combobox shows once nothing matches, into the empty element of the layer it opens.
		for (const [route, reveals] of revealed) {
			const empty = /(<div\b[^>]*\bdata-slot="combobox-empty"[^>]*>)(<\/div>)/;
			const controls = reveals.filter((r) => r.sig && r.added.some((a) => empty.test(a.html))).map((r) => ({ sig: r.sig!, nth: r.nth ?? 0 }));
			if (!controls.length) continue;
			const found = (await captureComboboxEmpties(browser, options.old, route, join(state, 'convert', 'toggles'), controls)).empties;
			revealed.set(route, reveals.map((r) => {
				const html = found.find((f) => f.sig === r.sig && f.nth === (r.nth ?? 0))?.html;
				return html ? { ...r, added: r.added.map((a) => ({ ...a, html: a.html.replace(empty, (_, open: string, close: string) => `${open}${html}${close}`) })) } : r;
			}));
		}
		// What each React Aria collection an input filters shows once nothing matches: a ComboBox's listbox and an
		// Autocomplete's in a layer, hidden at the end of the layer's collection; an Autocomplete's in the page, likewise there.
		if (options.reveal !== false)
			for (const c of captures) {
				if (!c || c.status !== 200) continue;
				const route = c.route;
				const reveals = revealed.get(route) ?? [];
				const reachOf = (r: Reveal): EmptyReach | undefined => (!r.sig ? undefined : r.added.some((a) => a.html.includes('data-trigger="ComboBox"')) ? 'beside' : r.added.some((a) => /<input\b(?=[^>]*\bdata-rac\b)(?=[^>]*aria-autocomplete="list")(?![^>]*role="combobox")/.test(a.html)) ? 'opens' : undefined);
				const fromLayers = reveals.flatMap((r) => (reachOf(r) ? [{ sig: r.sig!, nth: r.nth ?? 0, reach: reachOf(r)! }] : []));
				const settled = (await c.load()).settled.desktop ?? Object.values((await c.load()).settled)[0] ?? '';
				const inPage: { sig: string; nth: number; reach: EmptyReach }[] = [];
				if (settled.includes('aria-autocomplete="list"')) {
					const counts = new Map<string, number>();
					const visit = (el: Element) => {
						for (const child of childrenOf(el)) {
							if (!isElement(child) || child.tagName === 'template') continue;
							const sig = sigOf(child);
							const n = counts.get(sig) ?? 0;
							counts.set(sig, n + 1);
							if (child.tagName === 'input' && attr(child, 'data-rac') !== undefined && attr(child, 'aria-autocomplete') === 'list' && attr(child, 'role') !== 'combobox' && attr(child, 'aria-controls')) inPage.push({ sig, nth: n, reach: 'self' });
							visit(child);
						}
					};
					visit(body(parseDocument(settled)));
				}
				if (!fromLayers.length && !inPage.length) continue;
				const found = (await captureRacEmpties(browser, options.old, route, join(state, 'convert', 'toggles'), [...fromLayers, ...inPage])).empties;
				if (!found.length) continue;
				const own = (f: ComboboxEmpty) => inPage.some((x) => x.sig === f.sig && x.nth === f.nth);
				racPageEmpties.set(route, found.filter(own));
				revealed.set(route, reveals.map((r) => {
					const html = reachOf(r) && found.find((f) => !own(f) && f.sig === r.sig && f.nth === (r.nth ?? 0))?.html;
					return html ? { ...r, added: r.added.map((a) => (/role="(listbox|menu)"/.test(a.html) ? { ...a, html: withEmptyState(a.html, html) } : a)) } : r;
				}));
			}
		// Whether each accordion lets several items be open, on the routes where one revealed an item's content.
		for (const [route, reveals] of revealed) if (reveals.some((r) => r.sig?.includes('|accordion-trigger|'))) accordionModes.set(route, (await captureAccordions(browser, options.old, route, join(state, 'convert', 'toggles'))).accordions);
		// React Aria's accordion panels are in the page while collapsed, so expanding one reveals nothing: its server HTML says it is there.
		for (const c of captures) if (c && !accordionModes.has(c.route) && /data-slot="accordion"[^>]*data-rac=/.test((await c.load()).server)) accordionModes.set(c.route, (await captureAccordions(browser, options.old, c.route, join(state, 'convert', 'toggles'))).accordions);
		for (const [route, reveals] of revealed) {
			// Hover cards, among them those whose trigger renders its child (its data-slot is the child's).
			const others = reveals.filter((r) => r.action === 'hover' && r.sig && !r.sig.includes('|hover-card-trigger|') && r.added.some((a) => /data-slot="hover-card-content"/.test(a.html))).map((r) => ({ sig: r.sig!, nth: r.nth ?? 0 }));
			if (others.length || reveals.some((r) => r.sig?.includes('|hover-card-trigger|'))) hoverDelays.set(route, (await captureHoverDelays(browser, options.old, route, join(state, 'convert', 'toggles'), others)).delays);
		}
		// Each carousel's alignment and autoplay, on the routes whose settled page has one.
		for (const ref of captures) {
			if (ref.status !== 200) continue;
			const settled = Object.values((await ref.load()).settled);
			if (settled.some((html) => html.includes('data-slot="carousel"'))) carouselFacts.set(ref.route, (await captureCarousels(browser, options.old, ref.route, join(state, 'convert', 'toggles'))).carousels);
			if (settled.some((html) => html.includes('recharts-wrapper'))) chartRoutes.push(ref.route);
		}
		// Each chart's states, sweeping the pointer over it on the old page, several pages at once.
		const queue = [...chartRoutes];
		await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, queue.length) }, async () => {
			for (let route = queue.shift(); route !== undefined; route = queue.shift()) chartFacts.set(route, (await captureCharts(browser, options.old, route, join(state, 'convert', 'toggles'))).charts);
		}));
		for (const c of captures) if (c && (await c.load()).server.includes('data-slot="message-scroller"')) scrollerOpenings.set(c.route, (await captureScrollers(browser, options.old, c.route, join(state, 'convert', 'toggles'))).scrollers);
		// What each react-day-picker calendar was given, on the routes whose settled page shows a month grid.
		if (options.reveal !== false)
			for (const ref of captures) {
				if (!ref || ref.status !== 200) continue;
				// The controls whose layer shows a calendar (a date picker's trigger): their calendars are read opened.
				const openers = (revealed.get(ref.route) ?? []).filter((r) => r.sig && r.added.some((a) => a.into === 'body' && /<table[^>]*role="grid"[^>]*aria-multiselectable/.test(a.html))).map((r) => ({ sig: r.sig!, nth: r.nth ?? 0 }));
				if (!openers.length && !Object.values((await ref.load()).settled).some((html) => /<table[^>]*role="grid"[^>]*aria-multiselectable/.test(html))) continue;
				pickers.set(ref.route, await captureDayPickers(browser, options.old, ref.route, join(state, 'convert', 'day-pickers'), openers));
			}
		// What each React Aria calendar was given, on the routes whose settled page shows one.
		if (options.reveal !== false)
			for (const ref of captures) {
				const calendar = (html: string) => /role="application"[^>]*data-rac=|data-rac=[^>]*role="application"/.test(html);
				const opening = (revealed.get(ref?.route ?? '') ?? []).filter((r) => r.sig && r.added.some((a) => calendar(a.html))).map((r) => ({ sig: r.sig!, nth: r.nth ?? 0, path: r.path }));
				if (!ref || ref.status !== 200 || (!opening.length && !Object.values((await ref.load()).settled).some(calendar))) continue;
				racCalendarsRead.set(ref.route, await captureRacCalendars(browser, options.old, ref.route, join(state, 'convert', 'rac-calendars'), opening));
			}
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
	// React Aria calendars on Markless state, with React Aria's messages for each locale from the old source; the layers
	// prepare() writes bind the ones their popovers show.
	const racCalendars = new RacCalendarPlan();
	const racMessages = new Map<string, CalendarMessages | undefined>();
	for (const captured of racCalendarsRead.values()) for (const c of captured.calendars) if (c.locale && !racMessages.has(c.locale)) racMessages.set(c.locale, await racCalendarMessages(options.source, c.locale));
	racLayer = { plan: racCalendars, captured: racCalendarsRead, messages: (locale) => racMessages.get(locale), route: '' };
	const prepared = new Map<string, Prepared>();
	const nextConfig = options.source ? ['next.config.mjs', 'next.config.js', 'next.config.ts', 'next.config.cjs'].map((f) => join(options.source!, f)).find((f) => existsSync(f)) : undefined;
	const optimizer: Optimizer | undefined = nextConfig ? { path: '/_next/image', widths: nextImageWidths(readFileSync(nextConfig, 'utf8')) } : undefined;
	const images: ImagePlan = { lazy: 0, eager: 0, responsive: 0, preloadsDropped: 0, someScreens: 0 };
	lateFontPages.clear();
	fontPreloadCount = 0;
	// Each capture (the served HTML and the settled documents, a few MB) is read from the cache only while its page is parsed.
	// A calendar in a layer (a date picker's popover) is bound as its layer is rendered, in prepare.
	const dayPickers = new DayPickerPlan();
	layerPickers = (route, reveal, kept) => {
		const captured = pickers.get(route);
		return captured ? dayPickers.layer(route, captured, reveal, kept) : undefined;
	};
	for (const ref of captures) {
		if (ref.status !== 200 && !(ref.route === NOT_FOUND && ref.status === 404)) {
			unconverted.push({ route: ref.route, reason: `the old site answered ${ref.status} while capturing` });
			continue;
		}
		racLayer.route = ref.route;
		prepared.set(ref.route, prepare(await ref.load(), revealed.get(ref.route) ?? [], options.old, dropped, styles, optimizer, images));
		for (const e of racPageEmpties.get(ref.route) ?? []) {
			const p = prepared.get(ref.route)!;
			const input = locator(p.root.parentNode as Element)(e.sig, e.nth);
			const id = input && attr(input, 'aria-controls');
			const collection = id ? [...walk(p.root.parentNode as Element)].find((x) => attr(x, 'id') === id) : undefined;
			if (collection) appendEmptyState(collection, e.html);
		}
		for (const r of revealed.get(ref.route) ?? []) if (r.sig) racChips(prepared.get(ref.route)!.root.parentNode as Element, r);
	}
	if (images.lazy + images.eager + images.responsive + images.someScreens) log(`images: ${images.lazy} lazy (in no first screen), ${images.eager} eager (in a first screen), ${images.responsive} given a width per device, ${images.preloadsDropped} head preloads dropped, ${images.someScreens} drawn only in one range of widths (lazy, preloaded there)`);

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
	useMounts([...(await readFile(join(app, 'lib', 'site', 'mounts.json'), 'utf8').then((t) => JSON.parse(t) as string[], () => [])), ...([...carouselFacts.values()].some((f) => f.some((c) => c.autoplay)) ? ['data-mm-autoplay'] : [])]);
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
	for (const [route, p] of prepared) {
		const facts = carouselFacts.get(route) ?? [];
		const locate = facts.length ? locator(p.root.parentNode as Element) : undefined;
		for (const f of facts) {
			const el = locate!(f.sig, f.nth);
			if (!el) continue;
			ownDelays.set(el, { ...ownDelays.get(el), align: f.align });
			if (f.autoplay) {
				el.attrs = [...el.attrs.filter((a) => a.name !== 'data-mm-autoplay' && a.name !== 'data-mm-autoplay-hover'), { name: 'data-mm-autoplay', value: String(f.autoplay) }, ...(f.hover ? [{ name: 'data-mm-autoplay-hover', value: f.hover }] : [])];
				restCarousel(el);
			}
		}
	}
	if (carouselFacts.size) log(`carousels measured: ${[...carouselFacts.values()].reduce((n, f) => n + f.length, 0)}`);
	useMeasuredProps(ownDelays);
	const measuredOf = (el: Element) => ownDelays.get(el);
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
	let pickerCount = 0;
	for (const [route, p] of prepared) {
		const captured = pickers.get(route);
		if (!captured?.pickers.length) continue;
		const locate = locator(p.root.parentNode as Element);
		pickerCount += dayPickers.add(route, captured, locate);
		// A date picker's trigger shows the picked day from the view it shares with the calendar in its layer.
		for (const raw of captured.pickers) if (raw.opener) {
			const trigger = locate(raw.opener.sig, raw.opener.nth);
			if (trigger && dayPickers.opener(route, trigger, raw.opener)) pickerCount++;
		}
	}
	for (const line of dayPickers.notes) log(`  ${line}`);
	if (pickerCount) {
		log(`react-day-picker calendars on Markless state: ${pickerCount}`);
		templatePorts.add('day-picker');
	}
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
	// React Aria tables whose checkboxes choose rows: the rows, the checkboxes and select-all are one state.
	const racTables = new RacTablePlan();
	let racTableCount = 0;
	for (const [route, p] of prepared) racTableCount += racTables.add(p.root, toggled.get(route) ?? [], locator(p.root.parentNode as Element), emitHtml);
	if (racTableCount) log(`React Aria tables with row selection on Markless state: ${racTableCount}`);
	for (const [route, p] of prepared) checkableGroups += checkables.add(p.root, toggled.get(route) ?? [], locator(p.root.parentNode as Element), emitHtml, (el) => racTables.claims(el));
	if (checkableGroups) {
		log(`checkboxes, switches, toggles and radio groups on Markless state: ${checkableGroups}`);
		templatePorts.add('toggle');
	}
	const charts = new ChartPlan();
	let chartCount = 0;
	for (const [route, p] of prepared) chartCount += charts.add(p.root, chartFacts.get(route) ?? [], locator(p.root.parentNode as Element), emitHtml);
	if (chartCount) {
		log(`recharts charts on Markless state: ${chartCount} charts`);
		styles.set(MOTION_FILE, CHART_CSS);
		templatePorts.add('recharts');
	}
	let racCalendarCount = 0;
	for (const [route, p] of prepared) {
		const captured = racCalendarsRead.get(route);
		if (captured?.calendars.length) racCalendarCount += racCalendars.add(route, captured, (locale) => racMessages.get(locale), locator(p.root.parentNode as Element), emitHtml);
	}
	for (const line of racCalendars.notes) log(`  ${line}`);
	if (racCalendarCount) {
		log(`React Aria calendars on Markless state: ${racCalendarCount}`);
		templatePorts.add('react-aria/calendar');
	}
	handledBy((el) => checkables.bind(el) !== undefined || baseTabs.bind(el) !== undefined || insertedDisclosures.bind(el) !== undefined || dayPickers.handles(el) || racCalendars.within(el) || racTables.bind(el) !== undefined);
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
	const racSelect = (el: Element) => attr(el, 'aria-haspopup') === 'listbox' && candidatesOf(el).some((c) => c.library === 'react-aria-components');
	const emitTrigger = (html: string) => emitChildren(parseFragment(html) as unknown as Element, { bind: (el) => bindParts(el, templatePorts) });
	for (const p of prepared.values()) selects.add(p.root, (el) => portFor(el) === 'base-ui/select' || portFor(el) === 'radix/select' || (racSelect(el) && !racCalendars.within(el)), emitTrigger);
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
		// A React Aria DisclosureGroup that lets several Disclosures be expanded (allowsMultipleExpanded writes nothing).
		binding = mergeBindings(binding, multipleAccordions.has(el) && attr(el, 'data-rac') !== undefined ? { extra: ['data-mm-multiple=""'] } : undefined);
		binding = mergeBindings(binding, portFor(el) === 'shadcn/message-scroller' ? bindScroller(el) : undefined);
		binding = mergeBindings(dayPickers.bind(el), binding);
		binding = mergeBindings(racCalendars.bind(el), binding);
		binding = mergeBindings(racTables.bind(el), binding);
		const own = mergeBindings(scenePlan.bind(el), mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(tabs.bind(el), baseTabs.bind(el)), charts.bind(el)), disclosures.bind(el)), insertedDisclosures.bind(el)), selects.bind(el)), checkables.bind(el)), switchPlan.bind(el)), mergeBindings(notifyPlan.bind(el), handledForms.has(el) ? formBinding : undefined)), mergeBindings(otps.bind(el), binding)), bindMount(el)));
		return markup ? mergeBindings(own, { append: markup }) : own;
	};
	void appendOf;
	// What a page gives an element beyond its markup (what a control shows on use, a trigger's layer key, measured
	// props) is part of its identity: two pages' alike code blocks whose View Code shows different sources are not one.
	const insertedInto = new Map<Element, string>();
	const replaceKeys = new Map<Element, string>();
	for (const [container, r] of replaced) {
		replaceKeys.set(r.trigger, r.key);
		for (const child of childrenOf(container)) if (isElement(child)) replaceKeys.set(child, r.key);
	}
	for (const i of inserted) insertedInto.set(i.parent, `${insertedInto.get(i.parent) ?? ''}${i.markup}`);
	// A tab list and its triggers share their state with the panels: what every panel of the list shows is theirs too,
	// so a list alike on two pages is not shared apart from its panels (each would declare its own state).
	const groupContent = new Map<Element, string>();
	for (const p of prepared.values()) {
		const byId = new Map<string, Element>();
		for (const el of walk(p.root)) {
			const id = attr(el, 'id');
			if (id) byId.set(id, el);
		}
		for (const list of walk(p.root)) {
			if (attr(list, 'role') !== 'tablist') continue;
			const triggers = [...walk(list)].filter((t) => attr(t, 'role') === 'tab');
			const panels = triggers.map((t) => byId.get(attr(t, 'aria-controls') ?? '')).filter((x): x is Element => x !== undefined);
			const content = [...panels.map((x) => panelContent.get(x) ?? ''), ...triggers.map((t) => JSON.stringify(basePanels.get(t) ?? ''))].join('\u0002');
			if (!content.replace(/[\u0002"]/g, '')) continue;
			for (const el of [list, ...triggers]) groupContent.set(el, content);
		}
		// Any other control whose panel shows captured content (an accordion's or collapsible's trigger) shares it too.
		for (const el of walk(p.root)) {
			const panel = byId.get(attr(el, 'aria-controls') ?? '');
			const content = panel && panelContent.get(panel);
			if (content && !groupContent.has(el)) groupContent.set(el, content);
		}
	}
	const ownContent = (el: Element): string | undefined => {
		const panel = basePanels.get(el);
		const own = [appended.get(el), replaced.get(el)?.markup, replaceKeys.get(el), groupContent.get(el), panelContent.get(el), panel && JSON.stringify(panel), insertedInto.get(el), triggerKeys.get(el), measuredOf(el) && JSON.stringify(measuredOf(el)), notifyPlan.nameOf(el), scenePlan.nameOf(el), charts.bind(el)?.declare?.[0]].filter((x): x is string => Boolean(x));
		return own.length ? own.join('\u0001') : undefined;
	};
	const factored: Factored = factor(new Map([...prepared].map(([route, p]) => [route, p.root])), { bind: (el) => withAppend(el, bindParts(el, usedPorts)), extra: ownContent });
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
				for (let j = from; j < i; j++) after += `<BodyAfter${j} route={${lit(route)}} />`;
				after += emitElement(bodyParts.after[i]!.byRoute.get(route)!, { declarations, bind: (el) => mergeBindings(bindParts(el, usedPorts), notifyPlan.bind(el)), dropped: noteDropped });
				from = i + 1;
			}
			for (let j = from; j < bodyParts.after.length; j++) after += `<BodyAfter${j} route={${lit(route)}} />`;
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
		if (bodyAfter) {
			const ranges = [...new Set(variants.flatMap((v) => [...v.markup.matchAll(/<(BodyAfter\d+) /g)].map((m) => m[1]!)))];
			imports.add(`import BodyAfter${ranges.length ? `, { ${ranges.join(', ')} }` : ''} from '${relative(dirname(join(app, file)), join(app, 'components', 'converted', 'body-after.tsrx')).replace(/^(?!\.)/, './')}';`);
		}
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
	// DocSearch's button keys and loading on intent run from the head, before the first paint and the first press.
	const shell = docsearchShell();
	const headScripts: (string | { name: string; attributes: string })[] = docsearchConfigured() ? ['DOCSEARCH_SCRIPT', ...(shell ? [{ name: 'DOCSEARCH_SHELL', attributes: 'type="text/html" data-mm-docsearch-shell' }] : [])] : [];
	if (headScripts.length) usedPorts.add('docsearch');
	if (headScripts.length) documentParts.push({ part: 'docsearch', import: (dir) => `import { DOCSEARCH_SCRIPT${shell ? ', shellScript' : ''} } from '${dir}/docsearch.ts';${shell ? `\nimport DOCSEARCH_SHELL_HTML from '${dir}/docsearch-shell.ts';\nconst DOCSEARCH_SHELL = shellScript(DOCSEARCH_SHELL_HTML);` : ''}` });
	if (fontPreloadCount) log(`font preloads: ${fontPreloadCount} first-screen web fonts that only a stylesheet named are preloaded`);
	if (lateFontPages.size) {
		headScripts.push('LATE_FONTS_SCRIPT');
		documentParts.push({ part: 'late-fonts', import: (dir) => `import { LATE_FONTS_SCRIPT } from '${dir}/late-fonts.ts';` });
		usedPorts.add('late-fonts');
		log(`late fonts: on ${lateFontPages.size} pages, a web font only text below every first screen uses is fetched after the load`);
	}
	// A theme toggle the site names switches the theme from the first paint, before the page's code has arrived.
	const toggle = themeToggleOf(await readFile(join(app, 'lib', 'site', 'controls.json'), 'utf8').then((t) => JSON.parse(t) as Record<string, unknown>[], () => []));
	// ThemeProvider writes its script at the start of <body>; another site may keep it in <head>.
	const scripts = [...prepared.values()].flatMap((p) => [...p.head.filter((t) => t.tag === 'script').map((t) => t.text ?? ''), ...p.before.flatMap((el) => [...walk(el)].filter((s) => s.tagName === 'script').map((s) => textContent(s)))]);
	const themeScript = scripts.find((text) => nextThemesOptions(text));
	const themeOptions = toggle && themeScript ? nextThemesOptions(themeScript, toggle.disableTransitionOnChange === true) : undefined;
	if (toggle && themeOptions) {
		const { disableTransitionOnChange: _, ...named } = toggle;
		headScripts.push(`earlyThemeScript(${JSON.stringify(themeOptions)}, ${JSON.stringify(named)})`);
		documentParts.push({ part: 'next-themes', import: (dir) => `import { earlyThemeScript } from '${dir}/next-themes.ts';` });
		log(`theme toggle "${toggle.name}" answers from the first paint (next-themes ${themeOptions.attribute}, key ${themeOptions.storageKey})`);
	}
	await writeFile(join(app, 'document.tsrx'), appUrlDeclaration(documentModule(bodyParts, (el) => bindParts(el, usedPorts), noteDropped, partsDir('document.tsrx'), documentParts, headScripts)));
	await writeFile(join(app, 'head.ts'), HEAD_HELPER);
	if (disclosureGroups || insertedGroups) usedPorts.add('panel-motion');
	await writeParts(app, usedPorts, choices);
	if (shell) await writeFile(join(app, 'lib', 'parts', 'docsearch-shell.ts'), `// Generated by markless-migrate convert: DocSearch's dialog as the old site first draws it on a press (captured by plan).\nexport default ${JSON.stringify(shell)};\n`);
	if (pickerCount) await writeFile(join(app, 'lib', 'parts', CONFIGS_MODULE), dayPickers.configsModule());
	if (racCalendars.placed) await writeFile(join(app, 'lib', 'parts', RAC_CONFIGS_MODULE), racCalendars.configsModule());
	await mkdir(join(app, 'components', 'converted'), { recursive: true });
	await mkdir(join(app, 'components', 'converted', 'layers'), { recursive: true });
	for (const layer of layers.files) await writeFile(join(app, 'components', 'converted', layer.file), appUrlDeclaration(withPartImports(layer.source, partsDir(join('components', 'converted', layer.file)))));
	// The calendar views date pickers share between their popover and their trigger, at page scope.
	const sharedPickers = dayPickers.sharedModule(`../../lib/parts/${CONFIGS_MODULE}`, '../../lib/parts');
	if (sharedPickers) await writeFile(join(app, 'components', 'converted', 'day-pickers.tsrx'), sharedPickers);
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
