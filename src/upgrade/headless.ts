import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { catalogEntry } from '../library/catalog.ts';
import { paritySlug } from '../library/parity.ts';
import type { ExportUsage, LibraryUsage } from '../library/types.ts';
import type { Family } from './families.ts';

/** Headless UI libraries whose behaviour a migration ports, and that a @markless/ui family may replace. */
export const HEADLESS = /^@radix-ui\/react-|^radix-ui$|^reka-ui$|^radix-vue$|^@headlessui\/|^@base-ui-components\/|^@base-ui\/|^react-aria(-components)?$|^@react-aria\/|^@ark-ui\/|^@melt-ui\/|^melt$|^bits-ui$|^@kobalte\/|^@zag-js\//;

/**
 * What each kind of headless primitive does for every site that renders it, as its library documents it: the keys it
 * answers, the ARIA it writes and the behaviour it owns. A site that uses the primitive uses all of it.
 */
interface Protocol {
	readonly keys: readonly string[];
	readonly aria: readonly string[];
	readonly behaviours: readonly string[];
	/** Parts that, when used, add keys or ARIA of their own. */
	readonly byPart?: Readonly<Record<string, { readonly aria?: readonly string[]; readonly keys?: readonly string[] }>>;
	/** A CSS selector for the control a first interaction uses on the migrated page. */
	readonly control: string;
}

