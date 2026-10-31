import fc from 'fast-check';
import type { ProbeControl } from './probe-page.ts';
import type { Op } from './probes.ts';

/**
 * Role models: what a visitor may do to a widget of each ARIA role, from the WAI-ARIA Authoring Practices keyboard patterns
 * (https://www.w3.org/WAI/ARIA/apg/patterns/). The probes draw seeded step sequences from a control's model, run each on the old
 * and the new page, and shrink a difference to its shortest sequence.
 */
export type Model = 'menu' | 'context menu' | 'menubar' | 'listbox' | 'popover' | 'disclosure' | 'grid' | 'tree' | 'tabs' | 'toolbar' | 'text';

export function modelOf(c: Pick<ProbeControl, 'role' | 'classes'> & { readonly popup?: string; readonly expands?: boolean }): Model | undefined {
	if (c.classes.includes('context menu')) return 'context menu';
	switch (c.role) {
		case 'menubar':
			return 'menubar';
		case 'grid':
		case 'treegrid':
			return 'grid';
		case 'tree':
			return 'tree';
		case 'tablist':
			return 'tabs';
		case 'toolbar':
		case 'radiogroup':
			return 'toolbar';
		case 'textbox':
		case 'searchbox':
			return 'text';
		case 'combobox':
			return 'listbox';
	}
	if (c.role !== 'button') return undefined;
	if (c.popup === 'listbox') return 'listbox';
	if (c.popup === 'menu' || c.popup === 'true') return 'menu';
	if (c.expands) return 'disclosure';
	if (c.popup || c.classes.includes('popup')) return 'popover';
	return undefined;
}

