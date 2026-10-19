import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** What one @markless/ui family supports, read from its API manifest and its own source. */
export interface Family {
	readonly name: string;
	/** Part name to the props it takes. */
	readonly parts: ReadonlyMap<string, ReadonlySet<string>>;
	/** Keys its handlers name (`ArrowDown`, `Home`, ` ` for Space...), plus `Escape` when it closes on the dismiss behaviour's report. */
	readonly keys: ReadonlySet<string>;
	/** ARIA attributes and roles it writes (`aria-modal`, `role=dialog`). */
	readonly aria: ReadonlySet<string>;
	/** The state attributes it sets for styling (`ui-open`, `ui-checked`). */
	readonly states: ReadonlySet<string>;
	/** Behaviours read from its code: `outside-press`, `focus-return`, `focus-containment`, `typeahead`, `anchor-positioning`. */
	readonly behaviours: ReadonlySet<string>;
	/** Bytes of its source (the parts' .tsrx and their helper .ts), an upper bound on what it adds to a page. */
	readonly sourceBytes: number;
	readonly dir: string;
}

const ROLES = new Set(['dialog', 'alertdialog', 'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'menubar', 'tab', 'tablist', 'tabpanel', 'listbox', 'option', 'combobox', 'radiogroup', 'radio', 'checkbox', 'switch', 'tooltip', 'region', 'tree', 'treeitem', 'grid', 'gridcell', 'row', 'separator', 'slider', 'progressbar', 'toolbar', 'group', 'status', 'alert']);
const KEY_NAMES = new Set(['Escape', 'Enter', ' ', 'Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete']);
// Test, screen-reader and transcript files describe the family; only the parts and their helpers are what it does.
const NOT_CODE = /\.(browser|sr|nvda|voiceover)\.ts$|-(transcript|conformance|qa|walk)\.|-types\.ts$|\.d\.ts$/;

/** Where @markless/ui is: an explicit directory, else the new app's installed package. */
export async function findUi(newSource: string | undefined, explicit?: string): Promise<string | undefined> {
	for (const dir of [explicit, newSource && join(newSource, 'node_modules', '@markless', 'ui')]) {
		if (dir && (await stat(join(dir, 'api', 'manifest.json')).then(() => true, () => false))) return dir;
	}
	return undefined;
}

export async function readFamilies(uiDir: string): Promise<Map<string, Family>> {
	const manifest = JSON.parse(await readFile(join(uiDir, 'api', 'manifest.json'), 'utf8')) as Record<string, { parts: { part: string; props: { name: string }[] }[] }>;
	const dirs = new Map((await readdir(join(uiDir, 'src'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => [d.name.replace(/-/g, ''), d.name]));
	const families = new Map<string, Family>();
	for (const [name, entry] of Object.entries(manifest)) {
		const dir = dirs.get(name);
		const parts = new Map(entry.parts.map((p) => [p.part, new Set(p.props.map((x) => x.name))]));
		const keys = new Set<string>();
		const aria = new Set<string>();
		const states = new Set<string>();
		const behaviours = new Set<string>();
		let sourceBytes = 0;
		if (dir) {
			for (const file of await readdir(join(uiDir, 'src', dir))) {
				if (!/\.(tsrx|ts)$/.test(file) || NOT_CODE.test(file)) continue;
				const text = await readFile(join(uiDir, 'src', dir, file), 'utf8');
				sourceBytes += Buffer.byteLength(text);
				const code = text.replace(/^\s*\/\/.*$/gm, '');
				for (const m of code.matchAll(/'([^'\n]{1,12})'/g)) if (KEY_NAMES.has(m[1]!)) keys.add(m[1]!);
				for (const m of code.matchAll(/\b(aria-[a-z]+)\b/g)) aria.add(m[1]!);
				for (const m of code.matchAll(/role="([a-z]+)"/g)) aria.add(`role=${m[1]}`);
				// A role computed into a variable (`role={itemRole}`): every role name the file spells out.
				if (/role=\{/.test(code)) for (const m of code.matchAll(/'([a-z]+)'/g)) if (ROLES.has(m[1]!)) aria.add(`role=${m[1]}`);
				// Native elements bring their own role, keys and state.
				if (/<button\b/.test(code)) {
					aria.add('role=button');
					keys.add('Enter').add(' ');
				}
				if (/type="radio"/.test(code)) {
					for (const a of ['role=radio', 'aria-checked']) aria.add(a);
					for (const k of [' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) keys.add(k);
				}
				if (/type="checkbox"/.test(code)) {
					for (const a of ['role=checkbox', 'aria-checked']) aria.add(a);
					keys.add(' ');
				}
				for (const m of code.matchAll(/\b(ui-[a-z]+(?:-[a-z]+)*)\b/g)) states.add(m[1]!);
				if (/\bonDismiss\b/.test(code)) {
					keys.add('Escape');
					behaviours.add('outside-press');
				}
				if (/focusBack|returnFocus|restoreFocus|trigger\w*\??\.focus\(/.test(code)) behaviours.add('focus-return');
				if (/aria-modal="true"/.test(code)) behaviours.add('focus-containment');
				if (/typeahead|key\.length === 1/.test(code)) behaviours.add('typeahead');
				if (/position-anchor|anchor-name/.test(code)) behaviours.add('anchor-positioning');
			}
		}
		families.set(name, { name, parts, keys, aria, states, behaviours, sourceBytes, dir: dir ? join(uiDir, 'src', dir) : uiDir });
	}
	return families;
}