const PROTOCOLS: Readonly<Record<string, Protocol>> = {
	modal: { keys: ['Escape', 'Tab'], aria: ['role=dialog', 'aria-modal', 'aria-labelledby', 'aria-describedby', 'aria-haspopup', 'aria-expanded', 'aria-controls'], behaviours: ['outside-press', 'focus-return', 'focus-containment'], control: '[aria-haspopup="dialog"]' },
	tabs: { keys: ['ArrowLeft', 'ArrowRight', 'Home', 'End'], aria: ['role=tablist', 'role=tab', 'role=tabpanel', 'aria-selected', 'aria-controls', 'aria-labelledby'], behaviours: [], control: '[role="tab"]' },
	menu: { keys: ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'], aria: ['aria-haspopup', 'aria-expanded', 'aria-controls', 'role=menu', 'role=menuitem'], behaviours: ['typeahead', 'focus-return', 'outside-press', 'anchor-positioning'], byPart: { CheckboxItem: { aria: ['role=menuitemcheckbox', 'aria-checked'] }, RadioItem: { aria: ['role=menuitemradio', 'aria-checked'] }, Sub: { keys: ['ArrowRight', 'ArrowLeft'] }, SubTrigger: { keys: ['ArrowRight', 'ArrowLeft'] } }, control: '[aria-haspopup="menu"]' },
	select: { keys: ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'], aria: ['aria-expanded', 'aria-controls', 'role=listbox', 'role=option', 'aria-selected'], behaviours: ['typeahead', 'focus-return', 'outside-press', 'anchor-positioning'], control: '[aria-haspopup="listbox"],[role="combobox"]' },
	popover: { keys: ['Escape', 'Tab'], aria: ['aria-haspopup', 'aria-expanded', 'aria-controls', 'role=dialog'], behaviours: ['outside-press', 'focus-return', 'anchor-positioning'], control: '[aria-haspopup="dialog"][aria-controls]' },
	tooltip: { keys: ['Escape'], aria: ['role=tooltip', 'aria-describedby'], behaviours: ['anchor-positioning'], control: '[aria-describedby]' },
	radiogroup: { keys: ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', ' '], aria: ['role=radiogroup', 'role=radio', 'aria-checked'], behaviours: [], control: '[role="radio"],input[type="radio"]' },
	checkbox: { keys: [' '], aria: ['role=checkbox', 'aria-checked'], behaviours: [], control: '[role="checkbox"]' },
	toggle: { keys: [' ', 'Enter'], aria: ['role=switch', 'aria-checked'], behaviours: [], control: '[role="switch"]' },
	collapsible: { keys: ['Enter', ' '], aria: ['aria-expanded', 'aria-controls'], behaviours: [], control: '[aria-expanded][aria-controls]' },
	accordion: { keys: ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'], aria: ['aria-expanded', 'aria-controls', 'role=region'], behaviours: [], control: '[aria-expanded][aria-controls]' },
};

const FAMILY_BY_NAME: Readonly<Record<string, string>> = { dialog: 'modal', alertdialog: 'modal', sheet: 'modal', tabs: 'tabs', menu: 'menu', dropdownmenu: 'menu', contextmenu: 'menu', popover: 'popover', tooltip: 'tooltip', select: 'select', listbox: 'select', combobox: 'combobox', radiogroup: 'radiogroup', checkbox: 'checkbox', switch: 'toggle', disclosure: 'collapsible', collapsible: 'collapsible', accordion: 'accordion', slider: 'slider', toast: 'toaster' };
const PART_BY_SUFFIX: Readonly<Record<string, string>> = { root: 'root', trigger: 'trigger', button: 'trigger', content: 'content', panel: 'content', popup: 'content', positioner: '', portal: '', overlay: 'backdrop', backdrop: 'backdrop', title: 'title', description: 'description', close: 'close', item: 'item', option: 'item', list: 'list', tab: 'trigger', tablist: 'list', tabpanel: 'content', indicator: 'indicator', thumb: 'thumb' };

// Props every part takes as an element: they render or forward, they do not change what the primitive does.
const PASSTHROUGH = /^(className|class|style|children|id|key|ref|\.\.\.|title|tabIndex|role|data-.+|aria-.+|on(Click|KeyDown|KeyUp|PointerDown|PointerUp|Focus|Blur|MouseEnter|MouseLeave|Submit|Input|Change))$/;
const POSITIONING = new Set(['side', 'sideOffset', 'align', 'alignOffset', 'avoidCollisions', 'collisionPadding', 'collisionBoundary', 'sticky', 'hideWhenDetached', 'position', 'arrowPadding']);
// The library's name for a prop, and the names a @markless/ui part may give the same thing.
const ALIASES: Readonly<Record<string, readonly string[]>> = { onOpenChange: ['onChange', 'onOpenChange'], defaultOpen: ['open'], onValueChange: ['onChange'], defaultValue: ['value'], onCheckedChange: ['onChange'], defaultChecked: ['checked'], delayDuration: ['delay'], activationMode: ['selectOnFocus'], modal: ['alert'] };

export type FeatureKind = 'part' | 'prop' | 'state' | 'keyboard' | 'aria' | 'behaviour';

export interface OverlapRow {
	readonly kind: FeatureKind;
	readonly used: string;
	/** What in the family does it, or undefined when nothing does. */
	readonly family?: string;
	readonly note?: string;
}

export interface HeadlessCandidate {
	readonly library: string;
	readonly family?: string;
	/** `ported`: the new app has a port of it (lib/parity/<library>); `markless-ui`: it already renders the family. */
	readonly status: 'ported' | 'markless-ui' | 'not in the new app';
	readonly port?: string;
	readonly rows: OverlapRow[];
	readonly missing: string[];
	readonly verdict: 'swap' | 'not yet' | 'no family';
	readonly control?: string;
	readonly familySourceBytes?: number;
}

const keyName = (k: string) => (k === ' ' ? 'Space' : k);

/** The family a headless library maps to: the catalog's replacement, else its name (`@radix-ui/react-dropdown-menu` -> menu). */
export function familyFor(lib: Pick<LibraryUsage, 'name' | 'replacement'>): string | undefined {
	const ported = catalogEntry(lib.name)?.family?.name;
	if (ported) return ported;
	const replacement = (lib.replacement ?? catalogEntry(lib.name)?.replacement)?.match(/^@markless\/ui ([a-z-]+)/)?.[1];
	if (replacement) return replacement.replace(/-/g, '');
	const base = lib.name.split('/').pop()!.replace(/^react-/, '').replace(/[^a-z]/gi, '').toLowerCase();
	return FAMILY_BY_NAME[base];
}

function partFor(e: ExportUsage, family: string, lib: string): string | undefined {
	const local = (t: string) => (t === '' ? '' : t.startsWith(`${family}.`) ? t.slice(family.length + 1) : t);
	// A certified port's components are not family parts; the family the port can be swapped for maps them.
	const parts = catalogEntry(lib)?.family?.parts ?? catalogEntry(lib)?.parts;
	const mapped = (e.maps?.from ? undefined : e.maps?.target) ?? parts?.[e.name];
	if (mapped !== undefined) return local(mapped);
	const bare = e.name.replace(/^(Dialog|AlertDialog|DropdownMenu|ContextMenu|Menu|Tabs|Popover|Tooltip|Select|RadioGroup|Checkbox|Switch|Collapsible|Accordion|Disclosure|Listbox|Combobox)/, '') || 'Root';
	const viaCatalog = parts?.[bare];
	if (viaCatalog !== undefined) return local(viaCatalog);
	return PART_BY_SUFFIX[bare.toLowerCase()];
}

/** The exact state attributes and custom properties a site's CSS reads at a styled site, read from the old source line. */
async function stylingTokens(lib: LibraryUsage, oldSource: string | undefined): Promise<Map<string, string>> {
	const libraryFiles = new Set(lib.exports.flatMap((e) => [...e.imports.map((i) => i.file), ...e.sites.map((s) => s.file)]));
	const tokens = new Map<string, string>();
	const injected = new Set(lib.css.injected);
	for (const styled of lib.css.styled) {
		for (const site of styled.sites) {
			// A site in a file that never renders this library styles another one that writes the same attribute.
			if (!libraryFiles.has(site.file) && !injected.has(styled.token)) continue;
			const line = oldSource ? (await readFile(join(oldSource, site.file), 'utf8').catch(() => '')).split('\n')[site.line - 1] ?? '' : '';
			const found = [
				...[...line.matchAll(/data-\[([a-z-]+)(?:=([a-z-]+))?\]/g)].map((m) => `data-${m[1]}${m[2] ? `=${m[2]}` : ''}`),
				...[...line.matchAll(/\[data-([a-z-]+)(?:=["']?([a-z-]+))?/g)].map((m) => `data-${m[1]}${m[2] ? `=${m[2]}` : ''}`),
				...[...line.matchAll(/--radix-[a-z-]+/g)].map((m) => m[0]),
			].filter((t) => t.startsWith(styled.token) && (styled.token !== 'data-side' || /^data-side/.test(t)));
			for (const t of found.length ? found : oldSource ? [] : [styled.token]) if (!tokens.has(t)) tokens.set(t, `${site.file}:${site.line}`);
		}
	}
	return tokens;
}

// The data-state values each primitive writes: a site's rule on another value styles something else.
const STATE_VALUES: Readonly<Record<string, readonly string[]>> = { modal: ['open', 'closed'], popover: ['open', 'closed'], select: ['open', 'closed', 'checked', 'unchecked'], menu: ['open', 'closed', 'checked', 'unchecked'], tabs: ['active', 'inactive'], radiogroup: ['checked', 'unchecked'], checkbox: ['checked', 'unchecked', 'indeterminate'], toggle: ['checked', 'unchecked'], collapsible: ['open', 'closed'], accordion: ['open', 'closed'], tooltip: ['closed', 'delayed-open', 'instant-open'] };

const STATE_MAP: Readonly<Record<string, readonly string[]>> = {
	'data-state=open': ['ui-open'],
	'data-state=closed': ['ui-closed'],
	'data-state=checked': ['ui-checked', 'ui-selected'],
	'data-state=unchecked': ['ui-checked', 'ui-selected'],
	'data-state=active': ['ui-selected'],
	'data-state=inactive': ['ui-selected'],
	'data-state=on': ['ui-checked', 'ui-pressed'],
	'data-state=off': ['ui-checked', 'ui-pressed'],
	'data-state=indeterminate': ['ui-mixed'],
	'data-state': ['ui-open', 'ui-checked', 'ui-selected'],
	'data-disabled': ['ui-disabled', 'aria-disabled'],
	'data-highlighted': ['ui-highlighted', 'ui-active'],
	'data-placeholder': ['ui-placeholder'],
	'data-orientation=vertical': ['ui-vertical', 'aria-orientation'],
	'data-orientation=horizontal': ['ui-horizontal', 'aria-orientation'],
	'data-orientation': ['ui-vertical', 'ui-horizontal', 'aria-orientation'],
};

function stateEquivalent(token: string, family: Family): { family?: string; note?: string } {
	if (token.startsWith('--radix-')) {
		if (/-(trigger|anchor)-(width|height)$/.test(token) && family.behaviours.has('anchor-positioning')) return { family: 'anchor-size() in CSS, from the family\'s anchor positioning' };
		return {};
	}
	const options = STATE_MAP[token] ?? (token.startsWith('data-side') || token.startsWith('data-align') ? [`ui-${token.slice(5).split('=')[0]}`] : [`ui-${token.slice(5).split('=')[0]}`]);
	const hit = options.find((o) => family.states.has(o) || family.aria.has(o));
	return hit ? { family: hit } : {};
}

/** Every feature the old site uses of a headless library, against what the @markless/ui family supports. */
export async function overlap(lib: LibraryUsage, families: ReadonlyMap<string, Family>, options: { readonly newSource?: string; readonly oldSource?: string; readonly imports?: ReadonlyMap<string, ReadonlySet<string>> }): Promise<HeadlessCandidate> {
	const familyName = familyFor(lib);
	const family = familyName ? families.get(familyName) : undefined;
	const slug = paritySlug(lib.name);
	const port = options.newSource && (await stat(join(options.newSource, 'lib', 'parity', slug)).then((s) => s.isDirectory(), () => false)) ? `lib/parity/${slug}` : undefined;
	const usesFamily = familyName ? [...(options.imports?.get('@markless/ui') ?? [])].includes(familyName) : false;
	const status: HeadlessCandidate['status'] = port ? 'ported' : usesFamily ? 'markless-ui' : 'not in the new app';
	if (!family || !familyName) return { library: lib.name, status, ...(port ? { port } : {}), rows: [], missing: [], verdict: 'no family' };
	const rows: OverlapRow[] = [];
	const protocol = PROTOCOLS[familyName];
	const usedParts: string[] = [];
	for (const e of lib.exports) {
		if (e.kind === 'type' || !e.sites.length) continue;
		const target = partFor(e, familyName, lib.name);
		// A part the catalog maps into another family (`base.separator`) is looked up there.
		const [owner, part] = target?.includes('.') ? (target.split('.') as [string, string]) : [familyName, target];
		const ownerFamily = families.get(owner) ?? family;
		usedParts.push(e.name.replace(/^(DropdownMenu|Dialog|Tabs)/, '') || e.name);
		if (part === '') rows.push({ kind: 'part', used: e.name, family: '(nothing: a plain element, or not needed)' });
		else rows.push({ kind: 'part', used: e.name, ...(part && ownerFamily.parts.has(part) ? { family: `${owner}.${part}` } : {}) });
		const props = ownerFamily.parts.get(part ?? '') ?? new Set<string>();
		for (const prop of Object.keys(e.props)) {
			if (PASSTHROUGH.test(prop)) continue;
			const label = `${e.name} ${prop}${e.props[prop]!.values.length ? `=${e.props[prop]!.values.slice(0, 3).map(String).join('|')}` : ''}`;
			if (prop === 'asChild') rows.push({ kind: 'prop', used: label, family: 'render the part as the element itself, with its classes', note: 'the catalog\'s ruling for @radix-ui/react-slot' });
			else if (POSITIONING.has(prop)) rows.push({ kind: 'prop', used: label, ...(family.behaviours.has('anchor-positioning') ? { family: 'CSS anchor positioning (position-area, margin) on the part' } : {}) });
			else {
				const names = [prop, ...(ALIASES[prop] ?? [])];
				const hit = names.find((n) => props.has(n)) ?? names.find((n) => [...family.parts.values()].some((p) => p.has(n)));
				rows.push({ kind: 'prop', used: label, ...(hit ? { family: `${familyName}.${props.has(hit) ? part : [...family.parts].find(([, p]) => p.has(hit))![0]} ${hit}` } : {}) });
			}
		}
	}
	for (const [token, at] of await stylingTokens(lib, options.oldSource)) {
		const value = /^data-state=(.+)$/.exec(token)?.[1];
		if (value && STATE_VALUES[familyName] && !STATE_VALUES[familyName]!.includes(value)) continue;
		const eq = stateEquivalent(token, family);
		rows.push({ kind: 'state', used: `${token} (${at})`, ...(eq.family ? { family: eq.family } : {}) });
	}
	if (protocol) {
		const extra = usedParts.flatMap((p) => [protocol.byPart?.[p]]).filter(Boolean);
		const keys = new Set([...protocol.keys, ...extra.flatMap((x) => x!.keys ?? [])]);
		const aria = new Set([...protocol.aria, ...extra.flatMap((x) => x!.aria ?? [])]);
		for (const k of keys) rows.push({ kind: 'keyboard', used: keyName(k), ...(family.keys.has(k) ? { family: keyName(k) } : k === 'Tab' && family.behaviours.has('focus-containment') ? { family: 'Tab kept inside by the overlay behaviour (aria-modal)' } : {}) });
		for (const a of aria) rows.push({ kind: 'aria', used: a, ...(family.aria.has(a) ? { family: a } : {}) });
		for (const b of protocol.behaviours) rows.push({ kind: 'behaviour', used: b, ...(family.behaviours.has(b) ? { family: b } : {}) });
	}
	const missing = rows.filter((r) => !r.family).map((r) => `${r.kind} ${r.used}`);
	return { library: lib.name, family: familyName, status, ...(port ? { port } : {}), rows, missing, verdict: missing.length ? 'not yet' : 'swap', ...(protocol ? { control: protocol.control } : {}), familySourceBytes: family.sourceBytes };
}