/** The steps that bring the widget up before the drawn ones: a press for what opens, a right click for a context menu, Tab for a composite. */
export function opener(model: Model): Op[] {
	switch (model) {
		case 'context menu':
			return [{ op: 'right click' }];
		case 'menubar':
		case 'disclosure':
		case 'grid':
		case 'tree':
		case 'tabs':
		case 'toolbar':
			return [{ op: 'tab in' }];
		default:
			return [{ op: 'click' }];
	}
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const two = (n: number) => String(n).padStart(2, '0');
const FORMATS: readonly ((d: Date) => string)[] = [
	(d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
	(d) => `${MONTHS[d.getUTCMonth()]!.slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
	(d) => `${MONTHS[d.getUTCMonth()]} ${two(d.getUTCDate())}, ${d.getUTCFullYear()}`,
	(d) => `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`,
	(d) => `${two(d.getUTCMonth() + 1)}/${two(d.getUTCDate())}/${d.getUTCFullYear()}`,
	(d) => `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
	(d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
	(d) => `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`,
	(d) => `${MONTHS[d.getUTCMonth()]!.toLowerCase()} ${d.getUTCDate()} ${d.getUTCFullYear()}`,
];
// Real dates the owner typed, days that do not exist, a month alone, words and empty input.
const DATE_EDGES = ['May 28, 2025', 'May 1, 2025', 'February 29, 2024', 'Feb 30, 2025', 'February 29, 2025', '2025-13-01', '00/00/0000', '12/31/1999', 'May 2025', ' May 28, 2025 ', 'tomorrow', '28', ''];

/** Dates as people type them: a real day from 2000 to 2030 in one of several written forms, or an edge case. */
export const dateStrings: fc.Arbitrary<string> = fc.oneof(
	{ weight: 3, arbitrary: fc.tuple(fc.date({ min: new Date(Date.UTC(2000, 0, 1)), max: new Date(Date.UTC(2030, 11, 31)), noInvalidDate: true }), fc.nat(FORMATS.length - 1)).map(([d, f]) => FORMATS[f]!(d)) },
	{ weight: 2, arbitrary: fc.constantFrom(...DATE_EDGES) },
);

const WORDS = ['a', 'ab', 'Hello world', 'zzz', '0', '-1', '42', '3.14', 'é', 'Ünïcödé', '<b>x</b>', '  ', 'a'.repeat(40)];
const words: fc.Arbitrary<string> = fc.oneof(fc.constantFrom(...WORDS), fc.stringMatching(/^[a-z]{1,4}( [a-z]{1,4})?$/));

const keys = (...k: string[]): fc.Arbitrary<Op> => fc.constantFrom(...k).map((key) => ({ op: 'key', key }));
const op = (o: Op): fc.Arbitrary<Op> => fc.constant(o);
const items = (how: 'hover' | 'click', max = 7): fc.Arbitrary<Op> => fc.nat(max).map((n) => ({ op: 'item', n, how, round: true }));
const reach = (which: 'item' | 'opener', max = 5): fc.Arbitrary<Op> => fc.nat(max).map((n) => ({ op: 'reach', n, which }));
const typeahead: fc.Arbitrary<Op> = fc.nat(5).map((n) => ({ op: 'typeahead', n }));
const w = (weight: number, arbitrary: fc.Arbitrary<Op>) => ({ weight, arbitrary });

const NAV = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const GRID_KEYS = [...ARROWS, 'PageUp', 'PageDown', 'Shift+PageUp', 'Shift+PageDown', 'Home', 'End'];
const SHIFT_ARROWS = ARROWS.map((k) => `Shift+${k}`);

/** One drawn step of a widget of the model, weighted toward the keys its pattern names. */
export function modelSteps(model: Model): fc.Arbitrary<Op> {
	switch (model) {
		case 'menu':
		case 'context menu':
		case 'menubar':
			// Down and Up move, Right opens a submenu and Left closes it (in a menubar they move across), letters jump, Escape closes.
			return fc.oneof(
				w(5, keys(...NAV)),
				w(model === 'menubar' ? 5 : 3, keys('ArrowRight', 'ArrowLeft')),
				w(3, reach('opener', 2)),
				w(2, reach('item')),
				w(2, typeahead),
				w(2, items('hover')),
				w(1, items('click')),
				w(1, keys('Enter', 'Space')),
				w(1, keys('Escape', 'Tab')),
				w(1, op(model === 'context menu' ? { op: 'right click' } : model === 'menubar' ? { op: 'tab in' } : { op: 'click' })),
			);
		case 'listbox':
			// A list chosen from (one or many), filtered by typing when it has a text field, cleared, closed by Escape or a click outside.
			return fc.oneof(
				w(5, keys(...NAV)),
				w(3, keys('Enter', 'Space')),
				w(3, items('click')),
				w(1, items('hover')),
				w(2, reach('item')),
				w(1, typeahead),
				w(2, words.map((text): Op => ({ op: 'type', text }))),
				w(1, keys('Backspace', 'ControlOrMeta+a')),
				w(2, keys('Escape', 'Tab')),
				w(2, op({ op: 'outside' })),
				w(1, op({ op: 'click' })),
			);
		case 'popover':
			// A dialog, sheet, drawer or popover: Tab stays inside a modal one, Escape and its close button close it and focus goes
			// back. A date picker's popover holds a month grid, so the grid's keys are here too.
			return fc.oneof(
				w(4, keys('Tab', 'Shift+Tab')),
				w(4, keys(...GRID_KEYS)),
				w(2, keys(...SHIFT_ARROWS)),
				w(1, keys('Enter', 'Space')),
				w(1, keys('Escape')),
				w(1, op({ op: 'outside' })),
				w(1, op({ op: 'close' })),
				w(1, op({ op: 'click' })),
				w(1, items('click')),
				w(1, words.map((text): Op => ({ op: 'type', text }))),
			);
		case 'disclosure':
			// A button that shows and hides a section (an accordion, a collapsible, a file tree's folder): Enter, Space and a
			// click toggle it, and a disclosure inside what it shows (a nested folder) toggles the same way.
			return fc.oneof(w(4, keys('Enter', 'Space')), w(4, keys('Tab', 'Shift+Tab')), w(2, op({ op: 'click' })), w(1, keys('Escape')), w(1, op({ op: 'tab in' })));
		case 'grid':
			// A month grid or data grid: arrows by cell (a day, a week), Page keys by month, Shift+Page by year, Home/End to the
			// row's ends; Shift+Arrow extends a selection or does what an arrow does, never something else.
			return fc.oneof(w(6, keys(...ARROWS)), w(4, keys(...SHIFT_ARROWS)), w(3, keys('PageUp', 'PageDown')), w(1, keys('Shift+PageUp', 'Shift+PageDown')), w(2, keys('Home', 'End')), w(1, keys('Enter', 'Space')), w(1, keys('Shift+Tab')), w(1, op({ op: 'tab in' })));
		case 'tree':
			// Down and Up move, Right opens a folder or moves into it, Left closes it or moves to its parent; a click toggles.
			return fc.oneof(w(5, keys(...ARROWS)), w(1, keys('Home', 'End')), w(2, keys('Enter', 'Space')), w(3, items('click', 9)), w(3, reach('opener', 3)), w(1, typeahead), w(1, op({ op: 'tab in' })));
		case 'tabs':
		case 'toolbar':
			return fc.oneof(w(5, keys(...ARROWS)), w(2, keys('Home', 'End')), w(1, keys('Enter', 'Space')), w(1, keys('Tab', 'Shift+Tab')), w(1, op({ op: 'tab in' })));
		case 'text':
			// Typed text and dates in many forms, edited and committed: Enter, Tab away or a click outside reads what was typed.
			return fc.oneof(
				w(3, dateStrings.map((text): Op => ({ op: 'type', text }))),
				w(2, words.map((text): Op => ({ op: 'type', text }))),
				w(2, keys('Backspace', 'ControlOrMeta+a', 'Delete')),
				w(1, keys('ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowDown')),
				w(2, keys('Enter', 'Tab')),
				w(1, keys('Escape')),
				w(1, op({ op: 'outside' })),
				w(1, op({ op: 'click' })),
			);
	}
}

/** How many sequences a control's model draws, how many steps each may have, and how many reruns shrinking a difference may take. */
export interface ModelBudget {
	readonly runs: number;
	readonly steps: number;
	readonly shrinks: number;
	/** Rounds after a reported difference, each from the next seed with what was reported left out, so one difference cannot mask the next. */
	readonly findings: number;
}

export const MODEL_BUDGET: ModelBudget = { runs: 8, steps: 6, shrinks: 24, findings: 3 };

const date: fc.Arbitrary<Op> = dateStrings.map((text) => ({ op: 'type', text }));
const key = (k: string): Op => ({ op: 'key', key: k });

/** What a person does in one go: a single step, or a few the pattern names together (arrow to a submenu and open it, type a date and leave the field). */
export function modelMoves(model: Model): fc.Arbitrary<Op[]> {
	const one = modelSteps(model).map((o) => [o]);
	const moves = (...m: { weight: number; arbitrary: fc.Arbitrary<Op[]> }[]) => fc.oneof({ weight: 4, arbitrary: one }, ...m);
	switch (model) {
		case 'menu':
		case 'context menu':
		case 'menubar':
			return moves({ weight: 2, arbitrary: reach('opener', 2).chain((r) => fc.constantFrom([r, key('ArrowRight')], [r, key('ArrowRight'), key('ArrowLeft')], [r, key('Enter')])) });
		case 'disclosure':
			return moves({ weight: 3, arbitrary: fc.constantFrom([key('Tab'), key('Enter')], [key('Tab'), key('Space')], [key('Tab'), key('Tab'), key('Enter')]) });
		case 'popover':
			// A date picker's popover opens on its month buttons: a person tabs into the grid, then uses its keys.
			return moves({ weight: 3, arbitrary: fc.array(keys(...GRID_KEYS, ...SHIFT_ARROWS), { minLength: 1, maxLength: 3 }).map((k): Op[] => [{ op: 'reach', n: 0, which: 'grid' }, ...k]) });
		case 'tree':
			return moves({ weight: 2, arbitrary: reach('opener', 3).chain((r) => fc.constantFrom([r, key('ArrowRight')], [r, key('Enter')], [r, key('ArrowRight'), key('ArrowLeft')])) });
		case 'listbox':
			return moves({ weight: 1, arbitrary: fc.tuple(items('click'), items('click')).map(([a, b]) => [a, b]) }, { weight: 2, arbitrary: fc.tuple(items('click'), fc.constantFrom<Op>({ op: 'outside' }, key('Escape'), key('Tab'))).map(([a, b]) => [a, b]) });
		case 'text':
			return moves({ weight: 2, arbitrary: fc.tuple(date, fc.constantFrom('Tab', 'Enter')).map(([d, k]) => [key('ControlOrMeta+a'), d, key(k)]) });
		default:
			return one;
	}
}

export const sequencesOf = (model: Model, budget: ModelBudget): fc.Arbitrary<Op[]> => fc.array(modelMoves(model), { minLength: 1, maxLength: budget.steps, size: 'max' }).map((m) => m.flat());

/** A 32-bit seed fixed by what is driven: the route, the control and the model (FNV-1a). */
export function seedOf(...parts: readonly string[]): number {
	let h = 0x811c9dc5;
	for (const c of parts.join('\u0000')) h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193);
	return h | 0;
}

export const MODEL_HINTS: Record<Model, string> = {
	menu: 'Answer every key of the APG menu pattern as the old menu does: ArrowDown/ArrowUp move (wrapping as the old one wraps), Home/End go to the ends, a letter jumps to the item it starts, ArrowRight on an item that opens a submenu opens it and focuses its first item, ArrowLeft closes it and returns to that item, Enter and Space choose, and Escape closes and gives focus back to the trigger. A checkbox or radio item that keeps the old menu open must keep this one open.',
	'context menu': 'Answer the APG menu pattern as the old context menu does: arrows move, a letter jumps, ArrowRight opens a submenu and ArrowLeft closes it, Escape closes.',
	menubar: 'Answer the APG menubar pattern as the old one does: ArrowLeft/ArrowRight move between menus (and between open menus), ArrowDown/Enter/Space open one, Escape closes it and leaves focus on its menubar item.',
	listbox: 'Answer the APG listbox and combobox patterns as the old list does: arrows and Home/End move the active option, Enter and Space choose (in a multi-select, toggle and stay open exactly when the old one stays open), typing filters the same items, clearing restores them, and Escape, Tab or a click outside close it the same way after any choice.',
	disclosure: 'Answer the APG disclosure pattern as the old one does at every depth: Enter, Space and a click show and hide what it controls, aria-expanded follows, and a disclosure inside what it shows (a nested folder of a file tree) toggles the same way.',
	popover: 'Answer the APG dialog pattern as the old one does: a modal one keeps Tab and Shift+Tab inside it, wrapping at its ends; Escape and its close button close it and focus goes back to the trigger. When it holds a month grid, every grid key (arrows, PageUp/PageDown, Shift+PageUp/PageDown, Home/End, Shift+Arrow) moves the focused day as the old one does.',
	grid: 'Answer the APG grid (date picker) keys as the old grid does: arrows move by a cell (a day, a week), PageUp/PageDown by a month, Shift+PageUp/PageDown by a year, Home/End to the row ends, and Shift+Arrow does exactly what it does on the old page; focus stays on a cell after every key.',
	tree: 'Answer the APG tree pattern as the old tree does at every depth: ArrowRight opens a closed folder or moves into an open one, ArrowLeft closes it or moves to its parent, Up/Down move through what is shown, and a click on a nested folder toggles it.',
	tabs: 'Answer the APG tabs pattern as the old tablist does: ArrowLeft/ArrowRight (or Up/Down when vertical) move and select as the old one does, wrapping at the ends, Home/End go to the first and last tab, and Tab leaves for the panel.',
	toolbar: 'Answer the APG toolbar and radio group patterns as the old widget does: the arrows of its orientation move (and check, in a radio group), Home/End go to the ends, and it is one tab stop.',
	text: 'Read typed text as the old field does: the same characters are accepted, and a date typed in any written form ("May 28, 2025", 2025-05-28, 05/28/2025) parses to the same day, month and year on Enter, Tab or a click outside; invalid days are handled the same way.',
};
