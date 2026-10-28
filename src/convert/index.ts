import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { chromium } from 'playwright';
import { copyAssets, copyStaticDir, resourcePaths } from './assets.ts';
import { capturePage, type CapturedPage, type CapturedRef } from './capture.ts';
import { eachLimited, limiter } from './limit.ts';
import { atRest } from './at-rest.ts';
import { captureRouteReveals, captureBaseSubmenus, captureNestedReveals, captureRacComboInputs, captureRacHovers, captureRacSubmenus, captureRadixSubmenus, type Reveal } from './reveal.ts';
import { captureChoices, copyBinding, markChosenHref, optionsShown, type Choice } from './choices.ts';
import { parseFragment, serialize } from 'parse5';
import { applyQwikFloating, captureQwikFloating, type QwikFloating } from './qwik-floating.ts';
import { cleanDocument, frameworkBuilds, lateHead, type Dropped, type QwikHandlers } from './clean.ts';
import { attr, body, childrenOf, elementChildren, head, html, isElement, outer, parseDocument, textContent, walk, type Document, type Element } from './dom.ts';
import { factor, type Factored } from './factor.ts';
import { besideTrigger } from './beside-trigger.ts';
import { layerNames } from './layer-ids.ts';
import { BaseTabsPlan, CheckablePlan, RacTablePlan, DisclosurePlan, radixDisclosurePanel, InsertedDisclosurePlan, NotifyPlan, SelectPlan, SwitchPlan, TabsPlan } from './stateful.ts';
import { captureCharts, CHART_CSS, ChartPlan, MOTION_FILE, type ChartFacts } from './charts.ts';
import { captureSliders, type SliderFacts } from './sliders.ts';
import { captureClock, DATED, type ClockMark } from './clock.ts';
import { captureScenes, type Scene } from './scenes.ts';
import { ScenePlan } from './scene-plan.ts';
import { bindScroller, captureScrollers, useScrollerOpenings, type ScrollerOpening } from './scrollers.ts';
import { captureAccordions, captureCarousels, restCarousel, captureComboboxEmpties, captureRacEmpties, type ComboboxEmpty, type EmptyReach, captureHoverDelays, captureForms, captureSwitches, captureToggles, captureNotifications, type AccordionMode, type CarouselFacts, type FormCapture, type HoverDelay, type Notify, type Switch, type ToggleGroup } from './toggles.ts';
import { QWIK_CONTEXT_PROPS, QWIK_HANDLER_MARKS, useMarkupLibraries, bindMount, bindParts, bodyHandlers, mountingPorts, registryPath, writeRegistries, candidatesOf, docsearchConfigured, docsearchShell, useDocSearch, handledBy, portAttributes, portFor, onRoute, renamedFrom, UNPORTED, useMeasuredProps, useMounts, useResolver, writeParts, type PartUse } from './parts.ts';
import { sourceSlotResolver, usageResolver, type PartResolver } from './usage.ts';
import { captureTables, CELLS_PREFIX, mayHoldTable, SHARED_MODULE as TABLES_SHARED, SPEC_PREFIX, SPECS_MODULE as TABLE_SPECS, TablePlan, type CapturedTable } from './tanstack-table.ts';
import { captureDayPickers, CONFIG_PREFIX, CONFIGS_MODULE, DayPickerPlan, type CapturedPickers } from './day-picker.ts';
import { captureRacCalendars, RAC_CONFIG_PREFIX, RAC_CONFIGS_MODULE, racCalendarMessages, RacCalendarPlan, type CapturedCalendars } from './rac-calendar.ts';
import type { CalendarMessages } from '../../parts/react-aria/calendar.ts';
import { stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { nextImageWidths, pairImages, planImages, type ImagePlan, type Optimizer } from './images.ts';
import { nextThemesOptions, themeToggleOf } from './theme.ts';
import { applyLateFonts, swapFontPreloadsLow, fontPreloads, lateFaces, withoutFontPreloads } from './fonts.ts';
import { usedStylesheets } from './used-css.ts';
import { lateFontsConfig } from '../../parts/late-fonts.ts';
import { match } from 'path-to-regexp';
import { readSource } from '../plan/inventory.ts';
import { nextPattern, writeRouting, type EndpointPort } from './endpoints.ts';
import { bodyAfterModule, documentModule, extrasModule, HEAD_HELPER, LAYER_FILL, layerTable, pageBody, pagesWiring, splitBody } from './document.ts';
import { captureOtps, OtpPlan } from './otp.ts';
import { componentImport, componentName, pageComponentOf, readSiteComponents, siteComponentOf, withSiteImports, type SiteComponent } from './site-components.ts';
import { appUrlDeclaration, emitChildren, emitElement, emitHtmlChildren, withOriginToken, lit, mergeBindings, useOrigin, type Binding } from './tsrx.ts';

// Markless wires no handler written in document.tsrx, so each page's root carries the delegating handlers.
const ROOT_HANDLERS = '__MM_ROOT_HANDLERS__';
const PAGE_SHOWN = 'PAGE_SHOWN';
const NOT_FOUND = '/_markless-migrate/not-found';

/** The registries under `lib/parts/` a module's calls of the parts runtime import: its pages' ports, and the ports that mount. */
interface Registries {
	readonly behave: () => string;
	readonly mount: () => string;
}

/** Imports the parts runtime's functions a generated module calls, after its first line. */
function withPartImports(source: string, dir: string, registries: Registries): string {
	const used = ['behave', 'listen'].filter((name) => source.includes(`=> ${name}(`));
	let out = used.length ? source.replace('\n', `\nimport { ${used.join(', ')} } from '${dir}/${registries.behave()}';\n`) : source;
	if (source.includes('=> mount(')) out = out.replace('\n', `\nimport { mount } from '${dir}/${registries.mount()}';\n`);
	const rovingNames = ['roving', 'tabValue'].filter((name) => new RegExp(`\\b${name}\\(event\\)`).test(out));
	if (rovingNames.length) out = out.replace('\n', `\nimport { ${rovingNames.join(', ')} } from '${dir}/radix/roving.ts';\n`);
	if (/\baccordionKeys\(/.test(out)) out = out.replace('\n', `\nimport { accordionKeys } from '${dir}/radix/disclosure-motion.ts';\n`);
	const motion = ['panelEnter', 'panelExit'].filter((name) => new RegExp(`\\b${name}\\(`).test(out));
	if (motion.length) out = out.replace('\n', `\nimport { ${motion.join(', ')} } from '${dir}/panel-motion.ts';\n`);
	const toggleNames = ['radioKeys', 'submitForm', 'focusControl'].filter((name) => new RegExp(`\\b${name}\\(event`).test(out));
	if (toggleNames.length) out = out.replace('\n', `\nimport { ${toggleNames.join(', ')} } from '${dir}/toggle.ts';\n`);
	const sonnerNames = ['sonnerAdd', 'sonnerList', 'SONNER_EMPTY'].filter((name) => new RegExp(`\\b${name}\\b`).test(out));
	if (sonnerNames.length) out = out.replace('\n', `\nimport { ${sonnerNames.join(', ')} } from '${dir}/sonner.ts';\n`);
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
	const table = ['ttView', 'ttAct'].filter((name) => new RegExp(`\\b${name}\\(`).test(out));
	if (table.length) out = out.replace('\n', `\n${/import \{[^}]*\bcomputed\b[^}]*\} from '@markless\/core'/.test(out) ? '' : "import { computed } from '@markless/core';\n"}import { ${table.join(', ')} } from '${dir}/tanstack-table.ts';\n`);
	const tableData = [...new Set(out.match(new RegExp(`\\b(?:${SPEC_PREFIX}|${CELLS_PREFIX})[0-9a-f]{10}\\b`, 'g')) ?? [])];
	if (tableData.length) out = out.replace('\n', `\nimport { ${tableData.join(', ')} } from '${dir}/${TABLE_SPECS}';\n`);
	const sharedTables = [...new Set(out.match(/\bttShared\d+(?=\(\))/g) ?? [])];
	if (sharedTables.length) out = out.replace('\n', `\nimport { ${sharedTables.join(', ')} } from '${dir}/../../components/converted/${TABLES_SHARED}';\n`);
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
// Keeps one of each entry in the Nitro lists the config sets: doubled, every handler ran twice per request and \`vp dev\` stopped at a server asset directory's second mount.
const NITRO_ONCE = `(options) => {
	for (const list of ['handlers', 'serverAssets', 'traceDeps']) {
		const entries = options[list];
		if (!Array.isArray(entries)) continue;
		const seen = new Set();
		options[list] = entries.filter((entry) => !seen.has(JSON.stringify(entry)) && Boolean(seen.add(JSON.stringify(entry))));
	}
}`;
export const viteConfig = (packages: readonly string[]) => `// Generated by markless-migrate convert; change the converter, not this file.
import { fileURLToPath } from 'node:url';
import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig } from 'vite-plus';

// Markless's router hands Vite this nitro config again, and Vite's merge doubles its lists.
const nitroOnce: (options: Record<string, unknown>) => void = ${NITRO_ONCE};

export default defineConfig({
	nitro: {
		modules: [{ name: 'markless-migrate:once', setup: (nitro: { options: Record<string, unknown> }) => nitroOnce(nitro.options) }],
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
	/** Take every capture of the old pages into .migrate/convert and stop there: no page is written. */
	readonly captureOnly?: boolean;
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
	/** The paths of the web fonts only text below every first screen draws, whose faces wait for the page's scripts. */
	readonly lateFontPaths: readonly string[];
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
const dayPickerIn = (binding: Binding | undefined) => {
	if (binding) templatePorts.add('day-picker');
	return binding;
};
/**
 * The ports the converted markup uses, and which routes each is for: what is emitted for some routes (a page, the layers
 * it portals, a region pages share) is theirs; what a plan puts on Markless state is the routes whose markup that plan
 * binds; anything else (the document, the body's shared children) is every page's.
 */
export class RoutedPorts extends Set<string> {
	/** The routes the markup being emitted is for; none while emitting what every page renders. */
	routes: readonly string[] | undefined;
	private readonly own = new Map<string, Set<string>>();
	private readonly everywhere = new Set<string>();
	private readonly planned = new Set<string>();
	override add(module: string): this {
		super.add(module);
		if (this.routes) for (const route of this.routes) this.give(route, module);
		else this.everywhere.add(module);
		return this;
	}
	/** A port a plan needs: it is the routes' whose markup the plan's binding is emitted for, or every page's if none. */
	plan(module: string): void {
		super.add(module);
		this.planned.add(module);
	}
	/** The ports these routes' pages can use. */
	of(routes: readonly string[]): Set<string> {
		const given = new Set([...this.own.values()].flatMap((s) => [...s]));
		const unplaced = [...this.planned].filter((m) => !given.has(m));
		return new Set([...this.everywhere, ...unplaced, ...routes.flatMap((r) => [...(this.own.get(r) ?? [])])]);
	}
	override clear(): void {
		super.clear();
		this.own.clear();
		this.everywhere.clear();
		this.planned.clear();
		this.routes = undefined;
	}
	private give(route: string, module: string): void {
		(this.own.get(route) ?? this.own.set(route, new Set()).get(route)!).add(module);
	}
}
// Ports the parts inside revealed content need (a command palette exists only in its template).
const templatePorts = new RoutedPorts();
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
				// A slot a wrapper renders another wrapper with (a submenu's content) has that site's offsets.
				const side = placementResolver.forwardedProp?.(slot, 'sideOffset') ?? placementResolver.prop(c.library, c.export, 'sideOffset');
				const align = placementResolver.forwardedProp?.(slot, 'alignOffset') ?? placementResolver.prop(c.library, c.export, 'alignOffset');
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
let currentLayers: { key: string; markup: string; shell: string; fill: string; declare?: readonly string[]; imports?: readonly string[] }[] = [];
let siteComponents: readonly SiteComponent[] = [];
let currentRoute = '';
let layerPickers: ((route: string, reveal: Reveal, kept: readonly Element[]) => { readonly bind: (el: Element) => Binding | undefined; readonly declare: readonly string[] } | undefined) | undefined;
// The TanStack tables whose visibility menus are layers (convert's TablePlan): their items bind the table's shared state.
let layerTables: TablePlan | undefined;
// The React Aria calendars the popovers of the route being prepared show (convert's RacCalendarPlan, set per route).
let racLayer: { readonly plan: RacCalendarPlan; readonly captured: ReadonlyMap<string, CapturedCalendars>; readonly messages: (locale: string) => CalendarMessages | undefined; route: string } | undefined;
// What choosing each option of a control's layer did (Base UI Select's hidden input value, the text its trigger showed),
// by page and layer key, and option text.
let optionValues: Record<string, Record<string, Choice>> = {};
// What choosing each option of a control's layer did (where it went, what it copied), by layer key and option text.
let layerChoices: Record<string, Record<string, Choice>> = {};
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
const inserted: { trigger: Element; parent: Element; before: Element | null; markup: string; nodes?: readonly Element[]; panelId?: string; panelDepth?: number }[] = [];

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
function layerMarkup(reveal: Reveal, added: Reveal['added'][number], dropped: (what: string) => void, rename: ReadonlyMap<string, string> = new Map(), kept: Element[] = layerElements(added)): { markup: string; shell: string; fill: string; declare: string[]; site?: SiteComponent } {
	// A calendar in the layer is bound on the view its opener shares (DayPickerPlan.layer): read before ids are renamed.
	const pickers = layerPickers?.(currentRoute, reveal, kept);
	const tableMenu = layerTables?.layer(currentRoute, reveal, kept);
	const placed = placement(kept);
	for (const top of kept) renameIds([top, ...walkAll(top)], rename);
	const key = rename.get(reveal.key) ?? reveal.key;
	const extra = placed ? placed.trim().split(/\s+(?=data-)/) : [];
	const values = optionValues[`${currentRoute}|${reveal.key}`];
	for (const top of kept) {
		for (const el of [top, ...walkAll(top)]) {
			atRest(el);
			const text = attr(el, 'role') === 'option' ? textContent(el).trim() : undefined;
			const chosen = values && text !== undefined ? values[text] : undefined;
			if (chosen?.value !== undefined) el.attrs = [...el.attrs.filter((a) => a.name !== 'data-mm-value'), { name: 'data-mm-value', value: chosen.value }];
			if (chosen?.shown !== undefined && chosen.shown !== text) el.attrs = [...el.attrs.filter((a) => a.name !== 'data-mm-text'), { name: 'data-mm-text', value: chosen.shown }];
			markChosenHref(el, values);
		}
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
	const copies = layerChoices[reveal.key];
	const copying = kept.some((top) => [top, ...walkAll(top)].some((x) => copyBinding(x, copies)));
	const emit = (shell: boolean) =>
		kept
			.map((top) =>
				emitElement(top, {
					dropped,
					declarations,
					bind: (x) => {
						const own = mergeBindings(mergeBindings(racLayer?.plan.bind(x), mergeBindings(x === top ? mergeBindings(bindParts(x, templatePorts), extra.length ? { extra } : undefined) : bindParts(x, templatePorts), dayPickerIn(pickers?.bind(x)))), mergeBindings(tableMenu?.bind(x), copyBinding(x, copies)));
						return shell && x === hollow ? mergeBindings(own, { children: '', extra: [`data-mm-layer-fill="${LAYER_FILL}"`] }) : own;
					},
				}),
			)
			.join('');
	const markup = emit(false);
	const sited = kept.flatMap((top) => [top, ...walkAll(top)]).flatMap((el) => {
		const site = siteComponentOf(el, siteComponents);
		return site ? [{ el, site }] : [];
	})[0];
	if (sited) {
		if (declarations.length || copying || !hollow || !walkAll(sited.el).includes(hollow)) throw new Error(`${currentRoute}: ${sited.site.component} stands in for an element of a layer that does not hold the layer's largest content, or holds state`);
		// Markless renders this shell, so the component in it runs: the page holds it, and the file only the content.
		const shell = kept
			.map((top) =>
				emitElement(top, {
					dropped,
					bind: (x) => {
						if (x === sited.el) return { replace: `<${componentName(sited.site)} fill="${LAYER_FILL}" />` };
						const own = x === top ? mergeBindings(bindParts(x, templatePorts), { extra: [...extra, `data-mm-served="${LAYER_FILL}"`] }) : bindParts(x, templatePorts);
						return mergeBindings(racLayer?.plan.bind(x), mergeBindings(own, pickers?.bind(x)));
					},
				}),
			)
			.join('');
		return { markup, shell, fill: emitHtmlChildren(hollow), declare: declarations, site: sited.site };
	}
	// A layer with handlers of its own is a component, never a served file (whose content is HTML).
	if (declarations.length || copying) return { markup, shell: '', fill: '', declare: declarations };
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
		forwardedProp: (slot, prop) => first.forwardedProp?.(slot, prop) ?? then.forwardedProp?.(slot, prop),
	};
}

