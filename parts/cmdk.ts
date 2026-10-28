import { CHOICES } from './choices.ts';
import { navigate } from '@markless/router';

// cmdk 1.1: typing in [cmdk-input] scores every [cmdk-item] by its value and keywords (command-score unless the site
// passes its own filter); an item scoring 0 leaves the list (hidden here), a group with none left is hidden, separators
// leave while there is a search, and [cmdk-empty] (rendered hidden by the converter) shows when nothing is left. The items
// left are sorted by score and moved after the rest of their group, and the groups by their best item, as cmdk appends
// them; here the move is CSS order on a column. The first item left is selected (aria-selected, data-selected). Arrows,
// Home, End and Alt with an arrow move the selection; moving the pointer over an item selects it; Enter or a click
// chooses it, and what choosing does is the old page's: the address in the item's data-mm-href (where it went on that
// page, or for an item the page renders itself, its own), or what it copied. The input and list
// carry aria-activedescendant as cmdk computes it. A command in a layer starts again each time its layer opens.

export type Filter = (value: string, search: string, keywords: readonly string[]) => number;

// cmdk/src/command-score.ts, unchanged (MIT, Paco Coursey).
const SCORE_CONTINUE_MATCH = 1,
	SCORE_SPACE_WORD_JUMP = 0.9,
	SCORE_NON_SPACE_WORD_JUMP = 0.8,
	SCORE_CHARACTER_JUMP = 0.17,
	SCORE_TRANSPOSITION = 0.1,
	PENALTY_SKIPPED = 0.999,
	PENALTY_CASE_MISMATCH = 0.9999,
	PENALTY_NOT_COMPLETE = 0.99;
