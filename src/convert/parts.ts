import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attr, type Element } from './dom.ts';
import type { Binding } from './tsrx.ts';
import type { PartResolver, PartUsage } from './usage.ts';

/** The Markless ports of library behaviour, each written once and used on every site whose markup shows that library. */
export const PARTS_DIR = fileURLToPath(new URL('../../parts/', import.meta.url));

/** The framework-agnostic packages the ports run on, at the versions the ported libraries were certified with. */
export const PART_DEPENDENCIES: Readonly<Record<string, string>> = { '@floating-ui/dom': '1.7.6' };

export type PartEvent = 'click' | 'keydown' | 'pointerover' | 'pointerout' | 'pointerdown' | 'focusin' | 'focusout' | 'contextmenu' | 'input';

export interface Port {
	/** The port's module under `parts/`, without `.ts`. */
	readonly module: string;
	/** The package the port replaces, as the old source imports it. */
	readonly library: string;
	/** The exports it implements, as the source names them off the package. */
	readonly exports: readonly string[];
	readonly events: readonly PartEvent[];
	/**
	 * Among the parts the source renders with an element's `data-slot`, whether this element is this library's: the markup
	 * contract tells Radix's tab from Base UI's when a site renders both. The source decides the part; this only places it.
	 */
	locate(el: Element): boolean;
	/** Other modules under `parts/` it imports. */
	readonly needs?: readonly string[];
}

const slot = (el: Element) => attr(el, 'data-slot') ?? '';

// A layer's generated ids are renamed from its content (index.ts layerIds): which library generated one is still read
// from the id it had.
const generated = new WeakMap<Element, string>();
export function renamedFrom(el: Element, id: string): void {
	if (!generated.has(el)) generated.set(el, id);
}
const idOf = (el: Element) => generated.get(el) ?? attr(el, 'id') ?? '';
const base = (el: Element) => el.attrs.some((a) => a.name.startsWith('data-base-ui')) || /^base-ui-/.test(idOf(el));
// Radix writes data-state on its parts (a closed tooltip's trigger carries nothing else); Base UI, cmdk and React Aria never do.
const radix = (el: Element) => /^radix-/.test(generated.get(el) ?? '') || el.attrs.some((a) => a.name.startsWith('data-radix-') || a.name === 'data-state' || ((a.name === 'id' || a.name === 'aria-controls') && a.value.startsWith('radix-')));

const ids = (el: Element) => [generated.get(el) ?? '', ...el.attrs.filter((a) => a.name === 'id' || a.name.startsWith('aria-')).map((a) => a.value)].join(' ');
// The markup each library writes on every part it renders, so a part of one is never taken for another's.
const SIGNATURES: Readonly<Record<string, (el: Element) => boolean>> = {
	cmdk: (el) => el.attrs.some((a) => a.name.startsWith('cmdk-')),
	'radix-ui': radix,
	'@base-ui/react': (el) => el.attrs.some((a) => a.name.startsWith('data-base-ui')) || /\bbase-ui-/.test(ids(el)),
	'react-aria-components': (el) => el.attrs.some((a) => a.name === 'data-rac' || a.name.startsWith('data-react-aria')) || /react-aria/.test(ids(el)),
};

/** The source's candidates an element can be: those of the library whose markup it carries, or, carrying none, of the libraries that write no signature. */
function narrow(el: Element, candidates: readonly PartUsage[]): PartUsage[] {
	const signed = Object.entries(SIGNATURES).filter(([, test]) => test(el)).map(([lib]) => lib);
	return candidates.filter((c) => (signed.length ? signed.includes(c.library) : !(c.library in SIGNATURES)));
}