// A timed delay includes the old page's render after its timer fired (10 to 30 ms): the round delay at or below it.
const ROUND_DELAYS = [0, 10, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000, 1500, 2000];
const delayOf = (ms: number) => ROUND_DELAYS.filter((d) => d <= ms).at(-1) ?? 0;

/** Finds an element of a page by its signature and occurrence, as reveals and toggles were captured. */
// A chart's [data-slot="chart"] container, else its wrapper's parent: what holds its SVGs and tooltip.
function chartRegion(wrapper: Element | undefined): Element | undefined {
	for (let el = wrapper?.parentNode as Element | undefined; el && isElement(el); el = el.parentNode as Element | undefined) if (attr(el, 'data-slot') === 'chart') return el;
	return wrapper?.parentNode && isElement(wrapper.parentNode as Element) ? (wrapper.parentNode as Element) : undefined;
}

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
			// Content holding controls revealed in turn (a file tree's nested folders) goes into the page, so those are bound too.
			const into = reveal.added.find((a) => typeof a.into !== 'string' && elementAt(root, a.into) === panel)?.into as readonly number[] | undefined;
			const holds = into && reveals.some((o) => o !== reveal && o.path.length > into.length && into.every((v, i) => o.path[i] === v));
			if (holds) {
				for (const a of reveal.added) {
					if (typeof a.into === 'string' || elementAt(root, a.into) !== panel) continue;
					for (const el of childrenOf(parseFragment(a.html) as unknown as Element).filter(isElement)) {
						el.parentNode = panel as never;
						panel.childNodes.push(el as never);
						for (const x of [el, ...walkAll(el)]) {
							const id = attr(x, 'id');
							if (id) byId.set(id, x);
						}
					}
				}
				continue;
			}
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
				const kept = besideTrigger(added.html);
				if (!kept.length) continue;
				if (!trigger) {
					unplaced.push(`${reveal.key}: its control is not on the converted page`);
					continue;
				}
				const parent = elementAt(root, added.into);
				// A disclosure that mounts its content where it opens (Base UI Collapsible and Accordion, a Radix
				// Collapsible whose content leaves while closed): a layer's trigger (aria-haspopup) is a portal's.
				// Radix NavigationMenu mounts its viewport, with the trigger's content, beside the list: a layer of the trigger's.
				const menu = trigger !== undefined && attr(trigger, 'data-slot') === 'navigation-menu-trigger';
				const inPlace = !menu && attr(trigger ?? ({ attrs: [] } as unknown as Element), 'data-slot') !== 'scroll-area' && trigger && parent && attr(trigger, 'aria-expanded') === 'false' && attr(trigger, 'aria-haspopup') === undefined && !reveal.added.some((a) => a.into === 'body');
				const panel = panelOf(kept, attr(trigger!, 'aria-controls'));
				const into = Array.isArray(added.into) ? (added.into as readonly number[]) : undefined;
				// Content holding controls captured in turn (a Base UI file tree's nested folders) goes into the page, hidden while closed.
				const holds = inPlace && into && reveals.some((o) => o !== reveal && o.path.length > into.length && into.every((v, i) => o.path[i] === v));
				if (holds) {
					const before = added.before >= 0 ? (elementChildren(parent!)[added.before] ?? null) : null;
					const at = before ? parent!.childNodes.indexOf(before as never) : parent!.childNodes.length;
					for (const el of kept) el.parentNode = parent as never;
					parent!.childNodes.splice(at, 0, ...(kept as never[]));
					for (const el of kept) for (const x of [el, ...walkAll(el)]) if (attr(x, 'id')) byId.set(attr(x, 'id')!, x);
					inserted.push({ trigger: trigger!, parent: parent!, before, markup: '', nodes: kept, ...panel });
				} else if (inPlace) inserted.push({ trigger: trigger!, parent: parent!, before: added.before >= 0 ? (elementChildren(parent!)[added.before] ?? null) : null, markup: kept.map((e) => emitElement(e, { dropped, bind: (x) => bindParts(x, templatePorts) })).join(''), ...panel });
				// What opening a layer also puts beside its trigger (Base UI's visually hidden Dismiss button): rendered hidden
				// there, shown with the layer (data-mm-shown-with names the trigger's key).
				else if (trigger && parent && (menu || attr(trigger, 'aria-haspopup') !== undefined || attr(trigger, 'data-slot') === 'scroll-area')) companions.push({ parent, before: added.before >= 0 ? (elementChildren(parent)[added.before] ?? null) : null, kept, key: reveal.key });
				else unplaced.push(`${reveal.key}: content shown inside the page by a control no Markless state drives yet`);
			}
		}
	}
	// Two triggers the old page gave one id (shadcn's React Aria date pickers): each later one takes the id its key names, or both would open one layer.
	for (const l of pendingLayers) {
		const id = l.trigger && attr(l.trigger, 'id');
		if (!id || id === l.reveal.key || !l.reveal.key.startsWith(`${id}-`) || !/^\d+$/.test(l.reveal.key.slice(id.length + 1))) continue;
		l.trigger!.attrs = l.trigger!.attrs.map((a) => (a.name === 'id' ? { ...a, value: l.reveal.key } : a));
		for (const top of l.kept) for (const el of [top, ...walkAll(top)]) el.attrs = el.attrs.map((a) => (/^aria-(labelledby|describedby)$/.test(a.name) ? { ...a, value: a.value.split(/(\s+)/).map((t) => (t === id ? l.reveal.key : t)).join('') } : a));
	}
	const names = layerNames(pendingLayers.map((l) => ({ key: l.reveal.key, kept: l.kept, inPage: l.trigger !== undefined })));
	const placedWith = new Set<string>();
	for (const c of companions) {
		const at = `${c.key}|${outer(c.kept[0]!)}`;
		if (placedWith.has(at)) continue;
		placedWith.add(at);
		const index = c.before ? c.parent.childNodes.indexOf(c.before as never) : c.parent.childNodes.length;
		const rename = names.of(c.key);
		const nodes = c.kept.map((e) => {
			renameIds([...walk(e)], rename);
			e.attrs = [...e.attrs.filter((a) => a.name !== 'hidden' && a.name !== 'data-mm-shown-with'), { name: 'hidden', value: '' }, { name: 'data-mm-shown-with', value: c.key }];
			e.parentNode = c.parent as never;
			return e;
		});
		c.parent.childNodes.splice(index < 0 ? c.parent.childNodes.length : index, 0, ...(nodes as never[]));
	}
	// Layers last: their generated ids are renamed from their content, here and wherever the page names them.
	renameIds([...walk(root)], names.page);
	for (const [i, l] of pendingLayers.entries()) {
		const rename = names.each[i]!;
		const { markup, shell, fill, declare, site } = layerMarkup(l.reveal, l.added, dropped, rename, l.kept);
		const key = rename.get(l.reveal.key) ?? l.reveal.key;
		if (markup) currentLayers.push({ key, markup, shell, fill, ...(declare.length ? { declare } : {}), ...(site ? { imports: [componentImport(site, '../../..')] } : {}) });
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

// The old Qwik build's handler symbols, from its q-manifest.json, while its pages are prepared.
let qwikHandlers: QwikHandlers | undefined;

/** A Qwik build's symbols by name, with each one's source file and handler name, from the manifest it serves. */
async function readQwikSymbols(origin: string): Promise<QwikHandlers['symbols'] | undefined> {
	const manifest = await fetch(new URL('/q-manifest.json', origin)).then((r) => (r.ok ? (r.json() as Promise<{ symbols?: Record<string, { origin?: string; displayName?: string }> }>) : undefined), () => undefined);
	if (!manifest?.symbols) return undefined;
	return new Map(Object.entries(manifest.symbols).flatMap(([symbol, s]) => (s.origin && s.displayName ? [[symbol, { origin: s.origin, name: s.displayName }] as const] : [])));
}

function prepare(capture: CapturedPage, reveals: readonly Reveal[], origin: string, dropped: Dropped, styles: Map<string, string>, optimizer: Optimizer | undefined, images: ImagePlan): Prepared {
	currentRoute = capture.route;
	const builds = frameworkBuilds(capture.server).map((b) => b.path);
	const ctx = { builds, frameworkScripts: new Set<string>(), origin, ...(qwikHandlers ? { qwik: qwikHandlers } : {}) };
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
	const lateFontPaths = (capture.lateFonts ?? []).flatMap((f) => f.urls ?? []).flatMap((u) => {
		const url = URL.parse(u);
		return url && url.origin === new URL(origin).origin ? [url.pathname + url.search] : [];
	});
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
	const kept = withoutFontPreloads(tags, capture.offscreenFontPreloads ?? [], origin);
	if (kept.length < tags.length) dropped.set('<link rel=preload as=font>: a font no first screen draws', (dropped.get('<link rel=preload as=font>: a font no first screen draws') ?? 0) + tags.length - kept.length);
	tags.splice(0, tags.length, ...kept);
	// The first screen's web fonts are fetched with the stylesheet, not after it: preloaded right after the charset.
	const preloaded = tags.filter((t) => t.tag === 'link' && /\bpreload\b/.test(t.attrs.rel ?? '') && t.attrs.as === 'font').length;
	const fonts = fontPreloads(capture.firstScreenFonts ?? [], origin, preloaded).map((f): HeadTag => ({ tag: 'link', attrs: { rel: 'preload', href: f.href, as: 'font', type: 'font/woff2', crossorigin: '' } }));
	if (fonts.length) {
		tags.splice(tags.findIndex((t) => t.tag === 'meta' && t.attrs.charset !== undefined) + 1, 0, ...fonts);
		fontPreloadCount += fonts.length;
	}
	const swapFonts = fontPreloads(capture.swapFirstScreenFonts ?? [], origin, 0).map((f): HeadTag => ({ tag: 'link', attrs: { rel: 'preload', href: f.href, as: 'font', type: 'font/woff2', crossorigin: '' } }));
	tags.splice(0, tags.length, ...swapFontPreloadsLow(tags, capture.swapFontPreloads ?? [], origin, swapFonts));
	fontPreloadCount += swapFonts.length;
	const faces = lateFaces((capture.lateFonts ?? []).flatMap((f) => (f.face ? [f.face] : [])), origin);
	if (faces.length) {
		const config = lateFontsConfig(faces);
		tags.push({ tag: 'script', attrs: { type: 'application/json', [config.attribute]: '' }, text: config.text });
	}
	const kids = elementChildren(body(doc));
	const root = pageRoot(kids);
	const at = kids.indexOf(root);
	return { resources: resourcePaths(doc, origin), htmlAttrs: attrsOf(html(served)), bodyAttrs: attrsOf(body(doc)), head: tags, root, before: kids.slice(0, at), after: kids.slice(at + 1), appends, layers, clipboard, late, lateFontPaths };
}

const isMain = (el: Element) => el.tagName === 'main' || attr(el, 'role') === 'main';

/**
 * The body child that is the page's own content: the one holding its main landmark, else the largest. A shared header
 * can outweigh a short page's content (a theme panel's hundreds of swatches), and is then the document's, not the page.
 */
export function pageRoot(kids: readonly Element[]): Element {
	const holding = kids.filter((el) => isMain(el) || [...walk(el)].some(isMain));
	return (holding.length ? holding : kids).reduce((a, b) => (outer(b).length > outer(a).length ? b : a));
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
	const planned = JSON.parse(await readFile(join(state, 'inventory.json'), 'utf8')) as { routes: { route: string; status: number }[]; allRoutes?: { route: string; status?: number; contentType?: string; redirectsTo?: string }[] };
	// allRoutes carries each route's content type; routes only those the browser inventoried.
	const types = new Map((planned.allRoutes ?? []).map((r) => [r.route, r]));
	const inventory = { routes: [...new Map([...planned.routes.map((r) => [r.route, { route: r.route, status: r.status, contentType: types.get(r.route)?.contentType }] as const), ...(planned.allRoutes ?? []).filter((r) => r.status !== undefined).map((r) => [r.route, { route: r.route, status: r.status!, contentType: r.contentType }] as const)]).values()] };
	const htmlRoutes = inventory.routes.filter((r) => r.status === 200 && (r.contentType ?? 'text/html').includes('html')).map((r) => r.route);
	const routes = options.only?.length ? htmlRoutes.filter((r) => options.only!.includes(r)) : htmlRoutes;
	siteComponents = await readSiteComponents(app);
	const browser = await chromium.launch();
	const width = Math.max(1, options.concurrency ?? 4);
	let captures: CapturedRef[];
	const revealed = new Map<string, readonly Reveal[]>();
	const toggled = new Map<string, readonly ToggleGroup[]>();
	const switched = new Map<string, readonly Switch[]>();
	const submitted = new Map<string, FormCapture['forms']>();
	const notified = new Map<string, readonly Notify[]>();
	const accordionModes = new Map<string, readonly AccordionMode[]>();
	const hoverDelays = new Map<string, readonly HoverDelay[]>();
	const carouselFacts = new Map<string, readonly CarouselFacts[]>();
	const sliderFacts = new Map<string, readonly SliderFacts[]>();
	const clockRoutes: string[] = [];
	const clockMarks = new Map<string, readonly ClockMark[]>();
	const chartFacts = new Map<string, readonly ChartFacts[]>();
	const chartRoutes: string[] = [];
	const scrollerOpenings = new Map<string, readonly ScrollerOpening[]>();
	const scenes = new Map<string, { scene: Scene; listed: string }[]>();
	const pickers = new Map<string, CapturedPickers>();
	const racCalendarsRead = new Map<string, CapturedCalendars>();
	const tablesRead = new Map<string, readonly CapturedTable[]>();
	const floatingRead = new Map<string, readonly QwikFloating[]>();
	const choices: Record<string, Record<string, Choice>> = {};
	optionValues = {};
	layerChoices = choices;
	try {
		const limit = limiter(width);
		// Routes read at once, each holding its captures (a few MB) between its pages: twice the pages, so a slot is rarely idle.
		const reading = limiter(width * 2);
		const at = (name: string) => join(state, 'convert', name);
		const reveal = options.reveal !== false;
		// Controls the site's own components reveal content with, beside those ARIA marks (lib/site/controls.json).
		const listed = await readFile(join(app, 'lib', 'site', 'controls.json'), 'utf8').then((t) => JSON.parse(t) as { selector: string; action: Reveal['action'] | 'toggle' | 'notify' | 'play' | 'open' | 'theme'; routes?: string }[], () => []);
		const extra = listed.flatMap((c) => (c.action === 'toggle' || c.action === 'notify' || c.action === 'play' || c.action === 'open' || c.action === 'theme' ? [] : [[c.selector, c.action, c.routes] as const]));
		// Controls the site lists as opening a layer no ARIA marks (a button whose click sets a dialog's open state).
		const opens = listed.filter((c) => c.action === 'open').map((c) => ({ selector: c.selector, routes: c.routes }));
		// Controls the site lists as switching attributes in place (lib/site/controls.json, action "toggle").
		const switchSelectors = listed.filter((c) => c.action === 'toggle').map((c) => c.selector);
		// TanStack tables are read when the usage inventory finds a TanStack table library (or there is none).
		const usesTables = await readFile(join(state, 'usage.json'), 'utf8').then((text) => /"library":\s*"@tanstack\/(react|vue|solid|svelte)-table"/.test(text), () => true);
		// The old site's not-found page, from a path no route has: the new app's 404 page.
		const captureRoutes = options.only?.length ? routes : [...routes, NOT_FOUND];
		let capturedCount = 0;
		const pageOf = new Map(
			captureRoutes.map((route) => {
				const ref = limit(() => capturePage(browser, options.old, route, at('captures'))).then(({ status }): CapturedRef => {
					log(`captured ${++capturedCount}/${captureRoutes.length} ${route}`);
					return { route, status, load: () => capturePage(browser, options.old, route, at('captures')) };
				});
				ref.catch(() => {});
				return [route, ref] as const;
			}),
		);
		// Controls whose use the demo's own state answers (Send, Replay, Show more): every use recorded frame by frame.
		const plays = listed.filter((x) => x.action === 'play').flatMap((c) => routes.filter((x) => !c.routes || new RegExp(c.routes).test(x)).map((r) => [c.selector, r] as const));
		const scenesRead = eachLimited(limit, plays, ([selector, r]) => captureScenes(browser, options.old, r, at('scenes'), selector)).then((got) => plays.forEach(([selector, r], i) => scenes.set(r, [...(scenes.get(r) ?? []), ...got[i]!.scenes.map((scene) => ({ scene, listed: selector }))])));
		scenesRead.catch(() => {});
		// Controls whose use shows a notification (a toast), on the routes the site lists them for.
		const notifies = listed.filter((x) => x.action === 'notify').flatMap((c) => routes.filter((r) => !c.routes || new RegExp(c.routes).test(r)).map((r) => [c.selector, r] as const));
		const notifiesRead = eachLimited(limit, notifies, ([selector, r]) => captureNotifications(browser, options.old, r, at('toggles'), [selector])).then((got) => notifies.forEach(([, r], i) => notified.set(r, [...(notified.get(r) ?? []), ...got[i]!.notifications])));
		notifiesRead.catch(() => {});
		// A control a demo's recorded uses play is the scene's, not a disclosure's: its reveal is not planned.
		const played = (route: string) => new Set((scenes.get(route) ?? []).flatMap(({ scene }) => scene.edges.map((e) => e.control.replace(/#\d+$/, ''))));
		const same = (a: Reveal, b: Reveal) => a.key === b.key && a.action === b.action && a.viewport === b.viewport && a.path.join('.') === b.path.join('.');
		const empty = /(<div\b[^>]*\bdata-slot="combobox-empty"[^>]*>)(<\/div>)/;
		const reachOf = (r: Reveal): EmptyReach | undefined => (!r.sig ? undefined : r.added.some((a) => a.html.includes('data-trigger="ComboBox"')) ? 'beside' : r.added.some((a) => /<input\b(?=[^>]*\bdata-rac\b)(?=[^>]*aria-autocomplete="list")(?![^>]*role="combobox")/.test(a.html)) ? 'opens' : undefined);
		const racCalendar = (html: string) => /role="application"[^>]*data-rac=|data-rac=[^>]*role="application"/.test(html);
		let revealedCount = 0;
		let toggledCount = 0;
		// Everything one route's old page is read for, each capture taking a slot of the limit; set in the maps in route order once all are in.
		interface RouteFacts {
			reveals?: readonly Reveal[];
			racEmpties?: readonly ComboboxEmpty[];
			accordions?: readonly AccordionMode[];
			hoverDelays?: readonly HoverDelay[];
			carousels?: readonly CarouselFacts[];
			chart?: boolean;
			sliders?: readonly SliderFacts[];
			dated?: boolean;
			clock?: readonly ClockMark[];
			charts?: readonly ChartFacts[];
			scrollers?: readonly ScrollerOpening[];
			pickers?: CapturedPickers;
			racCalendars?: CapturedCalendars;
			tables?: readonly CapturedTable[];
			toggles?: readonly ToggleGroup[];
			switches?: readonly Switch[];
			floating?: readonly QwikFloating[];
		}
		const readRoute = async (route: string): Promise<RouteFacts> => {
			const ref = await pageOf.get(route)!;
			const facts: RouteFacts = {};
			// The capture (a few MB of JSON) is read once for all of this route's steps.
			let loaded: Promise<CapturedPage> | undefined;
			const page = () => (loaded ??= ref.load());
			let reveals: readonly Reveal[] | undefined;
			if (reveal && routes.includes(route)) {
				const own = await limit(() => captureRouteReveals(browser, options.old, route, at('reveals'), { extra, opens }));
				log(`revealed ${++revealedCount}/${routes.length} ${route} (${own.reveals.length} controls)`);
				await scenesRead;
				reveals = own.reveals.filter((r) => !r.sig || !played(route).has(r.sig));
			}
			// React Aria tooltips and previews, on the pages whose server HTML has React Aria controls.
			if (reveal && (await page()).server.includes('data-react-aria-pressable')) {
				const hovers = [...(await limit(() => captureRacHovers(browser, options.old, route, at('reveals')))), ...((await page()).server.includes('role="combobox"') ? await limit(() => captureRacComboInputs(browser, options.old, route, at('reveals'))) : [])];
				const own = reveals ?? [];
				const added = hovers.filter((h) => !own.some((r) => r.key === h.key));
				if (added.length) reveals = [...own, ...added];
			}
			if (reveal && reveals) {
				// React Aria and Radix submenus, where a revealed menu has an item that opens one; Radix's menus come back with their
				// sub-triggers keyed, in place of the menus' own reveals.
				const from = reveals;
				const submenus = await limit(() => captureRacSubmenus(browser, options.old, route, at('reveals'), from));
				const radix = await limit(() => captureRadixSubmenus(browser, options.old, route, at('reveals'), from));
				const all = [...from.map((r) => radix.find((m) => same(m, r)) ?? r), ...[...submenus, ...radix].filter((s) => !from.some((r) => same(r, s) || r.key === s.key))];
				if (all.length !== from.length || radix.length) reveals = all;
				// Base UI submenus: the menus they open from come back with their triggers keyed, in place of the menus' own reveals.
				const before = reveals;
				const base = await limit(() => captureBaseSubmenus(browser, options.old, route, at('reveals'), before));
				if (base.length) reveals = [...before.map((r) => base.find((m) => same(m, r)) ?? r), ...base.filter((s) => !before.some((r) => same(r, s) || r.key === s.key))];
				// Controls inside content another revealed in place (a file tree's nested folders), after the ones holding them.
				const outer = reveals;
				const nested = await limit(() => captureNestedReveals(browser, options.old, route, at('reveals'), outer));
				if (nested.length) reveals = [...outer, ...nested.filter((n) => !outer.some((r) => r.key === n.key))];
			}
			// What each Base UI combobox shows once nothing matches, into the empty element of the layer it opens.
			const comboboxes = (reveals ?? []).filter((r) => r.sig && r.added.some((a) => empty.test(a.html))).map((r) => ({ sig: r.sig!, nth: r.nth ?? 0 }));
			if (reveals && comboboxes.length) {
				const found = (await limit(() => captureComboboxEmpties(browser, options.old, route, at('toggles'), comboboxes))).empties;
				reveals = reveals.map((r) => {
					const html = found.find((f) => f.sig === r.sig && f.nth === (r.nth ?? 0))?.html;
					return html ? { ...r, added: r.added.map((a) => ({ ...a, html: a.html.replace(empty, (_, open: string, close: string) => `${open}${html}${close}`) })) } : r;
				});
			}
			// What each React Aria collection an input filters shows once nothing matches: a ComboBox's listbox and an
			// Autocomplete's in a layer, hidden at the end of the layer's collection; an Autocomplete's in the page, likewise there.
			if (reveal && ref.status === 200) {
				const own = reveals ?? [];
				const fromLayers = own.flatMap((r) => (reachOf(r) ? [{ sig: r.sig!, nth: r.nth ?? 0, reach: reachOf(r)! }] : []));
				const settled = (await page()).settled.desktop ?? Object.values((await page()).settled)[0] ?? '';
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
				if (fromLayers.length || inPage.length) {
					const found = (await limit(() => captureRacEmpties(browser, options.old, route, at('toggles'), [...fromLayers, ...inPage]))).empties;
					if (found.length) {
						const mine = (f: ComboboxEmpty) => inPage.some((x) => x.sig === f.sig && x.nth === f.nth);
						facts.racEmpties = found.filter(mine);
						reveals = own.map((r) => {
							const html = reachOf(r) && found.find((f) => !mine(f) && f.sig === r.sig && f.nth === (r.nth ?? 0))?.html;
							return html ? { ...r, added: r.added.map((a) => (/role="(listbox|menu)"/.test(a.html) ? { ...a, html: withEmptyState(a.html, html) } : a)) } : r;
						});
					}
				}
			}
			// Whether each accordion lets several items be open, where one revealed an item's content; React Aria's accordion
			// panels are in the page while collapsed, so expanding one reveals nothing: its server HTML says it is there.
			if (reveals?.some((r) => r.sig?.includes('|accordion-trigger|')) || /data-slot="accordion"[^>]*data-rac=/.test((await page()).server)) facts.accordions = (await limit(() => captureAccordions(browser, options.old, route, at('toggles')))).accordions;
			// Hover cards, among them those whose trigger renders its child (its data-slot is the child's).
			const others = (reveals ?? []).filter((r) => r.action === 'hover' && r.sig && !r.sig.includes('|hover-card-trigger|') && r.added.some((a) => /data-slot="hover-card-content"/.test(a.html))).map((r) => ({ sig: r.sig!, nth: r.nth ?? 0 }));
			if (reveals && (others.length || reveals.some((r) => r.sig?.includes('|hover-card-trigger|')))) facts.hoverDelays = (await limit(() => captureHoverDelays(browser, options.old, route, at('toggles'), others))).delays;
			if (ref.status === 200) {
				const settled = Object.values((await page()).settled);
				// Each carousel's alignment and autoplay, each chart's states (sweeping the pointer over it), each slider's step,
				// and the dates the page computes in the visitor's browser, read again at a later clock and behind UTC.
				if (settled.some((html) => html.includes('data-slot="carousel"'))) facts.carousels = (await limit(() => captureCarousels(browser, options.old, route, at('toggles')))).carousels;
				facts.chart = settled.some((html) => html.includes('recharts-wrapper'));
				if (settled.some((html) => /data-slot="slider"/.test(html) && html.includes('role="slider"'))) facts.sliders = (await limit(() => captureSliders(browser, options.old, route, at('toggles')))).sliders;
				facts.dated = settled.some((html) => DATED.test(html));
				if (facts.dated) facts.clock = (await limit(() => captureClock(browser, options.old, route, at('clock')))).marks;
				if (facts.chart) facts.charts = (await limit(() => captureCharts(browser, options.old, route, at('toggles')))).charts;
			}
			// Where the old page placed each Qwik UI floating panel: its gutter and side are in no markup.
			if (reveal && ref.status === 200 && /\sq:container=/.test((await page()).server) && (await page()).server.includes('data-floating')) facts.floating = (await limit(() => captureQwikFloating(browser, options.old, route, at('toggles')))).panels;
			if ((await page()).server.includes('data-slot="message-scroller"')) facts.scrollers = (await limit(() => captureScrollers(browser, options.old, route, at('toggles')))).scrollers;
			if (reveal && ref.status === 200) {
				const settled = Object.values((await page()).settled);
				// What each react-day-picker calendar was given, where the settled page shows a month grid or a control's layer does (a date picker's trigger: read opened).
				const openers = (reveals ?? []).filter((r) => r.sig && r.added.some((a) => a.into === 'body' && /<table[^>]*role="grid"[^>]*aria-multiselectable/.test(a.html))).map((r) => ({ sig: r.sig!, nth: r.nth ?? 0 }));
				if (openers.length || settled.some((html) => /<table[^>]*role="grid"[^>]*aria-multiselectable/.test(html))) facts.pickers = await limit(() => captureDayPickers(browser, options.old, route, at('day-pickers'), openers));
				// What each React Aria calendar was given, where the settled page shows one.
				const opening = (reveals ?? []).filter((r) => r.sig && r.added.some((a) => racCalendar(a.html))).map((r) => ({ sig: r.sig!, nth: r.nth ?? 0, path: r.path }));
				if (opening.length || settled.some(racCalendar)) facts.racCalendars = await limit(() => captureRacCalendars(browser, options.old, route, at('rac-calendars'), opening));
				// What each TanStack table was given and showed in each state, where the settled page has a table.
				if (usesTables && settled.some(mayHoldTable)) {
					const captured = await limit(() => captureTables(browser, options.old, route, at('tables'), log));
					for (const why of captured.skipped) log(`  table on ${route} not read: ${why}`);
					if (captured.tables.length) facts.tables = captured.tables;
				}
			}
			if (reveal && routes.includes(route)) {
				const toggles = await limit(() => captureToggles(browser, options.old, route, at('toggles'))).catch((error: Error) => ({ route, groups: [] as ToggleGroup[], skipped: [`the route: ${error.message.split('\n')[0]}`] }));
				toggledCount++;
				if (toggles.groups.length) log(`toggles ${toggledCount}/${routes.length} ${route} (${toggles.groups.length} groups)`);
				facts.toggles = toggles.groups;
				if (switchSelectors.length) {
					const switches = await limit(() => captureSwitches(browser, options.old, route, at('toggles'), switchSelectors)).catch((error: Error) => ({ route, switches: [] as Switch[], skipped: [`the route: ${error.message.split('\n')[0]}`] }));
					if (switches.switches.length) log(`switches ${route} (${switches.switches.length})`);
					facts.switches = switches.switches;
				}
			}
			facts.reveals = reveals;
			return facts;
		};
		const read = await Promise.all(captureRoutes.map((route) => reading(() => readRoute(route))));
		captures = await Promise.all(captureRoutes.map((route) => pageOf.get(route)!));
		await Promise.all([scenesRead, notifiesRead]);
		captureRoutes.forEach((route, i) => {
			const f = read[i]!;
			if (f.reveals) revealed.set(route, f.reveals);
			if (f.racEmpties) racPageEmpties.set(route, f.racEmpties);
			if (f.accordions) accordionModes.set(route, f.accordions);
			if (f.hoverDelays) hoverDelays.set(route, f.hoverDelays);
			if (f.carousels) carouselFacts.set(route, f.carousels);
			if (f.chart) chartRoutes.push(route);
			if (f.sliders) sliderFacts.set(route, f.sliders);
			if (f.dated) clockRoutes.push(route);
			if (f.clock) clockMarks.set(route, f.clock);
			if (f.charts) chartFacts.set(route, f.charts);
			if (f.scrollers) scrollerOpenings.set(route, f.scrollers);
			if (f.pickers) pickers.set(route, f.pickers);
			if (f.racCalendars) racCalendarsRead.set(route, f.racCalendars);
			if (f.tables) tablesRead.set(route, f.tables);
			if (f.toggles) toggled.set(route, f.toggles);
			if (f.switches) switched.set(route, f.switches);
			if (f.floating?.length) floatingRead.set(route, f.floating);
		});
		// Options revealed without a link (a command palette's items): what choosing each did, once per control and options shown.
		const choosing = new Map<string, { route: string; reveal: Reveal }>();
		const shownOn: { route: string; reveal: Reveal; run: string }[] = [];
		for (const [route, reveals] of revealed)
			for (const reveal of reveals) {
				if (!reveal.added.some((a) => a.into === 'body' && /cmdk-item|role="option"|role="menuitem"/.test(a.html))) continue;
				// A Base UI listbox's values are its page's: generated ids repeat across pages.
				const listbox = reveal.added.some((a) => a.html.includes('data-base-ui-portal') && a.html.includes('role="listbox"'));
				const run = listbox ? `${route}|${reveal.key}` : `${reveal.key}|${optionsShown(reveal)}`;
				if (!choosing.has(run)) choosing.set(run, { route, reveal });
				shownOn.push({ route, reveal, run });
			}
		const runs = [...choosing];
		const chosenBy = new Map(await Promise.all(runs.map(async ([run, { route, reveal }]) => [run, await captureChoices(browser, options.old, route, reveal, at('choices'), log, limit)] as const)));
		for (const { route, reveal, run } of shownOn) {
			const found = chosenBy.get(run)!;
			const copied = Object.entries(found).filter(([, c]) => c.copied !== undefined);
			if (copied.length && !choices[reveal.key]) choices[reveal.key] = Object.fromEntries(copied);
			// Where an option went is its page's (written on the option), as is what it gave a form.
			const chosen = Object.entries(found).filter(([, c]) => c.href !== undefined || c.value !== undefined || c.shown !== undefined);
			if (chosen.length) optionValues[`${route}|${reveal.key}`] = Object.fromEntries(chosen);
		}
		// Forms last: every other capture reads the old site before any form is submitted to it.
		if (reveal) {
			const forms = await eachLimited(limit, routes, (route) => captureForms(browser, options.old, route, at('toggles')).catch(() => ({ route, forms: [] })));
			for (const f of forms) submitted.set(f.route, f.forms);
		}
	} finally {
		await browser.close();
	}
	if (options.captureOnly) return { routes: [], dropped: {}, shared: [], assets: { copied: 0, missing: [] }, styles: 0, unconverted: [], endpoints: [], unported: [] };
	const usagePath = join(state, 'usage.json');
	const librariesPath = join(state, 'libraries.json');
	const hasUsage = await stat(usagePath).then(() => true, () => false);
	const hasLibraries = await stat(librariesPath).then(() => true, () => false);
	// The usage inventory first; a data-slot it has no part for (a component it did not reach) from plan's libraries.json.
	const resolver: PartResolver = options.resolver ?? (hasUsage ? (hasLibraries ? combined(await usageResolver(usagePath, options.source), await sourceSlotResolver(librariesPath, options.source)) : await usageResolver(usagePath, options.source)) : await sourceSlotResolver(librariesPath, options.source));
	useResolver(resolver);
	useMarkupLibraries(hasLibraries ? ((JSON.parse(await readFile(librariesPath, 'utf8')) as { libraries?: { name: string }[] }).libraries ?? []).map((l) => l.name) : []);
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
	const tables = new TablePlan();
	for (const [route, captured] of tablesRead) tables.expect(route, captured);
	layerTables = tables;
	qwikHandlers = undefined;
	for (const ref of captures) {
		if (ref.status !== 200 || qwikHandlers) continue;
		if (!frameworkBuilds((await ref.load()).server).some((b) => b.framework === 'Qwik')) break;
		const symbols = await readQwikSymbols(options.old);
		if (symbols) {
			qwikHandlers = { symbols, marks: QWIK_HANDLER_MARKS, contexts: QWIK_CONTEXT_PROPS };
			log(`Qwik handlers named from the old build's q-manifest.json: ${symbols.size} symbols`);
		}
		break;
	}
	for (const ref of captures) {
		if (ref.status !== 200 && !(ref.route === NOT_FOUND && ref.status === 404)) {
			unconverted.push({ route: ref.route, reason: `the old site answered ${ref.status} while capturing` });
			continue;
		}
		racLayer.route = ref.route;
		templatePorts.routes = [ref.route];
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
	templatePorts.routes = undefined;
	let placedFloating = 0;
	for (const [route, panels] of floatingRead) {
		const p = prepared.get(route);
		if (p) placedFloating += applyQwikFloating(p.root.parentNode as Element, panels);
	}
	if (placedFloating) log(`Qwik UI floating panels placed as the old page placed them: ${placedFloating}`);
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
	useMounts([...(await readFile(join(app, 'lib', 'site', 'mounts.json'), 'utf8').then((t) => JSON.parse(t) as string[], () => [])), ...([...carouselFacts.values()].some((f) => f.some((c) => c.autoplay)) ? ['data-mm-autoplay'] : []), ...([...clockMarks.values()].some((m) => m.length) ? ['data-mm-clock'] : [])]);
	const tabs = new TabsPlan();
	let tabGroups = 0;
	for (const p of prepared.values()) tabGroups += tabs.add(p.root, isRadixTab, (panel) => panelContent.get(panel));
	if (tabGroups) log(`tabs on Markless state: ${tabGroups} tab lists`);
	const baseTabs = new BaseTabsPlan();
	let baseTabGroups = 0;
	const emitPanel = (html: string) => emitChildren(parseFragment(html) as unknown as Element, { bind: (el) => bindParts(el, templatePorts) });
	for (const [route, p] of prepared) {
		templatePorts.routes = [route];
		baseTabGroups += baseTabs.add(p.root, isBaseTab, (t) => basePanels.get(t), emitPanel);
	}
	templatePorts.routes = undefined;
	if (baseTabGroups) {
		log(`Base UI tab lists on Markless state: ${baseTabGroups}`);
		templatePorts.plan('radix/roving');
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
	for (const [route, p] of prepared) {
		const facts = sliderFacts.get(route) ?? [];
		const locate = facts.length ? locator(p.root.parentNode as Element) : undefined;
		for (const f of facts) {
			const el = locate!(f.sig, f.nth);
			if (el) el.attrs = [...el.attrs.filter((a) => a.name !== 'data-mm-step'), { name: 'data-mm-step', value: String(f.step) }];
		}
	}
	let clocked = 0;
	for (const [route, p] of prepared) {
		const marks = clockMarks.get(route) ?? [];
		const locate = marks.length ? locator(p.root.parentNode as Element) : undefined;
		const wrappers = [...walk(p.root.parentNode as Element)].filter((e) => (attr(e, 'class') ?? '').split(/\s+/).includes('recharts-wrapper'));
		for (const mark of marks) {
			const el = mark.chart !== undefined ? chartRegion(wrappers[mark.chart]) : locate!(mark.sig, mark.nth);
			if (!el) continue;
			el.attrs = [...el.attrs.filter((a) => a.name !== 'data-mm-clock'), { name: 'data-mm-clock', value: JSON.stringify(mark.rules) }];
			clocked++;
		}
	}
	if (clocked) {
		usedPorts.plan('clock');
		log(`dates that follow the visitor's clock or time zone: ${clocked}`);
	}
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
	// A closed control whose panel is empty and got no captured content opens nothing on the port: never silently.
	for (const [route, p] of prepared) {
		const ids = new Map<string, Element>();
		for (const el of walk(p.root)) if (attr(el, 'id')) ids.set(attr(el, 'id')!, el);
		const missing = [...walk(p.root)].filter((t) => {
			if (attr(t, 'aria-expanded') !== 'false') return false;
			const panel = ids.get(attr(t, 'aria-controls') ?? '');
			return panel !== undefined && !elementChildren(panel).length && !panelContent.has(panel);
		});
		if (missing.length) log(`  ${route}: ${missing.length} control(s) open a panel no capture filled: ${missing.slice(0, 5).map((t) => JSON.stringify(sigOf(t))).join(', ')}${missing.length > 5 ? ', …' : ''}`);
	}
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
		templatePorts.plan('day-picker');
	}
	const insertedGroups = insertedDisclosures.add(inserted, [...prepared.values()].map((p) => p.root), multiple);
	if (insertedGroups) log(`disclosures that mount their content in place, on Markless state: ${insertedGroups}`);
	if (disclosureGroups || insertedGroups) templatePorts.plan('panel-motion');
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
	if (handledForms.size) templatePorts.plan('form');
	const notifyPlan = new NotifyPlan();
	let notifyCount = 0;
	for (const [route, p] of prepared) notifyCount += notifyPlan.add(notified.get(route) ?? [], locator(p.root.parentNode as Element), (html, bind) => emitChildren(parseFragment(html) as unknown as Element, bind ? { bind } : {}));
	if (notifyCount) log(`notifications on Markless state: ${notifyCount}`);
	if (notifyPlan.sonner) templatePorts.add('sonner');
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
		templatePorts.plan('switch');
	}
	const checkables = new CheckablePlan();
	let checkableGroups = 0;
	const emitHtml = (html: string) => emitChildren(parseFragment(html) as unknown as Element, { dropped: (what) => dropped.set(`${what}: not writable as an attribute`, (dropped.get(`${what}: not writable as an attribute`) ?? 0) + 1) });
	// TanStack tables: their state, rows and controls are one table-core state; their checkboxes are no toggles
	// of their own, and a React Aria table among them is no row selection of its own.
	let tableCount = 0;
	for (const [route, p] of prepared) tableCount += tables.add(route, locator(p.root.parentNode as Element));
	for (const line of tables.notes) log(`  ${line}`);
	const tableNotesPlaced = tables.notes.length;
	if (tableCount) log(`TanStack tables on Markless state: ${tableCount}`);
	if (tables.focusesControls) templatePorts.plan('toggle');
	// React Aria tables whose checkboxes choose rows: the rows, the checkboxes and select-all are one state.
	const racTables = new RacTablePlan();
	let racTableCount = 0;
	for (const [route, p] of prepared) racTableCount += racTables.add(p.root, toggled.get(route) ?? [], locator(p.root.parentNode as Element), emitHtml, (el) => tables.claims(el));
	if (racTableCount) log(`React Aria tables with row selection on Markless state: ${racTableCount}`);
	for (const [route, p] of prepared) checkableGroups += checkables.add(p.root, toggled.get(route) ?? [], locator(p.root.parentNode as Element), emitHtml, (el) => racTables.claims(el) || tables.claims(el));
	if (checkableGroups) {
		log(`checkboxes, switches, toggles and radio groups on Markless state: ${checkableGroups}`);
		templatePorts.plan('toggle');
	}
	const charts = new ChartPlan();
	let chartCount = 0;
	for (const [route, p] of prepared) chartCount += charts.add(p.root, chartFacts.get(route) ?? [], locator(p.root.parentNode as Element), emitHtml);
	if (chartCount) {
		log(`recharts charts on Markless state: ${chartCount} charts`);
		styles.set(MOTION_FILE, CHART_CSS);
		templatePorts.plan('recharts');
	}
	let racCalendarCount = 0;
	for (const [route, p] of prepared) {
		const captured = racCalendarsRead.get(route);
		if (captured?.calendars.length) racCalendarCount += racCalendars.add(route, captured, (locale) => racMessages.get(locale), locator(p.root.parentNode as Element), emitHtml);
	}
	for (const line of racCalendars.notes) log(`  ${line}`);
	if (racCalendarCount) {
		log(`React Aria calendars on Markless state: ${racCalendarCount}`);
		templatePorts.plan('react-aria/calendar');
	}
	handledBy((el) => checkables.bind(el) !== undefined || baseTabs.bind(el) !== undefined || insertedDisclosures.bind(el) !== undefined || dayPickers.handles(el) || racCalendars.within(el) || racTables.bind(el) !== undefined || tables.claims(el));
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
	for (const [route, p] of prepared) {
		templatePorts.routes = [route];
		selects.add(p.root, (el) => portFor(el) === 'base-ui/select' || portFor(el) === 'radix/select' || (racSelect(el) && !racCalendars.within(el)), emitTrigger);
	}
	templatePorts.routes = undefined;
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
		templatePorts.plan('scene');
		templatePorts.plan('form');
	}
	for (const why of scenePlan.refused) log(`  recorded uses not played: ${why}`);
	for (const [container, r] of replaced) {
		replacedParts.set(container, { append: r.markup });
		for (const child of childrenOf(container)) if (isElement(child)) replacedParts.set(child, mergeBindings(replacedParts.get(child), { extra: [`data-mm-before=${JSON.stringify(r.key)}`] })!);
		replacedParts.set(r.trigger, mergeBindings(replacedParts.get(r.trigger), { extra: [`data-mm-replace=${JSON.stringify(r.key)}`] })!);
	}
	const withAppend = (el: Element, binding: Binding | undefined): Binding | undefined => {
		// A site component the site lists for a page element renders it, and what it shows, itself.
		const standIn = pageComponentOf(el, siteComponents);
		if (standIn) return { replace: `<${componentName(standIn)} />` };
		const markup = appended.get(el);
		binding = mergeBindings(replacedParts.get(el), binding);
		const keyed = triggerKeys.get(el);
		binding = mergeBindings(binding, keyed ? { extra: [`data-mm-key=${JSON.stringify(keyed)}`] } : undefined);
		binding = mergeBindings(binding, portAttributes(el));
		// A React Aria DisclosureGroup that lets several Disclosures be expanded (allowsMultipleExpanded writes nothing).
		binding = mergeBindings(binding, multipleAccordions.has(el) && attr(el, 'data-rac') !== undefined ? { extra: ['data-mm-multiple=""'] } : undefined);
		binding = mergeBindings(binding, portFor(el) === 'shadcn/message-scroller' ? bindScroller(el) : undefined);
		// The port a plan's binding needs belongs to the routes being emitted.
		const needs = <T>(found: T, ...ports: string[]): T => {
			if (found) for (const port of ports) templatePorts.add(port);
			return found;
		};
		needs(attr(el, 'data-mm-clock') !== undefined, 'clock');
		binding = mergeBindings(needs(dayPickers.bind(el), 'day-picker'), binding);
		binding = mergeBindings(needs(racCalendars.bind(el), 'react-aria/calendar'), binding);
		binding = mergeBindings(racTables.bind(el), binding);
		binding = mergeBindings(tables.bind(el), binding);
		const own = mergeBindings(needs(scenePlan.bind(el), 'scene', 'form'), mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(mergeBindings(tabs.bind(el), needs(baseTabs.bind(el), 'radix/roving')), needs(charts.bind(el), 'recharts')), needs(disclosures.bind(el), 'panel-motion')), needs(insertedDisclosures.bind(el), 'panel-motion')), selects.bind(el)), needs(checkables.bind(el), 'toggle')), needs(switchPlan.bind(el), 'switch')), mergeBindings(notifyPlan.bind(el), handledForms.has(el) ? needs(formBinding, 'form') : undefined)), mergeBindings(otps.bind(el), binding)), bindMount(el)));
		return markup ? mergeBindings(own, { append: markup }) : own;
	};
	void appendOf;
	// A table's rows and hideable cells are emitted by its plan, with every plan's bindings, as their page is.
	tables.emitter = (el, declarations) => emitElement(el, { declarations, bind: (x) => withAppend(x, bindParts(x, usedPorts)), dropped: (what) => dropped.set(`${what}: not writable as an attribute`, (dropped.get(`${what}: not writable as an attribute`) ?? 0) + 1) });
	tables.emitHtml = emitHtml;
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
		const own = [appended.get(el), replaced.get(el)?.markup, replaceKeys.get(el), groupContent.get(el), panelContent.get(el), panel && JSON.stringify(panel), insertedInto.get(el), triggerKeys.get(el), measuredOf(el) && JSON.stringify(measuredOf(el)), notifyPlan.nameOf(el), scenePlan.nameOf(el), tables.nameOf(el), charts.bind(el)?.declare?.[0]].filter((x): x is string => Boolean(x));
		return own.length ? own.join('\u0001') : undefined;
	};
	// Their bind is a lookup; a TanStack table's emits its rows on first bind, so it is left out.
	const statePlans = [tabs, baseTabs, disclosures, insertedDisclosures, selects, checkables, switchPlan, notifyPlan, otps, scenePlan, dayPickers, racCalendars, racTables, charts];
	const declares = (el: Element) => statePlans.flatMap((plan) => plan.bind(el)?.declare ?? []);
	const factored: Factored = factor(new Map([...prepared].map(([route, p]) => [route, p.root])), { bind: (el) => withAppend(el, bindParts(el, usedPorts)), extra: ownContent, enter: (routes) => (usedPorts.routes = routes), declares });
	usedPorts.routes = undefined;
	const pathnames = [...new Set(htmlRoutes.map((r) => pathOf(r)))];
	const folders = folderSet(pathnames);
	const written = new Map<string, string>();
	const out: ConvertedRoute[] = [];
	const byFile = new Map<string, { route: string; search: string; markup: string; parts: PartUse[]; declarations: string[]; layers: readonly string[] }[]>();
	const noteDropped = (what: string) => dropped.set(`${what}: not writable as an attribute`, (dropped.get(`${what}: not writable as an attribute`) ?? 0) + 1);
	const layers = layerTable(new Map([...prepared].map(([route, p]) => [route, p.layers])));
	const bodyAfter = bodyAfterModule(bodyParts, (el) => bindParts(el, usedPorts), noteDropped, ownAfter.size > 0);
	// Markless wires no handler and no state the Document renders: a page's own body children that hold some (a header
	// with a site component, a control on Markless state) are rendered by the page, in their place around its root.
	const wired = (x: Element) => {
		if (pageComponentOf(x, siteComponents)) return true;
		const b = withAppend(x, undefined);
		return Boolean(b?.declare?.length || b?.extra?.some((e) => /^on[A-Z]/.test(e)));
	};
	for (const [route, extras] of pagesWiring(bodyParts.extras, wired)) if (!ownExtras.has(route)) ownExtras.set(route, extras);
	for (const [route, p] of prepared) {
		const url = new URL(route, options.old);
		const file = route === NOT_FOUND ? 'pages/404.tsrx' : pageFile(url.pathname, folders);
		const parts: PartUse[] = [];
		const declarations: string[] = [];
		onRoute(route);
		usedPorts.routes = [route];
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
		// A toaster nests a repeat in a repeat's rows, which Markless renders only outside a branch: it stays in the old order between them.
		const after: { markup: string; toaster?: boolean }[] = [];
		const owned = ownAfter.get(route);
		if (bodyAfter && owned?.length) {
			let from = 0;
			for (const i of owned) {
				for (let j = from; j < i; j++) after.push({ markup: `<BodyAfter${j} route={${lit(route)}} />` });
				const el = bodyParts.after[i]!.byRoute.get(route)!;
				after.push({ markup: emitElement(el, { declarations, bind: (x) => mergeBindings(bindParts(x, usedPorts), notifyPlan.bind(x)), dropped: noteDropped }), toaster: notifyPlan.rendersToasts(el) });
				from = i + 1;
			}
			for (let j = from; j < bodyParts.after.length; j++) after.push({ markup: `<BodyAfter${j} route={${lit(route)}} />` });
		} else if (bodyAfter) after.push({ markup: `<BodyAfter route={${lit(route)}} />` });
		const emitOwn = (el: Element) =>
			emitElement(el, {
				declarations,
				bind: (x) => {
					const own = withAppend(x, bindParts(x, usedPorts));
					return x === el && !own?.replace ? mergeBindings(own, { extra: [ROOT_HANDLERS] }) : own;
				},
				dropped: noteDropped,
			});
		const ownedExtras = ownExtras.get(route) ?? [];
		const leading = ownedExtras.filter((el) => p.before.includes(el) && !notifyPlan.rendersToasts(el)).map(emitOwn).join('');
		for (const el of ownedExtras.filter((x) => !p.before.includes(x) || notifyPlan.rendersToasts(x))) after.push({ markup: emitOwn(el), toaster: notifyPlan.rendersToasts(el) });
		// A copy control's text rides in the page's HTML as the old page's props did (an attribute: template content must be literal).
		const copied = Object.entries(p.clipboard).map(([key, text]) => `<template data-mm-clipboard=${lit(key)} data-mm-text={${lit(text)}}></template>`).join('');
		after.push(...pageLayers.map((n) => ({ markup: `<${n} />` })), { markup: copied });
		const body = pageBody(rootMarkup, after, PAGE_SHOWN);
		const markup = leading ? `<>@if (${PAGE_SHOWN}) { <>${leading}</> }${body === rootMarkup ? `@if (${PAGE_SHOWN}) { ${rootMarkup} }` : body}</>` : body;
		const list = byFile.get(file) ?? [];
		list.push({ route, search: url.search, markup, parts, declarations, layers: pageLayers });
		byFile.set(file, list);
	}
	usedPorts.routes = undefined;
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

	if (docsearchConfigured()) usedPorts.add('docsearch');
	if (lateFontPages.size) usedPorts.add('late-fonts');
	const siteParts = await stat(join(app, 'lib', 'site', 'parts.ts')).then(() => true, () => false);
	// The library parts of what each page holds outside its root count for that page, before its registry and handlers are written.
	for (const [route, els] of bodyParts.extras) {
		usedPorts.routes = [route];
		for (const el of els) for (const x of walk(el)) bindParts(x, usedPorts);
	}
	usedPorts.routes = undefined;
	const appDir = (from: string) => relative(dirname(join(app, from)), app).replace(/^(?!\.)/, './');
	// Each page's root delegates to a registry of only the ports its own markup, the regions it shares and its layers use.
	const registrySets = new Map<string, ReadonlySet<string>>();
	const registry = (modules: ReadonlySet<string>) => {
		const path = registryPath(modules);
		registrySets.set(path, modules);
		return path;
	};
	const shared: Registries = { behave: () => registry(new Set(usedPorts)), mount: () => registry(new Set(mountingPorts(usedPorts))) };
	for (const [file, source] of written) {
		const ports = usedPorts.of(byFile.get(file)!.map((v) => v.route));
		const handlers = bodyHandlers(ports, siteParts).join(' ');
		written.set(file, withSiteImports(withPartImports(source.replaceAll(ROOT_HANDLERS, handlers), partsDir(file), { ...shared, behave: () => registry(ports) }), siteComponents, appDir(file)));
	}
	if (!options.only?.length) await rm(join(app, 'pages'), { recursive: true, force: true });
	await rm(join(app, 'components', 'converted'), { recursive: true, force: true });
	for (const [file, source] of written) {
		await mkdir(dirname(join(app, file)), { recursive: true });
		await writeFile(join(app, file), appUrlDeclaration(source));
	}
	for (const component of factored.components) {
		const imports = [...new Set(sharedParts.map((part) => part.import(partsDir(component.file))))].join('\n');
		await mkdir(dirname(join(app, component.file)), { recursive: true });
		await writeFile(join(app, component.file), appUrlDeclaration(withSiteImports(withPartImports(imports ? component.source.replace('\n', `\n${imports}\n`) : component.source, partsDir(component.file), shared), siteComponents, appDir(component.file))));
	}
	const documentParts: PartUse[] = [];
	// DocSearch's button keys and loading on intent run from the head, before the first paint and the first press.
	const shell = docsearchShell();
	const headScripts: (string | { name: string; attributes: string })[] = docsearchConfigured() ? ['DOCSEARCH_SCRIPT', ...(shell ? [{ name: 'DOCSEARCH_SHELL', attributes: 'type="text/html" data-mm-docsearch-shell' }] : [])] : [];
	if (headScripts.length) documentParts.push({ part: 'docsearch', import: (dir) => `import { DOCSEARCH_SCRIPT${shell ? ', shellScript' : ''} } from '${dir}/docsearch.ts';${shell ? `\nimport DOCSEARCH_SHELL_HTML from '${dir}/docsearch-shell.ts';\nconst DOCSEARCH_SHELL = shellScript(DOCSEARCH_SHELL_HTML);` : ''}` });
	if (fontPreloadCount) log(`font preloads: ${fontPreloadCount} first-screen web fonts that only a stylesheet named are preloaded`);
	if (lateFontPages.size) {
		headScripts.push('LATE_FONTS_SCRIPT');
		documentParts.push({ part: 'late-fonts', import: (dir) => `import { LATE_FONTS_SCRIPT } from '${dir}/late-fonts.ts';` });
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
	await writeParts(app, usedPorts, choices, tables.used ? ['tanstack-table'] : []);
	await writeRegistries(app, registrySets.values(), !options.only?.length);
	const tableSpecs = tables.specsModule();
	if (tableSpecs) await writeFile(join(app, 'lib', 'parts', TABLE_SPECS), tableSpecs);
	if (shell) await writeFile(join(app, 'lib', 'parts', 'docsearch-shell.ts'), `// Generated by markless-migrate convert: DocSearch's dialog as the old site first draws it on a press (captured by plan).\nexport default ${JSON.stringify(shell)};\n`);
	if (pickerCount) await writeFile(join(app, 'lib', 'parts', CONFIGS_MODULE), dayPickers.configsModule());
	if (racCalendars.placed) await writeFile(join(app, 'lib', 'parts', RAC_CONFIGS_MODULE), racCalendars.configsModule());
	await mkdir(join(app, 'components', 'converted'), { recursive: true });
	await mkdir(join(app, 'components', 'converted', 'layers'), { recursive: true });
	for (const layer of layers.files) await writeFile(join(app, 'components', 'converted', layer.file), appUrlDeclaration(withPartImports(layer.source, partsDir(join('components', 'converted', layer.file)), shared)));
	// The calendar views date pickers share between their popover and their trigger, at page scope.
	const sharedPickers = dayPickers.sharedModule(`../../lib/parts/${CONFIGS_MODULE}`, '../../lib/parts');
	if (sharedPickers) await writeFile(join(app, 'components', 'converted', 'day-pickers.tsrx'), sharedPickers);
	const sharedTables = tables.sharedModule('../../lib/parts');
	if (sharedTables) await writeFile(join(app, 'components', 'converted', TABLES_SHARED), sharedTables);
	await rm(join(app, 'public', '_converted', 'layers'), { recursive: true, force: true });
	for (const layer of layers.served) {
		await mkdir(dirname(join(app, 'public', layer.path)), { recursive: true });
		await writeFile(join(app, 'public', layer.path), layer.html);
	}
	// What a page holds outside its own root (a header that differs per page) is bound as the root is: its library parts
	// recorded and the site's page components in place.
	const extrasBind = (el: Element): Binding | undefined => {
		const standIn = pageComponentOf(el, siteComponents);
		return standIn ? { replace: `<${componentName(standIn)} />` } : bindParts(el, usedPorts);
	};
	const extrasFile = join('components', 'converted', 'body-extras.tsrx');
	await writeFile(join(app, extrasFile), appUrlDeclaration(withSiteImports(extrasModule({ ...bodyParts, extras: new Map([...bodyParts.extras].filter(([route]) => !ownExtras.has(route))) }, noteDropped, layers, extrasBind), siteComponents, appDir(extrasFile))));
	if (bodyAfter) await writeFile(join(app, 'components', 'converted', 'body-after.tsrx'), appUrlDeclaration(bodyAfter));
	for (const line of tables.notes.slice(tableNotesPlaced)) log(`  ${line}; it renders as the old page showed it`);
	log(`layers: ${layers.files.length} distinct, each compiled once; ${layers.everywhere.length} on every page; ${layers.served.length} served as files and mounted on use`);
	await mkdir(join(app, 'lib', 'parts'), { recursive: true });
	await rm(join(app, 'lib', 'parts', 'clipboard'), { recursive: true, force: true });
	await rm(join(app, 'lib', 'parts', 'clipboard.ts'), { force: true });
	if (unplaced.length) log(`${unplaced.length} revealed contents not placed (no Markless state drives them yet): ${unplaced.slice(0, 3).join('; ')}`);
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
	const pageOf = new Map(out.map((r) => [r.route, r.page]));
	const used = await usedStylesheets(app, new Map([...prepared].flatMap(([route, p]) => (pageOf.has(route) ? [[route, { page: pageOf.get(route)!, head: p.head, texts: [JSON.stringify(p.htmlAttrs), JSON.stringify(p.bodyAttrs), JSON.stringify(p.head)], withheld: p.lateFontPaths }] as const] : []))));
	for (const [route, head] of used.heads) prepared.get(route)!.head.splice(0, Infinity, ...head);
	if (used.sheets) log(`stylesheets: each page links only the rules its markup can match, ${used.sheets} cut sheets (${Math.round(used.bytes[1] / 1024)} of ${Math.round(used.bytes[0] / 1024)} kB across the pages)`);
	await writeFile(join(app, 'heads.ts'), headModule(prepared));
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
		const routing = await writeRouting({ app, source: options.source, old: options.old, ...(options.fallthrough ? { fallthrough: options.fallthrough } : {}), pages: [...new Set(out.map((r) => new URL(r.route, options.old).pathname))], endpoints: handlerRoutes, redirects: scanned.redirects ?? [], builtPaths: [...builtPaths], observed: planned.allRoutes ?? [], log });
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
