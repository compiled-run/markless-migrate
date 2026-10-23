// @shadcn/react Questionnaire: every item, answer, error and navigation button is in the markup, so the state the library
// derives (the active item, each item's answers, skips and validation) is written back as the attributes it renders.
const ROOT = 'form[data-slot="questionnaire"]';
const ITEM = '[data-slot="questionnaire-item"]';
const CHOICE_INPUT = 'input[data-slot="questionnaire-choice-input"]';
const TEXT_INPUT = '[data-slot="questionnaire-input"]';
const KNOWN_ITEM_KEYS = new Set(['Meta+Enter', 'Control+Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const attempted = new WeakSet<Element>();
const skipped = new WeakSet<Element>();
const names = new WeakMap<Element, string>();
const initial = new WeakMap<HTMLFormElement, { readonly active: Element | null; readonly own: WeakMap<Element, { readonly describedBy: readonly string[]; readonly keys: readonly string[] }> }>();

type Status = 'answered' | 'skipped' | 'unanswered';

function set(el: Element, name: string, value: string | null): void {
	if (value === null) {
		if (el.hasAttribute(name)) el.removeAttribute(name);
	} else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
const flag = (el: Element, name: string, on: boolean) => set(el, name, on ? '' : null);

const own = <T extends Element>(form: HTMLFormElement, selector: string) => [...form.querySelectorAll<T>(selector)].filter((el) => el.closest(ROOT) === form);
const itemsOf = (form: HTMLFormElement) => own<HTMLFieldSetElement>(form, ITEM);
const isDisabled = (item: Element) => item.hasAttribute('disabled') || item.hasAttribute('data-disabled');
const enabledOf = (form: HTMLFormElement) => itemsOf(form).filter((item) => !isDisabled(item));
const activeOf = (form: HTMLFormElement) => enabledOf(form).find((item) => item.hasAttribute('data-active')) ?? null;
const choicesOf = (item: Element) => [...item.querySelectorAll<HTMLInputElement>(CHOICE_INPUT)].filter((el) => el.closest(ITEM) === item);
const textOf = (item: Element) => [...item.querySelectorAll<HTMLInputElement>(TEXT_INPUT)].filter((el) => el.closest(ITEM) === item);
const answersOf = (item: Element) => [...item.querySelectorAll<HTMLInputElement>(`${CHOICE_INPUT}, ${TEXT_INPUT}`)].filter((el) => el.closest(ITEM) === item && !el.disabled);
const isChoice = (el: Element) => el.matches(CHOICE_INPUT);
const filledText = (value: string) => value.trim().length > 0;
// A text answer is chosen when it carries the item's name (the library names only a selected one).
const selected = (el: HTMLInputElement) => (isChoice(el) ? el.checked : el.hasAttribute('name'));
const isAnswerFilled = (el: HTMLInputElement) => (isChoice(el) ? el.checked : el.hasAttribute('name') && filledText(el.value));

function nameOf(item: Element): string | null {
	const known = names.get(item);
	if (known) return known;
	const named = [...choicesOf(item), ...textOf(item)].find((el) => el.getAttribute('name'))?.getAttribute('name') ?? null;
	if (named) names.set(item, named);
	return named;
}

function status(item: Element): Status {
	if (skipped.has(item)) return 'skipped';
	return answersOf(item).some(selected) ? 'answered' : 'unanswered';
}
function valid(item: Element): boolean {
	const s = status(item);
	return isDisabled(item) || (s === 'skipped' && !item.hasAttribute('data-required')) || s === 'answered';
}
function invalid(item: Element): boolean {
	const s = status(item);
	return !isDisabled(item) && !(s === 'skipped' && !item.hasAttribute('data-required')) && attempted.has(item) && !valid(item);
}

function remember(form: HTMLFormElement): void {
	if (initial.has(form)) return;
	const map = new WeakMap<Element, { describedBy: string[]; keys: string[] }>();
	for (const item of itemsOf(form)) {
		nameOf(item);
		const errors = new Set([...item.querySelectorAll('[data-slot="questionnaire-error"]')].map((e) => e.id));
		map.set(item, {
			describedBy: (item.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && !errors.has(id)),
			keys: (item.getAttribute('aria-keyshortcuts') ?? '').split(/\s+/).filter((k) => k && !KNOWN_ITEM_KEYS.has(k)),
		});
	}
	initial.set(form, { active: activeOf(form), own: map });
}

const segments = new WeakMap<Element, { readonly filled: string | null; readonly empty: string | null }>();

// A progress shows the library's "Question 1 of 3" or a page's render of { current, total }: its first two numbers and
// a row of one mark per item, the first `current` of them filled, follow the state.
function progressContent(progress: Element, was: { current: number; total: number }, now: { current: number; total: number }): void {
	if (was.current === now.current && was.total === now.total) return;
	const walker = document.createTreeWalker(progress, NodeFilter.SHOW_TEXT);
	let seen = 0;
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
		const next = node.data.replace(/\d+/g, (digits) => {
			const k = seen++;
			if (k === 0 && Number(digits) === was.current) return String(now.current);
			if (k === 1 && Number(digits) === was.total) return String(now.total);
			return digits;
		});
		if (next !== node.data) node.data = next;
	}
	for (const row of progress.querySelectorAll('[aria-hidden="true"]')) {
		const marks = [...row.children];
		if (marks.length !== was.total || marks.length !== now.total) continue;
		let known = segments.get(row);
		if (!known) {
			if (was.current < 1 || was.current >= marks.length) continue;
			known = { filled: marks[0]!.getAttribute('class'), empty: marks[marks.length - 1]!.getAttribute('class') };
			if (known.filled === known.empty) continue;
			segments.set(row, known);
		}
		marks.forEach((mark, i) => set(mark, 'class', i < now.current ? known.filled : known.empty));
	}
}

/** Writes what the library renders for the form's state. */
export function render(form: HTMLFormElement): void {
	remember(form);
	const memo = initial.get(form)!;
	const enabled = enabledOf(form);
	const active = activeOf(form);
	const index = active ? enabled.indexOf(active) : -1;
	const total = enabled.length;
	const current = index < 0 ? 0 : index + 1;
	const first = total > 0 && index === 0;
	const last = total > 0 && index === total - 1;
	for (const el of [form, ...own(form, '[data-slot="questionnaire-progress"]')]) {
		set(el, 'data-current', String(current));
		flag(el, 'data-first', first);
		flag(el, 'data-last', last);
		set(el, 'data-total', String(total));
	}
	const label = total ? `Question ${current} of ${total}` : null;
	for (const progress of own(form, '[data-slot="questionnaire-progress"]')) {
		const was = { current: Number(progress.getAttribute('aria-valuenow') ?? 0), total: Number(progress.getAttribute('aria-valuemax') ?? 0) };
		set(progress, 'aria-valuemax', total ? String(total) : null);
		set(progress, 'aria-valuemin', total ? '1' : null);
		set(progress, 'aria-valuenow', total ? String(current) : null);
		set(progress, 'aria-valuetext', label);
		progressContent(progress, was, { current, total });
	}
	for (const item of itemsOf(form)) {
		const isActive = item === active;
		const s = status(item);
		const bad = invalid(item);
		const multiple = item.hasAttribute('data-multiple');
		const required = item.hasAttribute('data-required');
		const answers = answersOf(item);
		const errors = [...item.querySelectorAll<HTMLElement>('[data-slot="questionnaire-error"]')].filter((e) => e.closest(ITEM) === item);
		const mine = memo.own.get(item) ?? { describedBy: [], keys: [] };
		const descriptions = mine.describedBy.filter((id) => item.querySelector(`[data-slot="questionnaire-description"][id="${CSS.escape(id)}"]`));
		const rest = mine.describedBy.filter((id) => !descriptions.includes(id));
		set(item, 'aria-describedby', [...descriptions, ...(bad ? errors.map((e) => e.id) : []), ...rest].filter(Boolean).join(' ') || null);
		set(item, 'aria-invalid', bad ? 'true' : null);
		const keys = [...mine.keys, isActive ? 'Meta+Enter Control+Enter' : '', isActive && answers.length ? 'ArrowUp ArrowDown' : '', isActive && !first ? 'ArrowLeft' : '', isActive && !last && s !== 'unanswered' ? 'ArrowRight' : ''].filter(Boolean);
		set(item, 'aria-keyshortcuts', keys.join(' ') || null);
		flag(item, 'hidden', !isActive);
		flag(item, 'inert', !isActive);
		flag(item, 'data-active', isActive);
		flag(item, 'data-invalid', bad);
		set(item, 'data-status', s);
		const name = nameOf(item);
		const hasInput = answers.some((a) => !isChoice(a));
		for (const input of choicesOf(item)) {
			const checked = input.checked;
			const shortcut = input.getAttribute('data-shortcut');
			const choice = input.closest('[data-slot="questionnaire-choice"]');
			for (const el of choice ? [choice, input] : [input]) {
				flag(el, 'data-checked', checked);
				flag(el, 'data-unchecked', !checked);
				flag(el, 'data-invalid', bad);
			}
			set(input, 'aria-invalid', bad ? 'true' : null);
			set(input, 'aria-keyshortcuts', [shortcut, !input.disabled && checked ? 'Enter' : null].filter(Boolean).join(' ') || null);
			set(input, 'name', s === 'skipped' || !name ? null : name);
			input.required = required && !multiple && !hasInput;
		}
		for (const input of textOf(item)) {
			const filled = filledText(input.value);
			const chosen = input.hasAttribute('name');
			flag(input, 'data-filled', filled);
			flag(input, 'data-empty', !filled);
			flag(input, 'data-invalid', bad);
			set(input, 'aria-invalid', bad ? 'true' : null);
			set(input, 'aria-keyshortcuts', !input.disabled && filled && chosen ? 'Enter' : null);
		}
		for (const error of errors) {
			error.hidden = !bad;
			set(error, 'role', bad ? 'alert' : null);
			flag(error, 'data-invalid', bad);
		}
	}
	const activeStatus = active ? status(active) : null;
	const activeRequired = active ? active.hasAttribute('data-required') : null;
	const nav: readonly [string, boolean, string | null][] = [
		['previous', total > 1 && !first, null],
		['skip', activeRequired === false, null],
		['next', total > 1 && !last, 'Enter'],
		['submit', total > 0 && last, 'Enter'],
	];
	for (const [slot, visible, shortcut] of nav) {
		for (const button of own<HTMLButtonElement>(form, `[data-slot="questionnaire-${slot}"]`)) {
			const keys = visible && !button.disabled ? shortcut : null;
			set(button, 'aria-hidden', visible ? null : 'true');
			set(button, 'aria-keyshortcuts', keys);
			flag(button, 'hidden', !visible);
			flag(button, 'inert', !visible);
			set(button, 'tabindex', visible ? null : '-1');
			flag(button, 'data-hidden', !visible);
			flag(button, 'data-visible', visible);
			set(button, 'data-status', activeStatus);
			set(button, 'data-shortcut', keys);
		}
	}
}

function focusInvalid(item: HTMLElement): void {
	const filled = item.querySelector<HTMLElement>('input[data-filled][name]:not(:disabled)');
	const first = item.querySelector<HTMLElement>('input:not([type=hidden]):not(:disabled), textarea:not(:disabled)');
	(filled ?? first ?? item).focus();
}

function setItem(form: HTMLFormElement, next: HTMLElement, target: 'item' | 'invalid' = 'item'): void {
	const active = activeOf(form);
	if (next === active) return;
	for (const item of itemsOf(form)) flag(item, 'data-active', item === next);
	render(form);
	if (target === 'invalid') focusInvalid(next);
	else next.focus();
}

function validate(item: Element): boolean {
	attempted.add(item);
	return valid(item);
}

function goPrevious(form: HTMLFormElement): void {
	const enabled = enabledOf(form);
	const index = enabled.indexOf(activeOf(form) as HTMLFieldSetElement);
	if (index <= 0) return;
	setItem(form, enabled[index - 1]!);
}

function goNext(form: HTMLFormElement): void {
	const enabled = enabledOf(form);
	const active = activeOf(form);
	const index = active ? enabled.indexOf(active) : -1;
	if (!active || index >= enabled.length - 1) return;
	if (!validate(active)) {
		render(form);
		focusInvalid(active);
		return;
	}
	setItem(form, enabled[index + 1]!);
}

/** The form's submit as the library checks it: the first item not answered is shown and focused instead. */
export function submit(form: HTMLFormElement): boolean {
	const active = activeOf(form);
	const bad = enabledOf(form).find((item) => !validate(item));
	render(form);
	if (!bad) return true;
	if (bad === active) focusInvalid(bad);
	else setItem(form, bad, 'invalid');
	return false;
}

function requestSubmit(form: HTMLFormElement): void {
	if (submit(form)) form.requestSubmit();
}

function confirmCurrent(form: HTMLFormElement): void {
	const enabled = enabledOf(form);
	const active = activeOf(form);
	if (!active) return;
	if (!validate(active)) {
		render(form);
		focusInvalid(active);
		return;
	}
	const index = enabled.indexOf(active);
	if (index === enabled.length - 1) return requestSubmit(form);
	setItem(form, enabled[index + 1]!);
}

function deselectText(item: Element): void {
	for (const input of textOf(item)) {
		input.removeAttribute('name');
		input.setAttribute('form', '');
	}
}

function skipCurrent(form: HTMLFormElement): void {
	const enabled = enabledOf(form);
	const active = activeOf(form);
	if (!active || active.hasAttribute('data-required')) return;
	for (const input of choicesOf(active)) input.checked = false;
	deselectText(active);
	skipped.add(active);
	const index = enabled.indexOf(active);
	if (index < enabled.length - 1) return setItem(form, enabled[index + 1]!);
	render(form);
	queueMicrotask(() => requestSubmit(form));
}

function reset(form: HTMLFormElement): void {
	const memo = initial.get(form);
	for (const item of itemsOf(form)) {
		attempted.delete(item);
		skipped.delete(item);
		for (const input of textOf(item)) {
			if (filledText(input.value)) {
				const name = nameOf(item);
				if (name) input.setAttribute('name', name);
				input.removeAttribute('form');
			} else deselectText(item);
		}
	}
	const target = memo?.active ?? enabledOf(form)[0];
	if (target && target !== activeOf(form)) setItem(form, target as HTMLElement);
	else render(form);
}

/** An answer changed: a single-answer item keeps only it, and a change clears a skip. */
function answered(input: HTMLInputElement): void {
	const form = input.closest<HTMLFormElement>(ROOT);
	const item = input.closest(ITEM);
	if (!form || !item) return;
	remember(form);
	skipped.delete(item);
	const multiple = item.hasAttribute('data-multiple');
	if (isChoice(input)) {
		if (input.checked && !multiple) {
			for (const other of choicesOf(item)) if (other !== input) other.checked = false;
			deselectText(item);
		}
	} else if (filledText(input.value)) {
		const name = nameOf(item);
		if (name) input.setAttribute('name', name);
		input.removeAttribute('form');
		if (!multiple) for (const choice of choicesOf(item)) choice.checked = false;
	} else deselectText(item);
	render(form);
}

export function input(target: Element): boolean {
	if (!(target instanceof HTMLInputElement) || !target.matches(`${CHOICE_INPUT}, ${TEXT_INPUT}`) || !target.closest(ROOT)) return false;
	answered(target);
	return true;
}

export function click(target: Element): boolean {
	const button = target.closest<HTMLButtonElement>('button');
	const form = button?.closest<HTMLFormElement>(ROOT);
	if (!button || !form || button.disabled) return false;
	remember(form);
	const slot = button.getAttribute('data-slot');
	if (slot === 'questionnaire-previous') goPrevious(form);
	else if (slot === 'questionnaire-next') goNext(form);
	else if (slot === 'questionnaire-skip') skipCurrent(form);
	else if (button.type === 'submit') submit(form);
	else if (button.type === 'reset') setTimeout(() => reset(form));
	else return false;
	return true;
}

const isTextEntry = (el: Element) => el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLInputElement ? !['button', 'checkbox', 'radio', 'reset', 'submit'].includes(el.type) : el instanceof HTMLElement && el.isContentEditable);
const isRadio = (el: Element) => el instanceof HTMLInputElement && el.type === 'radio';

function shortcutKeys(mode: string | null): string[] {
	if (mode === 'letters') return Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
	if (mode === 'numbers') return Array.from({ length: 9 }, (_, i) => String(i + 1));
	return [];
}

function moveAnswerFocus(item: HTMLElement, from: Element, direction: 1 | -1): boolean {
	const answers = answersOf(item);
	const at = answers.indexOf(from as HTMLInputElement);
	const current = at < 0 ? null : answers[at]!;
	const emptyText = current && !isChoice(current) && ['email', 'password', 'search', 'tel', 'text', 'url'].includes(current.type) && !filledText(current.value);
	if (!answers.length || (isTextEntry(from) && !emptyText) || (at < 0 && from !== item)) return false;
	const next = at < 0 ? (answers.find(isAnswerFilled) ?? (direction === 1 ? answers[0] : answers[answers.length - 1])) : answers[(at + direction + answers.length) % answers.length];
	if (!next || next === from) return false;
	if (at >= 0 && isRadio(from) && isRadio(next)) return false;
	next.focus();
	if (isChoice(next) && isRadio(next)) next.click();
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const form = target.closest<HTMLFormElement>(ROOT);
	if (!form || event.defaultPrevented || event.isComposing || event.keyCode === 229) return false;
	const active = activeOf(form);
	if (!active) return false;
	remember(form);
	if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
		event.preventDefault();
		if (!event.repeat) confirmCurrent(form);
		return true;
	}
	if (event.metaKey || event.ctrlKey || event.altKey) return false;
	if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && moveAnswerFocus(active, target, event.key === 'ArrowDown' ? 1 : -1)) {
		event.preventDefault();
		return true;
	}
	if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !isTextEntry(target) && !isRadio(target)) {
		event.preventDefault();
		if (event.repeat) return true;
		if (event.key === 'ArrowLeft') goPrevious(form);
		else if (status(active) !== 'unanswered') goNext(form);
		return true;
	}
	if (event.key === 'Enter') {
		const answer = answersOf(active).find((a) => a === target);
		if (!answer) return false;
		event.preventDefault();
		if (!event.repeat && isAnswerFilled(answer)) confirmCurrent(form);
		return true;
	}
	const mode = form.getAttribute('data-shortcuts');
	if (!mode || isTextEntry(target)) return false;
	const key = mode === 'letters' ? event.key.toUpperCase() : event.key;
	if (!shortcutKeys(mode).includes(key)) return false;
	const answer = answersOf(active).find((a) => a.getAttribute('data-shortcut') === key);
	if (!answer) return false;
	event.preventDefault();
	if (event.repeat) return true;
	answer.focus();
	if (isChoice(answer)) answer.click();
	return true;
}
