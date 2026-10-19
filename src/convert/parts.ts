import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attr, type Element } from './dom.ts';
import type { Binding } from './tsrx.ts';
import type { PartResolver } from './usage.ts';

/** The Markless ports of library behaviour, each written once and used on every site whose markup shows that library. */
export const PARTS_DIR = fileURLToPath(new URL('../../parts/', import.meta.url));

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
}

const slot = (el: Element) => attr(el, 'data-slot') ?? '';
const radix = (el: Element) => el.attrs.some((a) => a.name.startsWith('data-radix-') || ((a.name === 'id' || a.name === 'aria-controls') && a.value.startsWith('radix-')));

export const PORTS: readonly Port[] = [
	{ module: 'radix/tabs', library: 'radix-ui', exports: ['Tabs.Root', 'Tabs.List', 'Tabs.Trigger', 'Tabs.Content'], events: ['click', 'keydown'], locate: (el) => radix(el) },
];

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

/** Records the ports an element of the old page needs. Behaviour is bound once on the body, so no element gets attributes. */
export function bindParts(el: Element, uses: PartUse[] | Set<string>): Binding | undefined {
	const s = slot(el);
	if (!s || !resolver) return undefined;
	const candidates = resolver.candidates(s);
	let placed = false;
	for (const port of PORTS) {
		if (!candidates.some((c) => c.library === port.library && port.exports.includes(c.export)) || !port.locate(el)) continue;
		placed = true;
		if (uses instanceof Set) uses.add(port.module);
		else if (!uses.some((u) => u.part === port.module)) uses.push({ part: port.module, import: () => '' });
	}
	if (!placed && route) for (const c of candidates) (UNPORTED.get(`${c.library} ${c.export}`) ?? UNPORTED.set(`${c.library} ${c.export}`, new Set()).get(`${c.library} ${c.export}`)!).add(route);
	return undefined;
}

/** The body's event attributes, one per event a used port listens to. */
export function bodyHandlers(modules: ReadonlySet<string>, hasSite: boolean): string[] {
	const events = new Set<PartEvent>(hasSite ? ['click', 'keydown', 'pointerover', 'pointerout', 'pointerdown', 'focusin', 'focusout', 'contextmenu', 'input'] : []);
	for (const port of PORTS) if (modules.has(port.module)) for (const e of port.events) events.add(e);
	const prop = (e: PartEvent) => `on${{ click: 'Click', keydown: 'KeyDown', pointerover: 'PointerOver', pointerout: 'PointerOut', pointerdown: 'PointerDown', focusin: 'FocusIn', focusout: 'FocusOut', contextmenu: 'ContextMenu', input: 'Input' }[e]}`;
	return [...events].map((e) => `${prop(e)}={(event) => behave(event)}`);
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
export async function writeParts(app: string, modules: ReadonlySet<string>): Promise<{ readonly files: string[]; readonly site: boolean }> {
	const out = join(app, 'lib', 'parts');
	const files: string[] = [];
	const copy = async (rel: string) => {
		await mkdir(dirname(join(out, rel)), { recursive: true });
		await copyFile(join(PARTS_DIR, rel), join(out, rel));
		files.push(rel);
	};
	for (const entry of await readdir(PARTS_DIR)) if (entry.endsWith('.ts')) await copy(entry);
	for (const module of modules) await copy(`${module}.ts`);
	const site = await exists(join(app, 'lib', 'site', 'parts.ts'));
	const used = [...modules].sort();
	const registry = `// Generated by markless-migrate convert: the library ports this site's markup uses; change the converter, not this file.
import type { Part } from './index.ts';
${site ? "import { SITE_PARTS } from '../site/parts.ts';\n" : ''}${used.map((m, i) => `import * as port${i} from './${m}.ts';`).join('\n')}

export const PARTS: readonly Part[] = [${[...(site ? ['...SITE_PARTS'] : []), ...used.map((_, i) => `port${i}`)].join(', ')}];
`;
	await writeFile(join(out, 'registry.ts'), registry);
	return { files, site };
}