export const PORTS: readonly Port[] = [
	// Radix Tabs are Markless state (convert's TabsPlan); the part is only the roving focus the triggers' keydown calls.
	{ module: 'radix/roving', library: 'radix-ui', exports: ['Tabs.Root', 'Tabs.List', 'Tabs.Trigger', 'Tabs.Content', 'ToggleGroup.Root', 'ToggleGroup.Item', 'RadioGroup.Root', 'RadioGroup.Item'], events: ['focusin', 'keydown'], locate: (el) => radix(el) },
	{ module: 'radix/dialog', library: 'radix-ui', needs: ['radix/dialog-engine'], exports: ['Dialog.Root', 'Dialog.Trigger', 'Dialog.Content', 'Dialog.Overlay', 'Dialog.Close', 'AlertDialog.Root', 'AlertDialog.Trigger', 'AlertDialog.Content', 'AlertDialog.Cancel', 'AlertDialog.Action'], events: ['click'], locate: (el) => radix(el) },
	{ module: 'cmdk', library: 'cmdk', exports: ['Command', 'Command.Input', 'Command.List', 'Command.Item', 'Command.Group', 'Command.Empty'], events: ['input', 'keydown', 'pointerover', 'click'], locate: () => true, needs: ['choices'] },
	{ module: 'radix/popover', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden', 'remove-scroll'], exports: ['Popover.Root', 'Popover.Trigger', 'Popover.Content', 'Popover.Portal', 'Popover.Anchor', 'Popover.Close'], events: ['click'], locate: (el) => radix(el) },
	{ module: 'radix/dropdown-menu', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden', 'remove-scroll'], exports: ['DropdownMenu.Root', 'DropdownMenu.Trigger', 'DropdownMenu.Content', 'DropdownMenu.Item', 'Menubar.Root', 'Menubar.Menu', 'Menubar.Trigger', 'Menubar.Content', 'Menubar.Item'], events: ['pointerdown', 'click', 'pointerover', 'keydown'], locate: (el) => radix(el) },
	{ module: 'base-ui/popover', library: '@base-ui/react', exports: ['Popover.Root', 'Popover.Trigger', 'Popover.Popup', 'Popover.Positioner', 'Popover.Portal', 'Popover.Close'], events: ['click'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	{ module: 'base-ui/menu', library: '@base-ui/react', exports: ['Menu.Root', 'Menu.Trigger', 'Menu.Popup', 'Menu.Item'], events: ['pointerdown', 'click', 'pointerover', 'keydown'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	{ module: 'base-ui/tooltip', library: '@base-ui/react', exports: ['Tooltip.Root', 'Tooltip.Trigger', 'Tooltip.Popup'], events: ['pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	{ module: 'radix/select', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden', 'remove-scroll'], exports: ['Select.Root', 'Select.Trigger', 'Select.Value', 'Select.Content', 'Select.Viewport', 'Select.Item', 'Select.ItemText', 'Select.ItemIndicator', 'Select.Group', 'Select.Label', 'Select.Separator', 'Select.Icon', 'Select.Portal', 'Select.ScrollUpButton', 'Select.ScrollDownButton'], events: ['pointerdown', 'click', 'keydown'], locate: (el) => radix(el) },
	{ module: 'slider', library: 'radix-ui', exports: ['Slider.Root', 'Slider.Track', 'Slider.Range', 'Slider.Thumb'], events: ['pointerdown', 'keydown'], locate: (el) => radix(el) || attr(el, 'data-slot')?.startsWith('slider') === true },
	{ module: 'slider', library: '@base-ui/react', exports: ['Slider.Root', 'Slider.Control', 'Slider.Track', 'Slider.Indicator', 'Slider.Thumb'], events: ['pointerdown', 'keydown'], locate: (el) => base(el) || el.attrs.some((a) => a.name.startsWith('data-base-ui-slider')) },
	{ module: 'radix/tooltip', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden', 'remove-scroll'], exports: ['Tooltip.Root', 'Tooltip.Trigger', 'Tooltip.Content', 'Tooltip.Portal', 'Tooltip.Provider', 'Tooltip.Arrow'], events: ['pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout'], locate: (el) => radix(el) || attr(el, 'data-slot') === 'tooltip-trigger' },
	{ module: 'resizable', library: 'react-resizable-panels', exports: ['Group', 'Panel', 'Separator', 'PanelGroup', 'PanelResizeHandle'], events: ['keydown', 'pointerdown', 'pointerover', 'pointerout'], locate: (el) => el.attrs.some((a) => a.name === 'data-group' || a.name === 'data-panel' || a.name === 'data-separator') },
	{ module: 'shadcn/message-scroller', library: '@shadcn/react', exports: ['MessageScroller.Provider', 'MessageScroller.Root', 'MessageScroller.Viewport', 'MessageScroller.Content', 'MessageScroller.Item', 'MessageScroller.Button'], events: ['click', 'keydown'], locate: (el) => slot(el).startsWith('message-scroller') },
	{ module: 'radix/hover-card', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden', 'remove-scroll'], exports: ['HoverCard.Root', 'HoverCard.Trigger', 'HoverCard.Content', 'HoverCard.Portal'], events: ['pointerover', 'pointerout', 'focusin', 'focusout'], locate: (el) => radix(el) },
	{ module: 'base-ui/combobox', library: '@base-ui/react', exports: ['Combobox.Root', 'Combobox.Input', 'Combobox.Trigger', 'Combobox.Popup', 'Combobox.Positioner', 'Combobox.List', 'Combobox.Item', 'Combobox.Empty', 'Combobox.Portal'], events: ['pointerdown', 'click', 'pointerover', 'input', 'keydown'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	{ module: 'radix/context-menu', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden', 'remove-scroll', 'radix/dropdown-menu'], exports: ['ContextMenu.Root', 'ContextMenu.Trigger', 'ContextMenu.Content', 'ContextMenu.Item', 'ContextMenu.Portal'], events: ['contextmenu', 'click', 'pointerover', 'keydown'], locate: (el) => radix(el) },
	{ module: 'base-ui/navigation-menu', library: '@base-ui/react', exports: ['NavigationMenu.Root', 'NavigationMenu.List', 'NavigationMenu.Item', 'NavigationMenu.Trigger', 'NavigationMenu.Content', 'NavigationMenu.Portal', 'NavigationMenu.Positioner', 'NavigationMenu.Popup', 'NavigationMenu.Viewport'], events: ['pointerover', 'pointerout', 'click'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	{ module: 'base-ui/preview-card', library: '@base-ui/react', exports: ['PreviewCard.Root', 'PreviewCard.Trigger', 'PreviewCard.Popup', 'PreviewCard.Positioner', 'PreviewCard.Portal'], events: ['pointerover', 'pointerout', 'focusin', 'focusout'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	{ module: 'base-ui/context-menu', library: '@base-ui/react', exports: ['ContextMenu.Root', 'ContextMenu.Trigger', 'ContextMenu.Popup', 'ContextMenu.Positioner', 'ContextMenu.Portal', 'ContextMenu.Item'], events: ['contextmenu', 'click'], locate: (el) => base(el) || attr(el, 'data-slot') === 'context-menu-trigger', needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition', 'base-ui/menu'] },
	{ module: 'base-ui/dialog', library: '@base-ui/react', exports: ['Dialog.Root', 'Dialog.Trigger', 'Dialog.Popup', 'Dialog.Portal', 'Dialog.Backdrop', 'Dialog.Close', 'AlertDialog.Root', 'AlertDialog.Trigger', 'AlertDialog.Popup', 'AlertDialog.Close', 'Drawer.Root', 'Drawer.Trigger', 'Drawer.Popup', 'Drawer.Close'], events: ['click'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition', 'aria-hidden'] },
	{ module: 'base-ui/select', library: '@base-ui/react', exports: ['Select.Root', 'Select.Trigger', 'Select.Value', 'Select.Popup', 'Select.Item'], events: ['pointerdown', 'click', 'pointerover', 'keydown'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	// shadcn's Carousel drives Embla through useEmblaCarousel: the slots its file writes are the call's (usage.ts).
	{ module: 'carousel', library: 'embla-carousel-react', exports: ['default', 'useEmblaCarousel'], events: ['click', 'keydown', 'pointerdown'], locate: (el) => attr(el, 'data-slot') === 'carousel' },
	// input-otp's slots are Markless state (convert's OtpPlan); the part runs the input's handlers and dispatches it.
	{ module: 'input-otp', library: 'input-otp', exports: ['OTPInput'], events: ['focusin', 'focusout', 'input'], locate: () => true },
	// recharts' tooltips and active points are Markless state (convert's ChartPlan); the part follows the pointer and keys.
	{ module: 'recharts', library: 'recharts', exports: ['Tooltip'], events: ['pointerover', 'focusin', 'focusout', 'keydown'], locate: () => false },
	// Radix Collapsible and Accordion are Markless state (convert's DisclosurePlan); the part measures and ends exits.
	{ module: 'radix/disclosure-motion', library: 'radix-ui', needs: ['panel-motion'], exports: ['Collapsible.Root', 'Collapsible.CollapsibleTrigger', 'Collapsible.CollapsibleContent', 'Collapsible.Trigger', 'Collapsible.Content', 'Accordion.Root', 'Accordion.Item', 'Accordion.Header', 'Accordion.Trigger', 'Accordion.Content'], events: [], locate: (el) => radix(el) },
	// Base UI Collapsible and Accordion are Markless state (convert's InsertedDisclosurePlan); the part measures and ends exits.
	{ module: 'panel-motion', library: '@base-ui/react', exports: ['Collapsible.Root', 'Collapsible.Trigger', 'Collapsible.Panel', 'Accordion.Root', 'Accordion.Item', 'Accordion.Header', 'Accordion.Trigger', 'Accordion.Panel'], events: [], locate: base },
	{ module: 'shadcn/questionnaire', library: '@shadcn/react', exports: ['Questionnaire.Root', 'Questionnaire.Progress', 'Questionnaire.Item', 'Questionnaire.Title', 'Questionnaire.Description', 'Questionnaire.Choices', 'Questionnaire.Choice', 'Questionnaire.ChoiceInput', 'Questionnaire.ChoiceLabel', 'Questionnaire.ChoiceShortcut', 'Questionnaire.Input', 'Questionnaire.Error', 'Questionnaire.Previous', 'Questionnaire.Skip', 'Questionnaire.Next', 'Questionnaire.Submit'], events: ['click', 'keydown', 'input'], locate: (el) => slot(el).startsWith('questionnaire') },
];

// Exports whose element behaves as the native element it renders (a button, an input, a label, a heading, an icon's
// svg): what a browser does with that element is all they do, so they need no port and are not reported as unported.
const NATIVE: Readonly<Record<string, ReadonlySet<string>>> = {
	'shadcn/ui': new Set(['Button', 'Label', 'Separator', 'Input', 'Textarea', 'FieldGroup', 'Field', 'FieldLabel', 'FieldDescription', 'Card', 'Badge', 'Kbd']),
	'@base-ui/react': new Set(['Button', 'Input', 'Dialog.Title', 'Dialog.Description', 'AlertDialog.Title', 'AlertDialog.Description', 'Drawer.Title', 'Drawer.Description', 'Progress.Label', 'Progress.Value', 'Separator']),
	'radix-ui': new Set(['Dialog.Title', 'Dialog.Description', 'AlertDialog.Title', 'AlertDialog.Description', 'Label.Root', 'Separator.Root']),
	'lucide-react': new Set(['*']),
};
const native = (c: PartUsage) => NATIVE[c.library]?.has(c.export) === true || NATIVE[c.library]?.has('*') === true;

export interface PartUse {
	readonly part: string;
	import(dir: string): string;
}

let resolver: PartResolver | undefined;
let route = '';
/** The parts the source renders on a page that no port implements, by `library export`, with the routes that show them. */
export const UNPORTED = new Map<string, Set<string>>();

/** Names the page being emitted, so an unported part is reported with it. */
export function onRoute(next: string): void {
	route = next;
}

/** Sets where the converter learns which library part renders each element: the old source's analysis. */
export function useResolver(next: PartResolver): void {
	resolver = next;
}

let mounts: readonly string[] = [];

/** The attributes whose elements the site's own parts mount when visible (`lib/site/mounts.json`). */
export function useMounts(next: readonly string[]): void {
	mounts = next;
}

/** The visibility hook for an element one of the site's parts mounts. */
export function bindMount(el: Element): Binding | undefined {
	const hit = mounts.find((name) => el.attrs.some((a) => a.name === name));
	return hit ? { extra: [`onVisible={() => mount(${JSON.stringify(hit)})}`] } : undefined;
}

// Props a port reads from the element, as the source passes them where it renders that export: written as data-mm-*.
// `from`: where the source passes them, when that renders no element of its own (a Root, the site's wrapper of it),
// first found first.
const PORT_PROPS: readonly { readonly library: string; readonly export: string; readonly from?: readonly (readonly [string, string])[]; readonly props: readonly string[] }[] = [
	{ library: 'react-resizable-panels', export: 'Panel', props: ['minSize', 'maxSize'] },
	{ library: 'radix-ui', export: 'HoverCard.Trigger', from: [['radix-ui', 'HoverCard.Root'], ['shadcn/ui', 'HoverCard']], props: ['openDelay', 'closeDelay'] },
	{ library: 'embla-carousel-react', export: 'default', props: ['align'] },
	{ library: '@base-ui/react', export: 'PreviewCard.Trigger', from: [['@base-ui/react', 'PreviewCard.Trigger'], ['shadcn/ui', 'HoverCardTrigger']], props: ['delay', 'closeDelay'] },
];

let measured: ReadonlyMap<Element, Readonly<Record<string, string>>> = new Map();
/** Props the old page showed an element itself has (a hover card's own delays), ahead of what the source gives the export. */
export function useMeasuredProps(props: ReadonlyMap<Element, Readonly<Record<string, string>>>): void {
	measured = props;
}

/** The props a port needs on an element, from what the old page showed of it, or the source's literal or parameter default. */
export function portAttributes(el: Element): Binding | undefined {
	const extra: string[] = [];
	for (const c of candidatesOf(el)) {
		const known = PORT_PROPS.find((p) => p.library === c.library && p.export === c.export);
		for (const prop of known?.props ?? []) {
			const value = measured.get(el)?.[prop] ?? (known!.from ?? [[c.library, c.export] as const]).map(([lib, exp]) => resolver?.prop(lib, exp, prop)).find((v) => v !== undefined);
			if (value !== undefined && (/^-?\d+(\.\d+)?%?$/.test(value) || /^(start|center|end)$/.test(value))) extra.push(`data-mm-${prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}=${JSON.stringify(value.replace(/%$/, ''))}`);
		}
	}
	// A hover card trigger rendered through its child has no HoverCard part of its own: the delays the old page showed.
	const own = measured.get(el);
	if (!extra.length && own?.openDelay !== undefined) extra.push(`data-mm-open-delay=${JSON.stringify(own.openDelay)}`, `data-mm-delay=${JSON.stringify(own.delay ?? own.openDelay)}`, `data-mm-close-delay=${JSON.stringify(own.closeDelay ?? '')}`);
	return extra.length ? { extra } : undefined;
}

/** The source's candidates for an element, narrowed to the library whose markup it carries. */
export function candidatesOf(el: Element, of: PartResolver | undefined = resolver): PartUsage[] {
	const s = slot(el);
	return s && of ? narrow(el, of.candidates(s)) : [];
}

/** The port the source's analysis gives an element, if any. */
export function portFor(el: Element): string | undefined {
	const s = slot(el);
	if (!s || !resolver) return undefined;
	const candidates = narrow(el, resolver.candidates(s));
	return PORTS.find((port) => candidates.some((c) => c.library === port.library && port.exports.includes(c.export)) && port.locate(el))?.module;
}

let handled: (el: Element) => boolean = () => false;
/** Elements a converter plan already puts on Markless state (a checkbox), which are not reported as unported. */
export function handledBy(test: (el: Element) => boolean): void {
	handled = test;
}

/** Records the ports an element of the old page needs. Behaviour is bound once on the body, so no element gets attributes. */
export function bindParts(el: Element, uses: PartUse[] | Set<string>): Binding | undefined {
	const s = slot(el);
	if (!s || !resolver) return undefined;
	const candidates = narrow(el, resolver.candidates(s));
	let placed = false;
	for (const port of PORTS) {
		if (!candidates.some((c) => c.library === port.library && port.exports.includes(c.export)) || !port.locate(el)) continue;
		placed = true;
		if (uses instanceof Set) uses.add(port.module);
		else if (!uses.some((u) => u.part === port.module)) uses.push({ part: port.module, import: () => '' });
	}
	if (!placed && route && !handled(el)) for (const c of candidates.filter((x) => !native(x))) (UNPORTED.get(`${c.library} ${c.export}`) ?? UNPORTED.set(`${c.library} ${c.export}`, new Set()).get(`${c.library} ${c.export}`)!).add(route);
	return undefined;
}

/** The page root's event attributes, one per event a used port listens to, and the document listeners installed when idle. */
export function bodyHandlers(modules: ReadonlySet<string>, hasSite: boolean): string[] {
	const events = new Set<PartEvent>(hasSite ? ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout', 'contextmenu', 'input'] : []);
	for (const port of PORTS) if (modules.has(port.module)) for (const e of port.events) events.add(e);
	const prop = (e: PartEvent) => `on${{ click: 'Click', keydown: 'KeyDown', pointerover: 'PointerOver', pointerout: 'PointerOut', pointerdown: 'PointerDown', focusin: 'FocusIn', focusout: 'FocusOut', contextmenu: 'ContextMenu', input: 'Input' }[e]}`;
	return [...[...events].map((e) => `${prop(e)}={(event) => behave(event)}`), 'onIdle={() => listen()}'];
}

async function exists(path: string): Promise<boolean> {
	return stat(path).then(
		() => true,
		() => false,
	);
}

/**
 * Copies the used ports, and the shared modules they import, into the app's `lib/parts/`, with a registry listing them
 * after the app's own parts (`lib/site/parts.ts`, written for the site's own components) when there are any.
 */
export async function writeParts(app: string, modules: ReadonlySet<string>, choices: Readonly<Record<string, unknown>> = {}): Promise<{ readonly files: string[]; readonly site: boolean }> {
	const out = join(app, 'lib', 'parts');
	const files: string[] = [];
	const copy = async (rel: string) => {
		await mkdir(dirname(join(out, rel)), { recursive: true });
		await copyFile(join(PARTS_DIR, rel), join(out, rel));
		files.push(rel);
	};
	await copy('index.ts');
	await copy('reveal.ts');
	if (await exists(join(app, 'lib', 'site', 'parts.ts'))) await copy('next-themes.ts');
	const all = new Set<string>();
	const add = (m: string) => {
		if (all.has(m)) return;
		all.add(m);
		for (const n of PORTS.find((p) => p.module === m)?.needs ?? []) add(n);
	};
	for (const m of modules) add(m);
	for (const module of all) if (module !== 'choices') await copy(`${module}.ts`);
	if (all.has('choices') || !(await exists(join(out, 'choices.ts')))) await writeFile(join(out, 'choices.ts'), `// Generated by markless-migrate convert: what choosing each option did on the old page; change the converter, not this file.\nexport const CHOICES: Readonly<Record<string, Readonly<Record<string, { readonly href?: string; readonly copied?: string }>>>> = ${JSON.stringify(choices)};\n`);
	const site = await exists(join(app, 'lib', 'site', 'parts.ts'));
	const manifest = JSON.parse(await readFile(join(app, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
	let added = false;
	for (const [name, version] of Object.entries(PART_DEPENDENCIES)) {
		if (manifest.dependencies?.[name]) continue;
		(manifest.dependencies ??= {})[name] = version;
		added = true;
	}
	if (added) await writeFile(join(app, 'package.json'), `${JSON.stringify(manifest, null, '\t')}\n`);
	const used = [...modules].sort();
	const registry = `// Generated by markless-migrate convert: the library ports this site's markup uses; change the converter, not this file.
import type { Part } from './index.ts';
${site ? "import { SITE_PARTS } from '../site/parts.ts';\n" : ''}${used.map((m, i) => `import * as port${i} from './${m}.ts';`).join('\n')}

export const PARTS: readonly Part[] = [${[...(site ? ['...SITE_PARTS'] : []), ...used.map((_, i) => `port${i}`)].join(', ')}];
`;
	await writeFile(join(out, 'registry.ts'), registry);
	return { files, site };
}
