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
const base = (el: Element) => el.attrs.some((a) => a.name.startsWith('data-base-ui')) || /^base-ui-/.test(attr(el, 'id') ?? '');
// Radix writes data-state on its parts (a closed tooltip's trigger carries nothing else); Base UI, cmdk and React Aria never do.
const radix = (el: Element) => el.attrs.some((a) => a.name.startsWith('data-radix-') || a.name === 'data-state' || ((a.name === 'id' || a.name === 'aria-controls') && a.value.startsWith('radix-')));

const ids = (el: Element) => el.attrs.filter((a) => a.name === 'id' || a.name.startsWith('aria-')).map((a) => a.value).join(' ');
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
	{ module: 'radix/roving', library: 'radix-ui', exports: ['Tabs.Root', 'Tabs.List', 'Tabs.Trigger', 'Tabs.Content'], events: [], locate: (el) => radix(el) },
	{ module: 'radix/dialog', library: 'radix-ui', needs: ['radix/dialog-engine'], exports: ['Dialog.Root', 'Dialog.Trigger', 'Dialog.Content', 'Dialog.Overlay', 'Dialog.Close', 'AlertDialog.Root', 'AlertDialog.Trigger', 'AlertDialog.Content', 'AlertDialog.Cancel', 'AlertDialog.Action'], events: ['click'], locate: (el) => radix(el) },
	{ module: 'cmdk', library: 'cmdk', exports: ['Command', 'Command.Input', 'Command.List', 'Command.Item', 'Command.Group', 'Command.Empty'], events: ['input', 'keydown', 'pointerover', 'click'], locate: () => true, needs: ['choices'] },
	{ module: 'radix/popover', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden'], exports: ['Popover.Root', 'Popover.Trigger', 'Popover.Content', 'Popover.Portal', 'Popover.Anchor', 'Popover.Close'], events: ['click'], locate: (el) => radix(el) },
	{ module: 'radix/dropdown-menu', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden'], exports: ['DropdownMenu.Root', 'DropdownMenu.Trigger', 'DropdownMenu.Content', 'DropdownMenu.Item'], events: ['pointerdown', 'click', 'pointerover', 'keydown'], locate: (el) => radix(el) },
	{ module: 'base-ui/popover', library: '@base-ui/react', exports: ['Popover.Root', 'Popover.Trigger', 'Popover.Popup', 'Popover.Positioner', 'Popover.Portal', 'Popover.Close'], events: ['click'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	{ module: 'base-ui/menu', library: '@base-ui/react', exports: ['Menu.Root', 'Menu.Trigger', 'Menu.Popup', 'Menu.Item'], events: ['pointerdown', 'click', 'pointerover', 'keydown'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	{ module: 'base-ui/tooltip', library: '@base-ui/react', exports: ['Tooltip.Root', 'Tooltip.Trigger', 'Tooltip.Popup'], events: ['pointerover', 'pointerout', 'focusin', 'focusout'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	{ module: 'radix/select', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden'], exports: ['Select.Root', 'Select.Trigger', 'Select.Value', 'Select.Content', 'Select.Viewport', 'Select.Item', 'Select.ItemText', 'Select.ItemIndicator', 'Select.Group', 'Select.Label', 'Select.Separator', 'Select.Icon', 'Select.Portal', 'Select.ScrollUpButton', 'Select.ScrollDownButton'], events: ['pointerdown', 'click', 'keydown'], locate: (el) => radix(el) },
	{ module: 'slider', library: 'radix-ui', exports: ['Slider.Root', 'Slider.Track', 'Slider.Range', 'Slider.Thumb'], events: ['pointerdown', 'keydown'], locate: (el) => radix(el) || attr(el, 'data-slot')?.startsWith('slider') === true },
	{ module: 'slider', library: '@base-ui/react', exports: ['Slider.Root', 'Slider.Control', 'Slider.Track', 'Slider.Indicator', 'Slider.Thumb'], events: ['pointerdown', 'keydown'], locate: (el) => base(el) || el.attrs.some((a) => a.name.startsWith('data-base-ui-slider')) },
	{ module: 'radix/tooltip', library: 'radix-ui', needs: ['layer', 'popper', 'presence', 'aria-hidden'], exports: ['Tooltip.Root', 'Tooltip.Trigger', 'Tooltip.Content', 'Tooltip.Portal', 'Tooltip.Provider', 'Tooltip.Arrow'], events: ['pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout'], locate: (el) => radix(el) || attr(el, 'data-slot') === 'tooltip-trigger' },
	{ module: 'base-ui/dialog', library: '@base-ui/react', exports: ['Dialog.Root', 'Dialog.Trigger', 'Dialog.Popup', 'Dialog.Portal', 'Dialog.Backdrop', 'Dialog.Close', 'AlertDialog.Root', 'AlertDialog.Trigger', 'AlertDialog.Popup', 'AlertDialog.Close', 'Drawer.Root', 'Drawer.Trigger', 'Drawer.Popup', 'Drawer.Close'], events: ['click'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition', 'aria-hidden'] },
	{ module: 'base-ui/select', library: '@base-ui/react', exports: ['Select.Root', 'Select.Trigger', 'Select.Value', 'Select.Popup', 'Select.Item'], events: ['pointerdown', 'click', 'pointerover', 'keydown'], locate: base, needs: ['base-ui/popup', 'base-ui/positioner', 'base-ui/transition'] },
	// Radix Collapsible and Accordion are Markless state (convert's DisclosurePlan); the part measures and ends exits.
	{ module: 'radix/disclosure-motion', library: 'radix-ui', exports: ['Collapsible.Root', 'Collapsible.CollapsibleTrigger', 'Collapsible.CollapsibleContent', 'Collapsible.Trigger', 'Collapsible.Content', 'Accordion.Root', 'Accordion.Item', 'Accordion.Header', 'Accordion.Trigger', 'Accordion.Content'], events: [], locate: (el) => radix(el) },
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