const IS_GAP_REGEXP = /[\\/_+.#"@[({&]/,
	COUNT_GAPS_REGEXP = /[\\/_+.#"@[({&]/g,
	IS_SPACE_REGEXP = /[\s-]/,
	COUNT_SPACE_REGEXP = /[\s-]/g;

function commandScoreInner(string: string, abbreviation: string, lowerString: string, lowerAbbreviation: string, stringIndex: number, abbreviationIndex: number, memoized: Record<string, number>): number {
	if (abbreviationIndex === abbreviation.length) return stringIndex === string.length ? SCORE_CONTINUE_MATCH : PENALTY_NOT_COMPLETE;
	const memoizeKey = `${stringIndex},${abbreviationIndex}`;
	if (memoized[memoizeKey] !== undefined) return memoized[memoizeKey]!;
	const abbreviationChar = lowerAbbreviation.charAt(abbreviationIndex);
	let index = lowerString.indexOf(abbreviationChar, stringIndex);
	let highScore = 0;
	while (index >= 0) {
		let score = commandScoreInner(string, abbreviation, lowerString, lowerAbbreviation, index + 1, abbreviationIndex + 1, memoized);
		if (score > highScore) {
			if (index === stringIndex) score *= SCORE_CONTINUE_MATCH;
			else if (IS_GAP_REGEXP.test(string.charAt(index - 1))) {
				score *= SCORE_NON_SPACE_WORD_JUMP;
				const wordBreaks = string.slice(stringIndex, index - 1).match(COUNT_GAPS_REGEXP);
				if (wordBreaks && stringIndex > 0) score *= Math.pow(PENALTY_SKIPPED, wordBreaks.length);
			} else if (IS_SPACE_REGEXP.test(string.charAt(index - 1))) {
				score *= SCORE_SPACE_WORD_JUMP;
				const spaceBreaks = string.slice(stringIndex, index - 1).match(COUNT_SPACE_REGEXP);
				if (spaceBreaks && stringIndex > 0) score *= Math.pow(PENALTY_SKIPPED, spaceBreaks.length);
			} else {
				score *= SCORE_CHARACTER_JUMP;
				if (stringIndex > 0) score *= Math.pow(PENALTY_SKIPPED, index - stringIndex);
			}
			if (string.charAt(index) !== abbreviation.charAt(abbreviationIndex)) score *= PENALTY_CASE_MISMATCH;
		}
		if (
			(score < SCORE_TRANSPOSITION && lowerString.charAt(index - 1) === lowerAbbreviation.charAt(abbreviationIndex + 1)) ||
			(lowerAbbreviation.charAt(abbreviationIndex + 1) === lowerAbbreviation.charAt(abbreviationIndex) && lowerString.charAt(index - 1) !== lowerAbbreviation.charAt(abbreviationIndex))
		) {
			const transposedScore = commandScoreInner(string, abbreviation, lowerString, lowerAbbreviation, index + 1, abbreviationIndex + 2, memoized);
			if (transposedScore * SCORE_TRANSPOSITION > score) score = transposedScore * SCORE_TRANSPOSITION;
		}
		if (score > highScore) highScore = score;
		index = lowerString.indexOf(abbreviationChar, index + 1);
	}
	memoized[memoizeKey] = highScore;
	return highScore;
}

const formatInput = (string: string) => string.toLowerCase().replace(COUNT_SPACE_REGEXP, ' ');

/** cmdk's defaultFilter: command-score of the value with its keywords after it. */
export function commandScore(value: string, search: string, keywords: readonly string[] = []): number {
	const string = keywords.length > 0 ? `${value} ${keywords.join(' ')}` : value;
	return commandScoreInner(string, search, formatInput(string), formatInput(search), 0, 0, {});
}

export interface CommandProps {
	/** The Command these props are the site's for; the others keep cmdk's defaults. */
	readonly applies: (root: HTMLElement) => boolean;
	readonly filter?: Filter;
	readonly keywords?: (item: HTMLElement) => readonly string[];
	readonly beforeChoose?: (item: HTMLElement) => void;
}

const configured: CommandProps[] = [];
const propsOf = (el: Element): Partial<CommandProps> => {
	const root = rootOf(el);
	return (root && configured.find((c) => c.applies(root))) ?? {};
};
const filterOf = (el: Element): Filter => propsOf(el).filter ?? commandScore;
const keywordsOf = (item: HTMLElement): readonly string[] => propsOf(item).keywords?.(item) ?? [];

/** A site's own Command props: its filter, each item's keywords, and what runs before an item's action (runCommand closing the dialog). */
export function configure(options: CommandProps): void {
	configured.push(options);
}

const ITEM = '[cmdk-item]';
const GROUP = '[cmdk-group]';
const rootOf = (el: Element) => el.closest<HTMLElement>('[cmdk-root]');
const listOf = (root: HTMLElement) => root.querySelector<HTMLElement>('[cmdk-list-sizer]') ?? root.querySelector<HTMLElement>('[cmdk-list]') ?? root;
const enabled = (i: Element) => i.getAttribute('aria-disabled') !== 'true';

// What React renders and cmdk moves, per container (the list, a group's items): the children in the order the DOM holds
// them, the filtered-out items left out.
interface Command {
	readonly original: Map<HTMLElement, HTMLElement[]>;
	readonly order: Map<HTMLElement, HTMLElement[]>;
	search: string;
}
const commands = new WeakMap<HTMLElement, Command>();

function containerOf(el: HTMLElement): HTMLElement {
	return el.parentElement!;
}

function commandOf(root: HTMLElement): Command {
	let c = commands.get(root);
	if (!c) {
		c = { original: new Map(), order: new Map(), search: '' };
		track(c, root);
		commands.set(root, c);
		new MutationObserver(() => rendered(root)).observe(listOf(root), { childList: true, subtree: true });
	}
	return c;
}

/** Takes the containers whose children the page changed (items rendered or removed) in the order the DOM now holds them; whether any changed. */
function track(c: Command, root: HTMLElement): boolean {
	const seen = new Set<HTMLElement>();
	let changed = false;
	for (const el of root.querySelectorAll<HTMLElement>(`${ITEM}, ${GROUP}`)) {
		const parent = containerOf(el);
		if (seen.has(parent)) continue;
		seen.add(parent);
		const kids = [...parent.children] as HTMLElement[];
		const was = c.original.get(parent);
		if (was && was.length === kids.length && was.every((k, i) => k === kids[i])) continue;
		c.original.set(parent, kids);
		c.order.set(parent, [...kids]);
		changed = true;
	}
	for (const container of [...c.original.keys()]) {
		if (seen.has(container)) continue;
		c.original.delete(container);
		c.order.delete(container);
		changed = true;
	}
	return changed;
}

// An item mounting or unmounting (cmdk's context.item): the search filters and sorts again, and with no item selected (none
// was, or the selected one left) the first is.
function rendered(root: HTMLElement): void {
	const c = commands.get(root);
	if (!c || !track(c, root)) return;
	apply(root, c.search);
	if (selected(root)) return;
	const first = items(root)[0];
	if (first) select(root, first, 'search');
	else setDescendant(root, undefined);
}

const isItem = (el: Element) => el.hasAttribute('cmdk-item');

/** The items in the order the page shows them: the containers' current orders, walked from the list down. */
function shownOrder(root: HTMLElement): HTMLElement[] {
	const c = commandOf(root);
	const out: HTMLElement[] = [];
	const walk = (el: HTMLElement) => {
		const kids = c.order.get(el) ?? ([...el.children] as HTMLElement[]);
		for (const kid of kids) {
			if (isItem(kid)) {
				if (!kid.hidden) out.push(kid);
			} else walk(kid);
		}
	};
	walk(listOf(root));
	return out;
}

const items = (root: HTMLElement) => shownOrder(root).filter(enabled);
const selected = (root: Element) => root.querySelector<HTMLElement>(`${ITEM}[aria-selected="true"]`) ?? undefined;

function setDescendant(root: Element, item: HTMLElement | undefined): void {
	for (const el of [root.querySelector('[cmdk-input]'), root.querySelector('[cmdk-list]')]) {
		if (!el) continue;
		if (item?.id) el.setAttribute('aria-activedescendant', item.id);
		else el.removeAttribute('aria-activedescendant');
	}
}

// Store.setState('value'): selecting from a key or the pointer names the new item; a selection the search made names the
// one selected before it, if the search kept it (cmdk reads it before React has rendered the new one).
function select(root: HTMLElement, item: HTMLElement | undefined, by: 'key' | 'pointer' | 'search' = 'key'): void {
	const was = selected(root);
	if (was === item) return;
	for (const i of root.querySelectorAll(`${ITEM}[aria-selected="true"]`)) {
		i.setAttribute('aria-selected', 'false');
		i.setAttribute('data-selected', 'false');
	}
	setDescendant(root, by !== 'search' ? item : was && !was.hidden ? was : undefined);
	if (!item) return;
	item.setAttribute('aria-selected', 'true');
	item.setAttribute('data-selected', 'true');
	// scrollSelectedIntoView, which a pointer's selection skips.
	if (by !== 'pointer') scrollSelectedIntoView(root, item);
}

function scrollSelectedIntoView(root: HTMLElement, item: HTMLElement): void {
	if (commandOf(root).order.get(containerOf(item))?.find((k) => !k.hidden) === item) item.closest(GROUP)?.querySelector('[cmdk-group-heading]')?.scrollIntoView({ block: 'nearest' });
	item.scrollIntoView({ block: 'nearest' });
}

// React's placement: an item filtered back in goes before the next item after it in source order that stayed mounted.
function place(c: Command, container: HTMLElement, was: (el: HTMLElement) => boolean, now: (el: HTMLElement) => boolean): void {
	const source = c.original.get(container)!;
	const before = c.order.get(container)!;
	const stayed = before.filter((el) => was(el) && now(el));
	const next = [...stayed];
	for (const [i, el] of source.entries()) {
		if (was(el) || !now(el)) continue;
		const after = source.slice(i + 1).find((s) => stayed.includes(s));
		if (after) next.splice(next.indexOf(after), 0, el);
		else next.push(el);
	}
	c.order.set(container, [...next, ...source.filter((el) => !now(el))]);
}

function paintOrder(c: Command): void {
	for (const [container, order] of c.order) {
		const source = c.original.get(container)!;
		const moved = order.some((el, i) => el !== source[i]);
		if (moved) {
			container.style.setProperty('display', 'flex');
			container.style.setProperty('flex-direction', 'column');
		} else {
			container.style.removeProperty('display');
			container.style.removeProperty('flex-direction');
		}
		order.forEach((el, i) => (moved ? el.style.setProperty('order', String(i)) : el.style.removeProperty('order')));
	}
}

function search(root: HTMLElement, text: string): void {
	apply(root, text);
	select(root, items(root)[0], 'search');
}

function apply(root: HTMLElement, text: string): void {
	const c = commandOf(root);
	track(c, root);
	const list = listOf(root);
	const scores = new Map<HTMLElement, number>();
	const filter = filterOf(root);
	for (const item of list.querySelectorAll<HTMLElement>(ITEM)) scores.set(item, text ? filter(item.getAttribute('data-value') ?? '', text, keywordsOf(item)) : 1);
	const mounted = new Set([...scores.keys()].filter((i) => !i.hidden));
	// cmdk unmounts an item that scores 0; here it is hidden, which takes it out of the list and the accessibility tree alike.
	for (const [item, score] of scores) item.hidden = !(score > 0);
	for (const separator of list.querySelectorAll<HTMLElement>('[cmdk-separator]')) separator.hidden = Boolean(text);
	for (const group of list.querySelectorAll<HTMLElement>(GROUP)) {
		if (group.querySelector(`${ITEM}:not([hidden])`)) group.removeAttribute('hidden');
		else group.setAttribute('hidden', '');
	}
	for (const container of c.order.keys()) place(c, container, (el) => !isItem(el) || mounted.has(el), (el) => !isItem(el) || !el.hidden);
	if (text) {
		// Command's sort: the enabled items left, by score (a stable sort of the order they are in), appended to their group's
		// items; then the groups left, by their best item.
		const sorted = shownOrder(root)
			.filter(enabled)
			.sort((a, b) => scores.get(b)! - scores.get(a)!);
		for (const item of sorted) {
			const order = c.order.get(containerOf(item))!;
			order.splice(order.indexOf(item), 1);
			order.push(item);
		}
		const groups = [...list.querySelectorAll<HTMLElement>(GROUP)].filter((g) => !g.hidden);
		const best = (g: HTMLElement) => Math.max(0, ...[...g.querySelectorAll<HTMLElement>(ITEM)].map((i) => (i.hidden ? 0 : scores.get(i)!)));
		for (const group of groups.sort((a, b) => best(b) - best(a))) {
			const order = c.order.get(containerOf(group));
			if (!order) continue;
			order.splice(order.indexOf(group), 1);
			order.push(group);
		}
	}
	c.search = text;
	paintOrder(c);
	const empty = root.querySelector<HTMLElement>('[cmdk-empty]');
	if (empty) empty.hidden = [...scores.values()].some((s) => s > 0);
}

function choose(item: HTMLElement): void {
	const root = rootOf(item);
	if (root) select(root, item, 'pointer');
	const key = item.getAttribute('data-value') ?? (item.textContent ?? '').trim();
	const choice = Object.values(CHOICES).find((c) => key in c)?.[key];
	propsOf(item).beforeChoose?.(item);
	const href = choice?.href ?? item.dataset.mmHref;
	if (choice?.copied !== undefined) void navigator.clipboard?.writeText(choice.copied).catch(() => {});
	else if (href) void navigate(href);
}

// Command's mount layout effect (scrollSelectedIntoView), for each command the page shows, in document order.
export function idle(): void {
	for (const root of document.querySelectorAll<HTMLElement>('[cmdk-root]')) {
		if (!root.checkVisibility()) continue;
		const item = selected(root) ?? items(root)[0];
		if (item) scrollSelectedIntoView(root, item);
	}
}

export function input(target: Element): boolean {
	if (!(target instanceof HTMLInputElement) || !target.hasAttribute('cmdk-input')) return false;
	const root = rootOf(target);
	if (root) search(root, target.value);
	return true;
}

// Alt with an arrow: the first enabled item of the next (or previous) group holding one, else the next item.
function groupStep(root: HTMLElement, now: HTMLElement | undefined, direction: 1 | -1): HTMLElement | undefined {
	const c = commandOf(root);
	const shown = items(root);
	let group = now?.closest<HTMLElement>(GROUP) ?? null;
	while (group) {
		const siblings = (c.order.get(containerOf(group)) ?? []).filter((el) => el.matches(GROUP));
		group = siblings[siblings.indexOf(group) + direction] ?? null;
		const first = group && shown.find((i) => group!.contains(i));
		if (first) return first;
	}
	return shown[(now ? shown.indexOf(now) : -1) + direction];
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const root = rootOf(target);
	if (!root || event.isComposing || event.keyCode === 229 || event.defaultPrevented) return false;
	const list = items(root);
	const now = selected(root);
	const at = now ? list.indexOf(now) : -1;
	let to: HTMLElement | undefined;
	const down = event.key === 'ArrowDown' || (event.ctrlKey && (event.key === 'n' || event.key === 'j'));
	const up = event.key === 'ArrowUp' || (event.ctrlKey && (event.key === 'p' || event.key === 'k'));
	if (down) to = event.metaKey ? list[list.length - 1] : event.altKey ? groupStep(root, now, 1) : list[at + 1];
	else if (up) to = event.metaKey ? list[0] : event.altKey ? groupStep(root, now, -1) : list[at - 1];
	else if (event.key === 'Home') to = list[0];
	else if (event.key === 'End') to = list[list.length - 1];
	else if (event.key === 'Enter') {
		event.preventDefault();
		if (now) choose(now);
		return true;
	} else return false;
	event.preventDefault();
	if (to) select(root, to);
	return true;
}

export function pointerover(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	const root = item && rootOf(item);
	if (!item || !root || !enabled(item)) return false;
	select(root, item, 'pointer');
	return true;
}

export function click(target: Element): boolean {
	const item = target.closest<HTMLElement>(ITEM);
	if (!item || !enabled(item)) return false;
	choose(item);
	return true;
}

// A Command inside a layer is unmounted when its layer closes: once focus has left it and the layer is hidden (its exit
// animation shows it as it was), it opens again with no search, its first item selected and nothing active.
const awaiting = new WeakSet<Element>();
export function focusout(target: Element, event: FocusEvent): boolean {
	const root = rootOf(target);
	const layer = root?.closest<HTMLElement>('[data-mm-layer]');
	if (!root || !layer || (event.relatedTarget instanceof Node && layer.contains(event.relatedTarget))) return false;
	if (awaiting.has(root)) return false;
	if (layer.hidden) {
		reset(root);
		return false;
	}
	awaiting.add(root);
	const watch = new MutationObserver(() => {
		if (!layer.hidden) return;
		watch.disconnect();
		awaiting.delete(root);
		reset(root);
	});
	watch.observe(layer, { attributes: true, attributeFilter: ['hidden'] });
	return false;
}

function reset(root: HTMLElement): void {
	const field = root.querySelector<HTMLInputElement>('[cmdk-input]');
	if (field) field.value = '';
	const c = commandOf(root);
	for (const [container, order] of c.original) c.order.set(container, [...order]);
	search(root, '');
	const first = shownOrder(root).find(enabled);
	for (const i of root.querySelectorAll(`${ITEM}[aria-selected="true"]`)) {
		i.setAttribute('aria-selected', 'false');
		i.setAttribute('data-selected', 'false');
	}
	first?.setAttribute('aria-selected', 'true');
	first?.setAttribute('data-selected', 'true');
	setDescendant(root, undefined);
	const scroller = root.querySelector<HTMLElement>('[cmdk-list]');
	if (scroller) scroller.scrollTop = 0;
}
