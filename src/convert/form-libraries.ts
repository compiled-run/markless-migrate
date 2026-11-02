import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { defaultEnv, openPage } from '../check/browser.ts';
import { finishAnimations } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { parseFragment } from 'parse5';
import { attr, childrenOf, elementChildren, isElement, isText, outer, setAttr, textContent, walk, type Element as Tree } from './dom.ts';
import { matchSource, type SourceForm } from './form-schemas.ts';
import { recordNotification, type Notify } from './toggles.ts';
import { emitElement, lit, mergeBindings, type Binding } from './tsrx.ts';

// What a page's form library (react-hook-form, TanStack Form, Formisch) was given and how its form showed each field's
// state, read from the old page's React tree and by using the form there. The port validates with the site's own schema
// and runs the library's timing (parts/form-library.ts); the markup each state showed decides what the state binds.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type FormLibrary = 'react-hook-form' | 'tanstack-form' | 'formisch';

export interface Located {
	readonly sig: string;
	readonly nth: number;
}

/**
 * A control of the form and what using it did to the form's values: `text` sets the field to what is typed, `bool` sets
 * it to whether the control is on, `member` puts `item` in the field's list while on, `choice` sets it to `item`,
 * `select` sets it to the value of the option its trigger shows.
 */
export interface FormControl extends Located {
	readonly field: string;
	readonly kind: 'text' | 'bool' | 'member' | 'choice' | 'select';
	readonly item?: Json;
	/** A select's options: the value choosing each gave the field, by the text the trigger then shows. */
	readonly items?: Readonly<Record<string, Json>>;
	/** Its blur takes its field's errors away (the site hands the library its blur: TanStack Form's handleBlur). */
	readonly blurs?: boolean;
}

/** The region in one state: `initial`; `error` with the field's errors set; `value` with a text field holding `value`. */
export interface FormSnapshot {
	readonly name: string;
	readonly field?: string;
	readonly errors?: readonly string[];
	readonly value?: string;
	readonly html: string;
}

export interface CapturedForm extends Located {
	readonly library: FormLibrary;
	/** The root element of the component that called the library's useForm. */
	readonly region: Located;
	/** The library's options that decide when it validates. */
	readonly options: Readonly<Record<string, Json>>;
	/** The fields in the order the library registered them, which is the order it looks for the first error in. */
	readonly fields: readonly string[];
	readonly defaults: Readonly<Record<string, Json>>;
	readonly controls: readonly FormControl[];
	readonly submits: readonly Located[];
	readonly resets: readonly Located[];
	/** The element the library focuses when a submit finds the field invalid. */
	readonly focus: Readonly<Record<string, Located>>;
	/** What a submit that passes shows (a toast of the values), with the values' text as the slot `v`. */
	readonly toast?: Notify;
	/** Its list of rows a visitor adds to and removes from, as using its Add and Remove showed. */
	readonly list?: CapturedList;
	readonly snapshots: readonly FormSnapshot[];
}

/** A form's list of rows: where its value sits, its Add, a row's value when added, how many rows Add stops at, and whether an added row takes focus. */
export interface CapturedList {
	readonly path: readonly (string | number)[];
	readonly append: Located;
	readonly item: Json;
	readonly max?: number;
	readonly focusAppended: boolean;
}

export interface FormLibraryCapture {
	readonly route: string;
	readonly forms: readonly CapturedForm[];
	readonly skipped: readonly string[];
}

const VERSION = 'form-libraries-15';
const fileFor = (dir: string, route: string) => join(dir, `${createHash('sha256').update(`${VERSION}|${route}`).digest('hex').slice(0, 16)}.json`);

/** The error messages a field is given while its markup is recorded: unlike any message a schema writes. */
export const MESSAGES = ['⁣mm-error-one', '⁣mm-error-two'] as const;
/** The values a text field is given while what follows its value is recorded. */
export const TYPED = ['abc', 'abcdefg'] as const;

// --- In the page -----------------------------------------------------------------------------------------------------

interface Found extends Located {
	readonly region?: Located;
	readonly why?: string;
	readonly library?: FormLibrary;
	readonly options?: Record<string, Json>;
	readonly fields?: string[];
	readonly defaults?: Record<string, Json>;
	readonly submits?: Located[];
	readonly focus?: Record<string, Located>;
}

/** Finds every form a form library instance renders and reads what the instance was given; the instances stay on window.__mmFL. */
function findForms(): Found[] {
	type Fiber = { return?: Fiber; child?: Fiber; sibling?: Fiber; memoizedState?: unknown; stateNode?: unknown };
	type Api = Record<string, any>;
	interface Adapter {
		library: 'react-hook-form' | 'tanstack-form' | 'formisch';
		owner: Fiber;
		values(): unknown;
		get(name: string): unknown;
		errors(): Record<string, string[]>;
		set(name: string, messages: string[]): void;
		options(): Record<string, unknown>;
		order(): string[];
		focusOf(name: string): Element | undefined;
		/** Lets the next submit pass whatever the values (to see what passing shows). */
		pass(): void;
		/** Whether the field is touched (TanStack Form). */
		touched?(name: string): boolean;
	}
	const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const counts = new Map<string, number>();
	const order = new Map<Element, number>();
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		order.set(el, counts.get(sig) ?? 0);
		counts.set(sig, (counts.get(sig) ?? 0) + 1);
	}
	const located = (el: Element) => ({ sig: sigOf(el), nth: order.get(el) ?? 0 });
	const fiberOf = (el: Element) => {
		const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
		return key ? ((el as unknown as Record<string, Fiber>)[key] as Fiber) : undefined;
	};
	const isRhf = (c: Api) => typeof c.handleSubmit === 'function' && c.control && typeof c.setError === 'function' && typeof c.getValues === 'function';
	const isTanstack = (c: Api) => c.fieldInfo && typeof c.handleSubmit === 'function' && typeof c.setFieldMeta === 'function';
	const isFormisch = (c: Api) => c['~internal']?.children && typeof c['~internal'].validate === 'string';
	const adapt = (c: Api, owner: Fiber): Adapter | undefined => {
		if (isRhf(c))
			return {
				library: 'react-hook-form',
				owner,
				values: () => c.getValues(),
				get: (name) => c.getValues(name),
				errors: () => Object.fromEntries(Object.entries(c.control._formState.errors as Record<string, { message?: string }>).map(([k, e]) => [k, e?.message ? [e.message] : []])),
				set: (name, messages) => (messages.length ? c.setError(name, { type: 'manual', message: messages[0] }) : c.clearErrors(name)),
				options: () => ({ mode: c.control._options.mode ?? 'onSubmit', reValidateMode: c.control._options.reValidateMode ?? 'onChange', shouldFocusError: c.control._options.shouldFocusError !== false, criteriaMode: c.control._options.criteriaMode ?? 'firstError' }),
				order: () => [...(c.control._names.mount as Set<string>)],
				focusOf: (name) => {
					const ref = c.control._fields?.[name]?._f?.ref as Element | { focus?: () => void } | undefined;
					if (ref instanceof Element) return ref;
					const was = document.activeElement;
					ref?.focus?.();
					const now = document.activeElement;
					(was as HTMLElement | null)?.focus?.();
					return now && now !== was && now !== document.body ? now : undefined;
				},
				pass: () => {
					c.control._options.resolver = async (values: unknown) => ({ values, errors: {} });
				},
			};
		if (isTanstack(c))
			return {
				library: 'tanstack-form',
				owner,
				values: () => c.state.values,
				get: (name) => c.getFieldValue(name),
				errors: () => Object.fromEntries(Object.entries(c.state.fieldMeta as Record<string, { errors?: unknown[] }>).map(([k, m]) => [k, (m.errors ?? []).map((e) => (typeof e === 'string' ? e : (e as { message?: string })?.message ?? '')).filter(Boolean)])),
				set: (name, messages) => c.setFieldMeta(name, (m: Api) => ({ ...m, isTouched: true, errorMap: messages.length ? { onSubmit: messages.map((message) => ({ message })) } : {} })),
				options: () => ({ validators: Object.keys(c.options.validators ?? {}).filter((k) => c.options.validators[k]) }),
				order: () => Object.keys(c.fieldInfo),
				focusOf: () => undefined,
				pass: () => c.update({ ...c.options, validators: {} }),
				touched: (name) => Boolean(c.getFieldMeta(name)?.isTouched),
			};
		if (isFormisch(c)) {
			const root = c['~internal'];
			const kid = (name: string): Api | undefined => name.split(/[.[\]]+/).filter(Boolean).reduce<Api | undefined>((n, k) => n?.children?.[k], root);
			// A list's own items signal says which of its children are in it: a removed item's store stays among them.
			const read = (n: Api): unknown => (n.kind === 'value' ? n.input.value : n.kind === 'array' ? ((n.items?.value ?? []) as unknown[]).map((_, i) => read((n.children as Api[])[i]!)) : Object.fromEntries(Object.entries(n.children as Record<string, Api>).map(([k, x]) => [k, read(x)])));
			return {
				library: 'formisch',
				owner,
				values: () => read(root),
				get: (name) => {
					const n = kid(name);
					return n ? read(n) : undefined;
				},
				errors: () => Object.fromEntries(Object.entries(root.children as Record<string, Api>).map(([k, x]) => [k, (x.errors.value as string[] | null) ?? []])),
				set: (name, messages) => {
					const n = kid(name);
					if (n) n.errors.value = messages.length ? messages : null;
				},
				options: () => ({ validate: root.validate, revalidate: root.revalidate }),
				order: () => {
					const names: string[] = [];
					// A list of plain values (the ids a checkbox group checks) is one field; a list of objects is a field per row.
					const visit = (n: Api, name: string) => {
						const kids = Object.entries((n.children ?? {}) as Record<string, Api>).filter(([k]) => n.kind !== 'array' || Number(k) < ((n.items?.value ?? []) as unknown[]).length);
						if (name && (n.kind === 'value' || (n.kind === 'array' && kids.every(([, x]) => x.kind === 'value')))) names.push(name);
						else for (const [k, x] of kids) visit(x, name ? `${name}.${k}` : k);
					};
					visit(root, '');
					return names;
				},
				focusOf: (name) => (kid(name)?.elements as Element[] | undefined)?.[0],
				// Formisch validates through its store's parse (valibot's safeParse of the schema).
				pass: () => {
					root.parse = (input: unknown) => ({ typed: true, success: true, output: input, issues: undefined });
				},
			};
		}
		return undefined;
	};
	const w = window as unknown as { __mmFL: { adapter: Adapter; root: Element; form: Element; initial: unknown }[] };
	w.__mmFL = [];
	const out: Found[] = [];
	const owners = new Set<Fiber>();
	for (const form of document.querySelectorAll('form')) {
		if (form.closest('template')) continue;
		let adapter: Adapter | undefined;
		for (let f = fiberOf(form); f && !adapter; f = f.return) {
			for (let h = f.memoizedState as { memoizedState?: unknown; next?: unknown } | undefined, i = 0; h && typeof h === 'object' && 'next' in h && i < 200 && !adapter; h = h.next as typeof h, i++) {
				const v = h.memoizedState as { current?: unknown } | unknown[] | undefined;
				for (const c of [v, (v as { current?: unknown } | undefined)?.current, Array.isArray(v) ? v[0] : undefined]) {
					if (c && typeof c === 'object') adapter = adapt(c as Api, f);
					if (adapter) break;
				}
			}
		}
		if (!adapter || owners.has(adapter.owner)) continue;
		owners.add(adapter.owner);
		const base = located(form);
		const roots: Element[] = [];
		const visit = (f: Fiber) => {
			for (let c = f.child; c; c = c.sibling) {
				if (c.stateNode instanceof Element) roots.push(c.stateNode);
				else visit(c);
			}
		};
		visit(adapter.owner);
		if (roots.length !== 1) {
			out.push({ ...base, why: `the component renders ${roots.length} root elements` });
			continue;
		}
		const root = roots[0]!;
		const json = (v: unknown): unknown => JSON.parse(JSON.stringify(v ?? null));
		const fields = adapter.order();
		const id = form.id;
		const submits = [...root.querySelectorAll('button[type="submit"], input[type="submit"]'), ...(id ? document.querySelectorAll(`button[form="${CSS.escape(id)}"][type="submit"], button[form="${CSS.escape(id)}"]:not([type])`) : [])].filter((b, i, all) => all.indexOf(b) === i && ((b as HTMLButtonElement).form === form));
		const focus: Record<string, { sig: string; nth: number }> = {};
		for (const name of fields) {
			const el = adapter.focusOf(name);
			if (el && root.contains(el)) focus[name] = located(el);
		}
		w.__mmFL.push({ adapter, root, form, initial: json(adapter.values()) });
		out.push({ ...base, region: located(root), library: adapter.library, options: json(adapter.options()) as Record<string, Json>, fields, defaults: json(adapter.values()) as Record<string, Json>, submits: submits.map(located), focus });
	}
	return out;
}

/** The region's markup, canonical: attributes in name order, styles as the CSSOM writes them, focus and hover states left out. */
function regionMarkup(i: number): string {
	const root = (window as unknown as { __mmFL: { root: Element }[] }).__mmFL[i]!.root;
	const transient = /^data-(hovered|pressed|focused|focus-visible|focus-visible-within|focus-within|highlighted)$/;
	const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const value = (n: Element, a: Attr) => (a.name === 'style' && n instanceof HTMLElement ? n.style.cssText : a.value);
	const canon = (n: Node): string => {
		if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? '');
		if (!(n instanceof Element)) return '';
		const tag = n.tagName.toLowerCase();
		const attrs = [...n.attributes].filter((a) => !transient.test(a.name)).map((a) => [a.name, value(n, a)] as [string, string]);
		const list = attrs.sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, v]) => ` ${name}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
		return /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) ? `<${tag}${list}>` : `<${tag}${list}>${[...n.childNodes].map(canon).join('')}</${tag}>`;
	};
	return canon(root);
}

/** The controls of the region a visitor fills or presses, by signature: text fields and checkboxes, switches and radios. */
function controlsOf(i: number): (Located & { text: boolean; select: boolean; group: number })[] {
	const w = window as unknown as { __mmFL: { root: Element }[]; __mmFormControls: Element[] };
	const root = w.__mmFL[i]!.root;
	const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const counts = new Map<string, number>();
	const order = new Map<Element, number>();
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		order.set(el, counts.get(sig) ?? 0);
		counts.set(sig, (counts.get(sig) ?? 0) + 1);
	}
	const found = [...root.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([aria-hidden="true"]), textarea, [role="checkbox"], [role="switch"], [role="radio"], button[role="combobox"]')].filter((el) => !(el as HTMLInputElement).disabled);
	w.__mmFormControls = found;
	const groups = [...root.querySelectorAll('[role="radiogroup"]')];
	return found.map((el) => ({ sig: sigOf(el), nth: order.get(el) ?? 0, text: el.matches('input, textarea'), select: el.matches('button[role="combobox"]'), group: el.matches('[role="radio"]') ? groups.findIndex((g) => g.contains(el)) : -1 }));
}

/** Each field's value, by the name the library registered it under. */
const fieldValues = (page: Page, i: number) =>
	page.evaluate((i) => {
		const entry = (window as unknown as { __mmFL: { adapter: { get(n: string): unknown; order(): string[] } }[] }).__mmFL[i]!;
		return Object.fromEntries(entry.adapter.order().map((name) => [name, JSON.parse(JSON.stringify(entry.adapter.get(name) ?? null))])) as Record<string, Json>;
	}, i);
const setErrors = (page: Page, i: number, name: string, messages: readonly string[]) => page.evaluate(([i, name, messages]) => (window as unknown as { __mmFL: { adapter: { set(n: string, m: readonly string[]): void } }[] }).__mmFL[i]!.adapter.set(name, messages), [i, name, messages] as const);
const markup = (page: Page, i: number) => page.evaluate(regionMarkup, i);

// --- Driving the old page --------------------------------------------------------------------------------------------

const settle = async (page: Page) => {
	await page.waitForTimeout(120);
	await finishAnimations(page).catch(() => {});
};

// How many forms each page's first load found: a later load waits until it finds them all again.
const formsOn = new WeakMap<Page, number>();

async function ready(page: Page, url: string): Promise<Found[]> {
	await loadPage(page, url);
	await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(300);
	const want = formsOn.get(page);
	for (let k = 0; ; k++) {
		const found = await page.evaluate(findForms);
		const count = found.filter((f) => f.region && f.library).length;
		if (want === undefined) formsOn.set(page, count);
		if (want === undefined || count >= want) return found;
		if (k === 33) throw new Error(`${count} of the page's ${want} forms found again after it loaded again`);
		await page.waitForTimeout(300);
	}
}

const controlHandle = (page: Page, k: number) => page.evaluateHandle((k) => (window as unknown as { __mmFormControls: Element[] }).__mmFormControls[k]!, k);

/** What changed in the form's values: each top-level field whose value differs. */
function changedFields(before: Record<string, Json>, after: Record<string, Json>): string[] {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

/** What using a checkable control did to its field: set it on, put an item in its list, or chose a value. */
export function checkableUse(before: Json | undefined, after: Json | undefined): Pick<FormControl, 'kind' | 'item'> | undefined {
	if (typeof after === 'boolean') return { kind: 'bool' };
	if (Array.isArray(after) && Array.isArray(before)) {
		const added = after.filter((x) => !before.some((y) => JSON.stringify(y) === JSON.stringify(x)));
		if (added.length === 1 && after.length === before.length + 1) return { kind: 'member', item: added[0]! };
		return undefined;
	}
	if (after !== null && after !== undefined && typeof after !== 'object') return { kind: 'choice', item: after };
	return undefined;
}

/** Chooses each option a select trigger opens, recording the value it gave its field by the text the trigger then shows. */
async function probeSelect(page: Page, i: number, k: number, initial: Record<string, Json>): Promise<Pick<FormControl, 'field' | 'kind' | 'items'> | undefined> {
	const open = async () => {
		await page.evaluate(controlsOf, i);
		const el = (await controlHandle(page, k)).asElement();
		if (!el || !(await el.click({ timeout: 2000 }).then(() => true, () => false))) return 0;
		await settle(page);
		return page.locator('[role="listbox"] [role="option"]').count();
	};
	const count = await open();
	await page.keyboard.press('Escape');
	await settle(page);
	let field: string | undefined;
	const items: Record<string, Json> = {};
	for (let n = 0; n < count; n++) {
		if (!(await open())) return undefined;
		if (!(await page.locator('[role="listbox"] [role="option"]').nth(n).click({ timeout: 2000 }).then(() => true, () => false))) continue;
		await settle(page);
		const after = await fieldValues(page, i);
		const changed = changedFields(initial, after);
		const shown = await page.evaluate(([i, k]) => {
			const w = window as unknown as { __mmFormControls: Element[] };
			void i;
			return (w.__mmFormControls[k]?.querySelector('[data-slot="select-value"]') ?? w.__mmFormControls[k])?.textContent?.trim() ?? '';
		}, [i, k] as const);
		const f = changed.length === 1 ? changed[0]! : field;
		if (!f || (field && f !== field)) continue;
		field = f;
		items[shown] = after[f]!;
	}
	return field ? { field, kind: 'select', items } : undefined;
}

/** Whether the control losing focus is handed to the library (TanStack Form's handleBlur): focused and left, its field is touched. */
async function blurHandled(page: Page, i: number, k: number, field: string): Promise<boolean> {
	const touched = () => page.evaluate(([i, field]) => (window as unknown as { __mmFL: { adapter: { touched?(n: string): boolean } }[] }).__mmFL[i]!.adapter.touched?.(field) ?? false, [i, field] as const);
	if (await touched()) return false;
	await page.evaluate((k) => {
		const el = (window as unknown as { __mmFormControls: HTMLElement[] }).__mmFormControls[k]!;
		el.focus();
		el.blur();
	}, k);
	await settle(page);
	return touched();
}

/** Uses each control of the form once, from the form as loaded, and records which field it sets and how. */
async function probeControls(page: Page, url: string, i: number, library: FormLibrary, log: (line: string) => void): Promise<FormControl[]> {
	const out: FormControl[] = [];
	const controls = await page.evaluate(controlsOf, i);
	const initial = await fieldValues(page, i);
	for (let k = 0; k < controls.length; k++) {
		const c = controls[k]!;
		await page.evaluate(controlsOf, i);
		const el = (await controlHandle(page, k)).asElement();
		if (!el) continue;
		if (c.text) {
			await el.fill('zq').catch(() => {});
			await settle(page);
			const after = await fieldValues(page, i);
			const field = changedFields(initial, after).find((f) => after[f] === 'zq');
			// Only TanStack Form hands a field's blur to the library (handleBlur), seen on the form as loaded (typing touched it).
			const blurs = field && library === 'tanstack-form' ? (await ready(page, url), await page.evaluate(controlsOf, i), await blurHandled(page, i, k, field)) : false;
			if (field) out.push({ sig: c.sig, nth: c.nth, field, kind: 'text', ...(blurs ? { blurs: true } : {}) });
			else log(`  form control ${c.sig}#${c.nth}: typing set no field to what was typed`);
			await el.fill('').catch(() => {});
			continue;
		}
		await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
		if (c.select) {
			const select = await probeSelect(page, i, k, initial);
			if (select) out.push({ sig: c.sig, nth: c.nth, ...select });
			else log(`  form control ${c.sig}#${c.nth}: choosing its options set no one field`);
			await ready(page, url);
			continue;
		}
		if (!(await el.click({ timeout: 2000 }).then(() => true, () => false))) {
			log(`  form control ${c.sig}#${c.nth}: could not be pressed`);
			continue;
		}
		await settle(page);
		const after = await fieldValues(page, i);
		const fields = changedFields(initial, after);
		const use = fields.length === 1 ? checkableUse(initial[fields[0]!], after[fields[0]!]) : undefined;
		if (use) out.push({ sig: c.sig, nth: c.nth, field: fields[0]!, ...use });
		else if (fields.length) log(`  form control ${c.sig}#${c.nth}: changed ${fields.join(', ')} in a way that is not ported`);
		// A choice cannot be taken back by using it again: the page is loaded again.
		if (fields.length) await ready(page, url);
	}
	// A radio chosen at load changes nothing when pressed: it is its group's field's value at load.
	for (const c of controls) {
		if (c.group < 0 || out.some((o) => o.sig === c.sig && o.nth === c.nth)) continue;
		const sibling = out.find((o) => o.kind === 'choice' && controls.find((x) => x.sig === o.sig && x.nth === o.nth)?.group === c.group);
		if (sibling && initial[sibling.field] !== undefined) out.push({ sig: c.sig, nth: c.nth, field: sibling.field, kind: 'choice', item: initial[sibling.field]! });
	}
	return out;
}

/** The buttons of the region besides its submits and its controls, by signature; they stay on window.__mmFormButtons. */
function buttonsOf([i, submits]: readonly [number, readonly Located[]]): Located[] {
	const w = window as unknown as { __mmFL: { root: Element }[]; __mmFormButtons: Element[] };
	const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
	const counts = new Map<string, number>();
	const order = new Map<Element, number>();
	for (const el of document.body.querySelectorAll('*')) {
		if (el.closest('template')) continue;
		const sig = sigOf(el);
		order.set(el, counts.get(sig) ?? 0);
		counts.set(sig, (counts.get(sig) ?? 0) + 1);
	}
	const selector = 'button:not([type="submit"]):not([aria-haspopup]):not([aria-expanded]):not([role])';
	w.__mmFormButtons = [...w.__mmFL[i]!.root.querySelectorAll(selector)].filter((b) => !submits.some((s) => s.sig === sigOf(b) && s.nth === order.get(b)));
	return w.__mmFormButtons.map((b) => ({ sig: sigOf(b), nth: order.get(b) ?? 0 }));
}

/** Uses a control the way its probe did: types into a text field, presses the rest. */
async function use(page: Page, i: number, control: FormControl): Promise<boolean> {
	const at = (await page.evaluate(controlsOf, i)).findIndex((c) => c.sig === control.sig && c.nth === control.nth);
	const el = at >= 0 ? (await controlHandle(page, at)).asElement() : null;
	if (!el) return false;
	const done = control.kind === 'text' ? await el.fill('zq').then(() => true, () => false) : await el.click({ timeout: 2000 }).then(() => true, () => false);
	await settle(page);
	return done;
}

/** The buttons of the region that put the form back as it loaded (its Reset): each pressed after a control was used. */
async function probeResets(page: Page, url: string, i: number, controls: readonly FormControl[], submits: readonly Located[]): Promise<Located[]> {
	const control = controls.find((c) => c.kind === 'text') ?? controls[0];
	if (!control) return [];
	const buttons = await page.evaluate(buttonsOf, [i, submits] as const);
	const out: Located[] = [];
	for (let k = 0; k < buttons.length; k++) {
		await ready(page, url);
		const initial = await fieldValues(page, i);
		if (!(await use(page, i, control)) || JSON.stringify(await fieldValues(page, i)) === JSON.stringify(initial)) continue;
		// The field is left first: a blur that validates moves the buttons, and a press across the move reaches none.
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await settle(page);
		await page.evaluate(buttonsOf, [i, submits] as const);
		const button = (await page.evaluateHandle((k) => (window as unknown as { __mmFormButtons: Element[] }).__mmFormButtons[k]!, k)).asElement();
		if (!button || !(await button.click({ timeout: 2000 }).then(() => true, () => false))) continue;
		await settle(page);
		if (JSON.stringify(await fieldValues(page, i)) === JSON.stringify(initial)) out.push(buttons[k]!);
	}
	await ready(page, url);
	return out;
}

/** The rows of a form's list as the library holds them, at `path` in its values. */
const listRows = (page: Page, i: number, path: readonly (string | number)[]) =>
	page.evaluate(([i, path]) => {
		let v = (window as unknown as { __mmFL: { adapter: { values(): unknown } }[] }).__mmFL[i]!.adapter.values() as unknown;
		for (const k of path) v = (v as Record<string | number, unknown> | undefined)?.[k];
		return Array.isArray(v) ? (JSON.parse(JSON.stringify(v)) as Json[]) : undefined;
	}, [i, path] as const);

/**
 * A list form's Add: the button among the region's whose press adds a row to the list. Pressed until it is disabled, it
 * tells how many rows the list stops at; the row it added first, whether it took focus and what it holds.
 */
async function probeList(page: Page, url: string, i: number, fields: readonly string[], submits: readonly Located[]): Promise<CapturedList | undefined> {
	const segments = fields.map((f) => f.split(/[.[\]]+/).filter(Boolean));
	const at = segments[0]?.findIndex((s) => /^\d+$/.test(s)) ?? -1;
	if (at < 0) return undefined;
	const path = segments[0]!.slice(0, at).map((s) => (/^\d+$/.test(s) ? Number(s) : s));
	const buttons = await page.evaluate(buttonsOf, [i, submits] as const);
	for (let k = 0; k < buttons.length; k++) {
		await ready(page, url);
		const before = (await listRows(page, i, path))?.length ?? 0;
		await page.evaluate(buttonsOf, [i, submits] as const);
		const button = (await page.evaluateHandle((k) => (window as unknown as { __mmFormButtons: Element[] }).__mmFormButtons[k]!, k)).asElement();
		if (!button || !(await button.click({ timeout: 2000 }).then(() => true, () => false))) continue;
		await settle(page);
		const rows = await listRows(page, i, path);
		if (!rows || rows.length !== before + 1) continue;
		const focusAppended = await page.evaluate((i) => {
			const w = window as unknown as { __mmFL: { root: Element }[] };
			const el = document.activeElement;
			return Boolean(el && w.__mmFL[i]!.root.contains(el) && el.matches('input, textarea'));
		}, i);
		let max: number | undefined;
		for (let n = 0; n < 20; n++) {
			if (await button.isDisabled().catch(() => true)) {
				max = (await listRows(page, i, path))?.length;
				break;
			}
			await button.click({ timeout: 2000 }).catch(() => {});
			await settle(page);
		}
		await ready(page, url);
		return { path, append: buttons[k]!, item: rows[rows.length - 1]!, ...(max !== undefined ? { max } : {}), focusAppended };
	}
	await ready(page, url);
	return undefined;
}

/** The region with its list down to one row (each row's Remove pressed in turn) and up to as many as Add allows. */
async function recordList(page: Page, url: string, i: number, list: CapturedList, submits: readonly Located[]): Promise<FormSnapshot[]> {
	const out: FormSnapshot[] = [];
	for (let n = 0; n < 20 && ((await listRows(page, i, list.path))?.length ?? 0) > 1; n++) {
		const removed = await page.evaluate((i) => {
			const w = window as unknown as { __mmFL: { root: Element }[] };
			const button = [...w.__mmFL[i]!.root.querySelectorAll<HTMLButtonElement>('button[type="button"]')].find((b) => /remove/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
			button?.click();
			return Boolean(button);
		}, i);
		if (!removed) break;
		await settle(page);
	}
	if (((await listRows(page, i, list.path))?.length ?? 0) === 1) out.push({ name: 'rows', value: '1', html: await markup(page, i) });
	await ready(page, url);
	// A list that loads with one row shows a second once Add is pressed: what tells the rows apart.
	if (((await listRows(page, i, list.path))?.length ?? 0) === 1) {
		const buttons = await page.evaluate(buttonsOf, [i, submits] as const);
		const k = buttons.findIndex((b) => b.sig === list.append.sig && b.nth === list.append.nth);
		const button = k >= 0 ? (await page.evaluateHandle((k) => (window as unknown as { __mmFormButtons: Element[] }).__mmFormButtons[k]!, k)).asElement() : null;
		if (button && (await button.click({ timeout: 2000 }).then(() => true, () => false))) {
			await settle(page);
			if (((await listRows(page, i, list.path))?.length ?? 0) === 2) out.push({ name: 'rows', value: '2', html: await markup(page, i) });
		}
		await ready(page, url);
	}
	if (list.max !== undefined) {
		const buttons = await page.evaluate(buttonsOf, [i, submits] as const);
		const k = buttons.findIndex((b) => b.sig === list.append.sig && b.nth === list.append.nth);
		const button = k >= 0 ? (await page.evaluateHandle((k) => (window as unknown as { __mmFormButtons: Element[] }).__mmFormButtons[k]!, k)).asElement() : null;
		for (let n = 0; button && n < 20 && !(await button.isDisabled().catch(() => true)); n++) {
			await button.click({ timeout: 2000 }).catch(() => {});
			await settle(page);
		}
		if (((await listRows(page, i, list.path))?.length ?? 0) === list.max) out.push({ name: 'rows', value: String(list.max), html: await markup(page, i) });
		await ready(page, url);
	}
	return out;
}

/**
 * What a submit that passes shows: the library is let pass whatever the values, the form submitted with its Submit, and
 * what that added in a live region recorded, with the text of the values JSON as the slot `v`.
 */
async function recordToast(page: Page, url: string, i: number, found: Found): Promise<Notify | undefined> {
	const submit = found.submits?.[0];
	if (!submit || !found.region) return undefined;
	await ready(page, url);
	const values = await page.evaluate((i) => {
		const entry = (window as unknown as { __mmFL: { adapter: { pass(): void; values(): unknown } }[] }).__mmFL[i]!;
		entry.adapter.pass();
		return JSON.stringify(entry.adapter.values(), null, 2);
	}, i);
	const note = await recordNotification(
		page,
		() =>
			page
				.evaluate(([sig, nth]) => {
					const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
					const button = [...document.body.querySelectorAll('*')].filter((el) => !el.closest('template') && sigOf(el) === sig)[nth] as HTMLElement | undefined;
					button?.click();
					return Boolean(button);
				}, [submit.sig, submit.nth] as const)
				.catch(() => false),
		found.region,
	);
	await ready(page, url);
	if (!note?.sonner) return undefined;
	const shows = note.sonner.phases.some((p) => p.inner.includes(values.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')) || p.inner.includes(values));
	return { ...note, onSubmit: true, ...(shows ? { texts: { v: values } } : {}) };
}

/** The region in each state a binding is learned from: as loaded, each field with one and with two errors, each text field holding two values. */
async function record(page: Page, url: string, i: number, found: Found, controls: readonly FormControl[]): Promise<FormSnapshot[]> {
	const out: FormSnapshot[] = [{ name: 'initial', html: await markup(page, i) }];
	for (const field of found.fields ?? []) {
		for (const errors of [MESSAGES.slice(0, 1), MESSAGES.slice(0, 2)]) {
			await setErrors(page, i, field, errors);
			await settle(page);
			out.push({ name: 'error', field, errors, html: await markup(page, i) });
		}
		await setErrors(page, i, field, []);
		await settle(page);
	}
	for (const c of controls.filter((x) => x.kind === 'text')) {
		const at = (await page.evaluate(controlsOf, i)).findIndex((x) => x.sig === c.sig && x.nth === c.nth);
		const el = at >= 0 ? (await controlHandle(page, at)).asElement() : null;
		if (!el) continue;
		for (const value of TYPED) {
			await el.fill(value).catch(() => {});
			await settle(page);
			out.push({ name: 'value', field: c.field, value, html: await markup(page, i) });
		}
		await el.fill('').catch(() => {});
		await settle(page);
	}
	await ready(page, url);
	return out;
}

/** Reads every form-library form of a route on the old page, uses its controls and records its states. Cached by route. */
export async function captureFormLibraries(browser: Browser, origin: string, route: string, dir: string, log: (line: string) => void = () => {}): Promise<FormLibraryCapture> {
	const file = fileFor(dir, route);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as FormLibraryCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const forms: CapturedForm[] = [];
	const skipped: string[] = [];
	const url = new URL(route, origin).href;
	const { context, page } = await openPage(browser, defaultEnv(origin), VIEWPORTS[0]!);
	try {
		const found = await ready(page, url);
		let index = 0;
		for (const f of found) {
			if (!f.region || !f.library) {
				skipped.push(`${f.sig}#${f.nth}: ${f.why}`);
				continue;
			}
			const i = index++;
			const controls = await probeControls(page, url, i, f.library, log);
			await ready(page, url);
			const resets = await probeResets(page, url, i, controls, f.submits ?? []);
			const list = await probeList(page, url, i, f.fields ?? [], f.submits ?? []);
			const snapshots = await record(page, url, i, f, controls);
			if (list) snapshots.push(...(await recordList(page, url, i, list, f.submits ?? [])));
			const toast = await recordToast(page, url, i, f);
			forms.push({ sig: f.sig, nth: f.nth, library: f.library, region: f.region, options: f.options ?? {}, fields: f.fields ?? [], defaults: f.defaults ?? {}, controls, submits: f.submits ?? [], resets: resets.filter((r) => !list || r.sig !== list.append.sig || r.nth !== list.append.nth), focus: f.focus ?? {}, ...(list ? { list } : {}), ...(toast ? { toast } : {}), snapshots });
		}
	} finally {
		await context.close().catch(() => {});
	}
	const capture: FormLibraryCapture = { route, forms, skipped };
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify(capture));
	return capture;
}

// --- The plan --------------------------------------------------------------------------------------------------------

/** Where the forms' specs are written, under the app's lib/parts/, and the directory of their schema modules. */
export const FORMS_MODULE = 'form-libraries.ts';
export const SCHEMAS_DIR = 'form-schemas';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 10);

// What opening a layer puts beside its trigger is rendered hidden there by the converter: no element of the form's.
const kids = (el: Tree): Tree[] => elementChildren(el).filter((e) => attr(e, 'data-mm-shown-with') === undefined);
const at = (root: Tree | undefined, path: readonly number[]): Tree | undefined => {
	let el = root;
	for (const i of path) el = el ? kids(el)[i] : undefined;
	return el;
};
const ownText = (el: Tree) => childrenOf(el).filter(isText).map((t) => t.value).join('');
const sameShape = (a: Tree, b: Tree) => a.tagName === b.tagName && attr(a, 'data-slot') === attr(b, 'data-slot');

/** Where the converted region's tree of elements differs from the recorded one, if anywhere. */
function mismatch(page: Tree, rec: Tree, path: string): string | undefined {
	if (page.tagName !== rec.tagName) return `${path}: <${page.tagName}> where the old page had <${rec.tagName}>`;
	const a = kids(page);
	const b = kids(rec);
	if (a.length !== b.length) return `${path}: ${a.length} children where the old page had ${b.length}`;
	for (let i = 0; i < a.length; i++) {
		const m = mismatch(a[i]!, b[i]!, `${path}/${a[i]!.tagName}[${i}]`);
		if (m) return m;
	}
	return undefined;
}

/** How a recorded state's region differs from the region as loaded: attributes and text that changed, elements added. */
export interface Changes {
	readonly attrs: { readonly path: readonly number[]; readonly name: string; readonly from?: string; readonly to?: string }[];
	readonly texts: { readonly path: readonly number[]; readonly from: string; readonly to: string }[];
	readonly inserts: { readonly path: readonly number[]; readonly before: number; readonly html: string }[];
	/** What the comparison could not read as one of the above (an element taken away). */
	readonly other: string[];
}

/** Compares a state's region with the loaded one, element by element; an element of the state matching none in place was added. */
export function changes(base: Tree, state: Tree): Changes {
	const out: Changes = { attrs: [], texts: [], inserts: [], other: [] };
	const visit = (a: Tree, b: Tree, path: number[]) => {
		const names = new Set([...a.attrs.map((x) => x.name), ...b.attrs.map((x) => x.name)]);
		for (const name of names) if (attr(a, name) !== attr(b, name)) out.attrs.push({ path, name, ...(attr(a, name) !== undefined ? { from: attr(a, name) } : {}), ...(attr(b, name) !== undefined ? { to: attr(b, name) } : {}) });
		if (ownText(a) !== ownText(b)) out.texts.push({ path, from: ownText(a), to: ownText(b) });
		const ak = kids(a);
		const bk = kids(b);
		let i = 0;
		for (const child of bk) {
			if (i < ak.length && sameShape(ak[i]!, child)) {
				visit(ak[i]!, child, [...path, i]);
				i++;
			} else out.inserts.push({ path, before: i, html: outer(child) });
		}
		if (i < ak.length) out.other.push(`${path.join('/')}: ${ak.length - i} element(s) taken away`);
	};
	visit(base, state, []);
	return out;
}

const textCandidates = (from: string, typed: readonly string[], seen: readonly string[], expr: string): string | undefined => {
	// The text with the field's length or value in it: the same text around one changing part.
	const parts = (t: string) => t.split(/(\d+)/);
	const all = [from, ...seen];
	const split = all.map(parts);
	if (split.every((s) => s.length === split[0]!.length)) {
		let out = '';
		let same = '';
		for (let i = 0; i < split[0]!.length; i++) {
			const values = split.map((s) => s[i]!);
			if (new Set(values).size === 1) same += values[0];
			else if (values.every((v, k) => Number(v) === [0, ...typed.map((t) => t.length)][k])) {
				out += `${same ? `{${lit(same)}}` : ''}{${expr}.length}`;
				same = '';
			} else return undefined;
		}
		return out + (same ? `{${lit(same)}}` : '');
	}
	return undefined;
};

/** A form captured on the old page, placed: the names its bindings use. */
interface Placed {
	readonly name: string;
	readonly spec: string;
}

/** What the converter knows of the old source's forms: each useForm call with its schema module. */
export interface FormSources {
	readonly forms: readonly SourceForm[];
	/** The old app's version of a package the schemas import. */
	readonly version: (name: string) => string | undefined;
}

/**
 * Form-library forms on Markless state: per field a state() of the errors it shows and, where the page shows what a text
 * field holds (a character count), of its value. The region takes both from its `mmform` handler (the form-library part
 * dispatches it); every attribute an error changed binds whether the field shows one, and what an error added (a
 * FieldError) is an @if arm showing the message, or each message where the library shows several.
 */
export class FormPlan {
	private readonly bindings = new Map<Tree, Binding>();
	private readonly lazy = new Map<Tree, () => Binding | undefined>();
	private readonly emitting = new Set<Tree>();
	/** Emits an element with every plan's bindings (set by convert), for markup a form plan repeats (a list's rows). */
	emitter: (el: Tree, declarations: string[]) => string = (el, declarations) => emitElement(el, { declarations, bind: (x) => this.bind(x) });
	readonly notes: string[] = [];
	private readonly entries = new Map<string, string>();
	private readonly schemas = new Map<string, string>();
	readonly packages = new Map<string, string>();
	private n = 0;

	private readonly sources: FormSources;

	constructor(sources: FormSources) {
		this.sources = sources;
	}

	bind(el: Tree): Binding | undefined {
		const lazy = this.lazy.get(el);
		return lazy && !this.emitting.has(el) ? mergeBindings(this.bindings.get(el), lazy()) : this.bindings.get(el);
	}

	get used(): boolean {
		return this.entries.size > 0;
	}

	private set(el: Tree, b: Binding): void {
		this.bindings.set(el, mergeBindings(this.bindings.get(el), b)!);
	}

	add(route: string, forms: readonly CapturedForm[], locate: (sig: string, nth: number) => Tree | undefined, emit: (html: string) => string): number {
		let count = 0;
		for (const form of forms) {
			const why = this.place(form, locate, emit);
			if (why) this.notes.push(`${route} form ${form.region.sig.slice(0, 40)}#${form.region.nth}: not ported, ${why}`);
			else count++;
		}
		return count;
	}

	private place(form: CapturedForm, locate: (sig: string, nth: number) => Tree | undefined, emit: (html: string) => string): string | undefined {
		const region = locate(form.region.sig, form.region.nth);
		if (!region) return 'its region is not on the converted page';
		const snaps = form.snapshots.map((s) => ({ ...s, root: kids(parseFragment(s.html) as unknown as Tree)[0]! }));
		const initial = snaps.find((s) => s.name === 'initial')?.root;
		if (!initial) return 'no initial state was recorded';
		const differs = mismatch(region, initial, region.tagName);
		if (differs) return `its markup differs from the old page's (${differs})`;
		// A list of rows a visitor adds to and removes from registers a field per row (emails.0.address): its rows come and go.
		const inList = (f: string) => /(^|[.[])\d+([.\]]|$)/.test(f);
		if (form.fields.some(inList) && !form.list) return 'its fields include a list a visitor adds to and removes from, whose Add was not found';
		const source = matchSource(textContent(initial), this.sources.forms.filter((f) => f.library === form.library));
		if (!source) return 'no useForm call of the old source renders it';
		if (!source.module) return source.why ?? 'its schema cannot be copied';
		const k = this.n++;
		const name = `fl${k}`;
		const fields = form.fields.filter((f) => !inList(f)).map((f, j) => ({ name: f, path: f.split(/[.[\]]+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? Number(p) : p)), errors: `${name}e${j}`, first: `${name}m${j}`, value: `${name}v${j}` }));
		const valueAt = (path: readonly (string | number)[]) => path.reduce<Json | undefined>((v, key) => (v && typeof v === 'object' ? (v as Record<string | number, Json>)[key] : undefined), form.defaults as Json);
		const declare: string[] = [];
		const handler: string[] = [];
		let lists: ListSpecOut[] = [];
		if (form.list) {
			const placed = this.placeList(form, form.list, form.fields.filter(inList), region, initial, snaps, locate, emit, `${name}r`);
			if (typeof placed === 'string') return placed;
			declare.push(...placed.declare);
			handler.push(...placed.handler);
			lists = [placed.spec];
		}
		for (const f of fields) {
			const e = snaps.filter((s) => s.name === 'error' && s.field === f.name);
			const one = e.find((s) => s.errors?.length === 1)?.root;
			const two = e.find((s) => s.errors?.length === 2)?.root;
			if (!one || !two) continue;
			const c1 = changes(initial, one);
			const c2 = changes(initial, two);
			if (c1.other.length || c2.other.length) return `an error on ${f.name} ${[...c1.other, ...c2.other][0]}`;
			if (!c1.attrs.length && !c1.inserts.length && !c1.texts.length) continue;
			// A branch's text is a state of its own: Markless rebuilds no arm whose text reads into the list it tests.
			declare.push(`let ${f.errors} = state([] as string[]);`, `let ${f.first} = state("");`);
			handler.push(`${f.errors} = d.e[${lit(f.name)}] ?? [];`, `${f.first} = ${f.errors}[0] ?? "";`);
			const E = f.errors;
			for (const a of c1.attrs) {
				const el = at(region, a.path);
				const many = c2.attrs.find((x) => x.name === a.name && x.path.join('/') === a.path.join('/'));
				if (!el) return `an error on ${f.name} changes an element not on the converted page`;
				const value = (v: string | undefined) => (v === undefined ? 'undefined' : lit(v));
				const expr = many && many.to !== a.to ? `${E}.length > 1 ? ${value(many.to)} : ${E}.length ? ${value(a.to)} : ${value(a.from)}` : `${E}.length ? ${value(a.to)} : ${value(a.from)}`;
				this.set(el, { omit: [a.name], extra: [`${a.name}={${expr}}`] });
			}
			if (c1.texts.length) return `an error on ${f.name} changes text the port does not bind`;
			for (const ins of c1.inserts) {
				const parent = at(region, ins.path);
				if (!parent) return `an error on ${f.name} adds to an element not on the converted page`;
				const before = kids(parent)[ins.before] ?? null;
				const many = c2.inserts.find((x) => x.path.join('/') === ins.path.join('/') && x.before === ins.before);
				const single = errorMarkup(ins.html, E, f.first, emit);
				const list = many && many.html !== ins.html ? errorMarkup(many.html, E, f.first, emit) : undefined;
				if (!single || (many && many.html !== ins.html && !list)) return `what an error on ${f.name} adds does not show its message`;
				const markup = list ? `@if (${E}.length === 1) { ${single} }@if (${E}.length > 1) { ${list} }` : `@if (${E}.length) { ${single} }`;
				this.set(parent, { inserts: [{ before, markup }] });
			}
		}
		for (const c of form.controls.filter((x) => x.kind === 'text')) {
			const f = fields.find((x) => x.name === c.field)!;
			const v = snaps.filter((s) => s.name === 'value' && s.field === c.field);
			if (v.length !== TYPED.length) continue;
			const all = v.map((s) => changes(initial, s.root));
			const texts = new Map<string, { path: readonly number[]; from: string; seen: string[] }>();
			for (const ch of all)
				for (const t of ch.texts) {
					const key = t.path.join('/');
					const el = at(region, t.path);
					// A text field's own text is what the visitor typed.
					if (el && /^(input|textarea)$/.test(el.tagName)) continue;
					(texts.get(key) ?? texts.set(key, { path: t.path, from: t.from, seen: [] }).get(key)!).seen.push(t.to);
				}
			for (const t of texts.values()) {
				const el = at(region, t.path);
				const children = t.seen.length === TYPED.length ? textCandidates(t.from, TYPED, t.seen, f.value) : undefined;
				if (!el || kids(el).length || !children) {
					this.notes.push(`form ${form.region.sig.slice(0, 30)}: text at ${t.path.join('/')} follows ${f.name} in a way the port does not bind`);
					continue;
				}
				if (!declare.includes(`let ${f.value} = state("");`)) {
					declare.push(`let ${f.value} = state("");`);
					handler.push(`${f.value} = String(d.v[${lit(f.name)}] ?? "");`);
				}
				this.set(el, { children });
			}
		}
		const mark = (sig: string, nth: number, attrs: Record<string, string>): boolean => {
			const el = locate(sig, nth);
			if (!el || !pathInside(region, el)) return false;
			this.set(el, { extra: Object.entries(attrs).map(([a, v]) => `${a}=${/["{}\\&@\n<>]/.test(v) ? `{${lit(v)}}` : `"${v}"`}`) });
			return true;
		};
		for (const c of form.controls.filter((x) => !inList(x.field))) mark(c.sig, c.nth, { 'data-mm-fl-field': c.field, 'data-mm-fl-kind': c.kind, ...(c.blurs ? { 'data-mm-fl-blur': '' } : {}), ...(c.item !== undefined ? { 'data-mm-fl-item': JSON.stringify(c.item) } : {}), ...(c.items ? { 'data-mm-fl-items': JSON.stringify(c.items) } : {}) });
		for (const r of form.resets) mark(r.sig, r.nth, { 'data-mm-fl-reset': '' });
		for (const [field, el] of Object.entries(form.focus)) if (!inList(field)) mark(el.sig, el.nth, { 'data-mm-fl-focus': field });
		const listDefaults = lists.flatMap((l) => Array.from({ length: l.rows }, (_, row) => l.subs.map((sub) => [`${l.name}.${row}.${sub.name}`, valueAt([...l.path, row, ...sub.path]) ?? sub.item] as const)).flat());
		const entry = { library: form.library, fields: fields.map((f) => ({ name: f.name, path: f.path })), ...(lists.length ? { lists } : {}), ...(source.validators ? { validators: source.validators } : {}), shape: form.defaults, defaults: Object.fromEntries([...fields.map((f) => [f.name, valueAt(f.path) ?? null] as const), ...listDefaults]) };
		const schemaName = `fs_${hash(source.module)}`;
		const specName = `fl_${hash([entry, schemaName])}`;
		this.schemas.set(schemaName, source.module);
		this.entries.set(specName, `${lit(specName)}: { ...${JSON.stringify(entry)}, schema: () => import('./${SCHEMAS_DIR}/${schemaName}.ts').then((m) => m.schema) }`);
		for (const p of source.packages) this.packages.set(p, this.sources.version(p) ?? 'latest');
		// TanStack Form runs on its own core, released with the React adapter the old app used.
		if (form.library === 'tanstack-form') this.packages.set('@tanstack/form-core', this.sources.version('@tanstack/react-form') ?? 'latest');
		this.set(region, { declare, extra: [`data-mm-fl="${specName}"`, ...(handler.length ? [`onMmform={(event) => { const d = (event as CustomEvent<{ e: Record<string, string[]>; v: Record<string, unknown>; rows: Record<string, unknown[]> }>).detail; ${handler.join(' ')} }}`] : [])] });
		return undefined;
	}

	/**
	 * A form's list on Markless state: its rows one keyed @for over a state() of rows (each row's key, index, and each
	 * field's errors and first message) from the first row's markup, every place the first two rows differ by their
	 * index reading the row's. What an error changed in a row follows the row's errors, rendered always and hidden while
	 * it has none (a keyed row holds no arm); what a row shows only while there are others (its Remove) is hidden while it
	 * is alone; Add is disabled at the rows it stops at.
	 */
	private placeList(form: CapturedForm, list: CapturedList, listFields: readonly string[], region: Tree, initial: Tree, snaps: readonly (FormSnapshot & { root: Tree })[], locate: (sig: string, nth: number) => Tree | undefined, emit: (html: string) => string, rows: string): { declare: string[]; handler: string[]; spec: ListSpecOut } | string {
		const listName = list.path.join('.');
		const parsed = listFields.map((f) => {
			const parts = f.split(/[.[\]]+/).filter(Boolean);
			const row = Number(parts[list.path.length]);
			return { field: f, row, sub: parts.slice(list.path.length + 1).map((p) => (/^\d+$/.test(p) ? Number(p) : p)) };
		});
		const subs = [...new Map(parsed.map((p) => [p.sub.join('.'), p.sub])).values()];
		const count = Math.max(...parsed.map((p) => p.row)) + 1;
		const controlOf = (row: number) => {
			const c = form.controls.find((x) => parsed.some((p) => p.field === x.field && p.row === row));
			return c ? locate(c.sig, c.nth) : undefined;
		};
		const first = controlOf(0);
		if (!first) return 'its rows\' fields are not on the converted page';
		// A list loaded with one row is told apart from the second its Add shows; else the first two rows are.
		const two = count < 2 ? snaps.find((x) => x.name === 'rows' && x.value === '2')?.root : undefined;
		if (count < 2 && !two) return 'its list loads with one row and was not seen with two';
		let container: Tree | undefined;
		let rowEls: (Tree | undefined)[];
		if (count >= 2) {
			const second = controlOf(1);
			if (!second) return 'its rows\' fields are not on the converted page';
			container = first;
			while (container && !pathInside(container, second)) container = container.parentNode as Tree;
			if (!container || !pathInside(region, container)) return 'its rows are not in its region';
			rowEls = Array.from({ length: count }, (_, r) => (controlOf(r) ? kids(container!).find((k) => pathInside(k, controlOf(r)!)) : undefined));
		} else {
			container = first.parentNode as Tree;
			while (container && !pathInside(region, container)) container = container.parentNode as Tree;
			// The row is the child of the element whose children the second row adds to.
			const recContainer = (() => {
				for (let el: Tree | undefined = first; el && el !== region; el = el.parentNode as Tree) {
					const parent = el.parentNode as Tree;
					const path = pathIn(region, parent);
					const rec = path ? at(two!, path) : undefined;
					// The container whose children holding a field number one more: a row, not a part a second row adds to the first.
					const holding = (x: Tree) => kids(x).filter((k) => [...walk(k)].some((d) => /^(input|textarea)$/.test(d.tagName))).length;
					if (rec && holding(rec) === holding(parent) + 1) return { parent, rec, row: el };
				}
				return undefined;
			})();
			if (!recContainer) return 'its second row was not found beside its first';
			container = recContainer.parent;
			rowEls = [recContainer.row];
		}
		if (rowEls.some((r) => !r) || new Set(rowEls).size !== rowEls.length) return 'its rows are not one element each';
		const row0 = rowEls[0]!;
		// What the template is emitted from: the first row as the page has it, or as it shows beside a second.
		const rowPathInContainer = kids(container!).indexOf(row0);
		const recordedRows = two ? kids(at(two, pathIn(region, container!)!)!) : undefined;
		const rowA = recordedRows ? recordedRows[rowPathInContainer]! : row0;
		const rowB = recordedRows ? recordedRows[rowPathInContainer + 1]! : rowEls[1]!;
		const inRowA = (el: Tree) => (rowA === row0 ? el : at(rowA, pathIn(row0, el) ?? []));
		const bindings = new Map<Tree, Binding>();
		const add = (el: Tree, b: Binding) => bindings.set(el, mergeBindings(bindings.get(el), b)!);
		// Where the first two rows differ: their index (or its count from one) in attributes and text.
		const indexed = (a: string, b: string): string | undefined => {
			const pa = a.split(/(\d+)/);
			const pb = b.split(/(\d+)/);
			if (pa.length !== pb.length) return undefined;
			const out: string[] = [];
			for (let i = 0; i < pa.length; i++) {
				if (pa[i] === pb[i]) out.push(lit(pa[i]!));
				else if (pa[i] === '0' && pb[i] === '1') out.push('r.i');
				else if (pa[i] === '1' && pb[i] === '2') out.push('(r.i + 1)');
				else return undefined;
			}
			return out.filter((x) => x !== '""').join(' + ') || '""';
		};
		const template = (a: Tree, b: Tree): string | undefined => {
			if (a.tagName !== b.tagName || kids(a).length !== kids(b).length) return `<${a.tagName}> and <${b.tagName}> differ in shape`;
			const expressions: Record<string, string> = {};
			for (const name of new Set([...a.attrs, ...b.attrs].map((x) => x.name))) {
				const va = attr(a, name);
				const vb = attr(b, name);
				if (va === vb) continue;
				const expr = va !== undefined && vb !== undefined ? indexed(va, vb) : undefined;
				if (!expr) return `${name} differs by more than the row's index`;
				expressions[name] = expr;
			}
			const ta = ownText(a);
			const tb = ownText(b);
			if (ta !== tb) {
				const expr = kids(a).length ? undefined : indexed(ta, tb);
				if (!expr) return 'its text differs by more than the row\'s index';
				add(a, { children: `{${expr}}` });
			}
			if (Object.keys(expressions).length) add(a, { expressions });
			for (let i = 0; i < kids(a).length; i++) {
				const why = template(kids(a)[i]!, kids(b)[i]!);
				if (why) return why;
			}
			return undefined;
		};
		const why = template(rowA, rowB);
		if (why) return `its rows differ: ${why}`;
		// A row's fields: their name follows the row.
		for (const c of form.controls) {
			const p = parsed.find((x) => x.field === c.field && x.row === 0);
			const el = p && locate(c.sig, c.nth);
			const own = p && el && pathInside(row0, el) ? inRowA(el) : undefined;
			if (!p || !own) continue;
			add(own, { extra: [`data-mm-fl-field={${lit(`${listName}.`)} + r.i + ${lit(`.${p.sub.join('.')}`)}}`, 'data-mm-fl-kind="text"', ...(c.blurs ? ['data-mm-fl-blur=""'] : [])] });
		}
		// What an error on a row's field changed, within the row, follows that row's errors.
		const rowPath = pathIn(region, row0)!;
		for (const [n, sub] of subs.entries()) {
			const field = parsed.find((p) => p.row === 0 && p.sub.join('.') === sub.join('.'))!.field;
			const e = snaps.filter((x) => x.name === 'error' && x.field === field);
			const one = e.find((x) => x.errors?.length === 1)?.root;
			const two = e.find((x) => x.errors?.length === 2)?.root;
			if (!one || !two) continue;
			const c1 = changes(initial, one);
			const c2 = changes(initial, two);
			const inside = (path: readonly number[]) => rowPath.every((k, i) => path[i] === k);
			const E = `r.e${n}`;
			for (const a of c1.attrs.filter((x) => inside(x.path))) {
				const el = at(rowA, a.path.slice(rowPath.length));
				if (!el) continue;
				const value = (v: string | undefined) => (v === undefined ? 'undefined' : lit(v));
				add(el, { omit: [a.name], extra: [`${a.name}={${E}.length ? ${value(a.to)} : ${value(a.from)}}`] });
			}
			for (const ins of c1.inserts.filter((x) => inside(x.path))) {
				const parent = at(rowA, ins.path.slice(rowPath.length));
				if (!parent) continue;
				const many = c2.inserts.find((x) => x.path.join('/') === ins.path.join('/') && x.before === ins.before);
				const listed = many && many.html !== ins.html;
				const single = errorMarkup(hideMarked(ins.html), E, `r.m${n}`, emit)?.replace(`${HIDE}=""`, `hidden={${listed ? `${E}.length !== 1` : `${E}.length === 0`}}`);
				const several = listed ? errorMarkup(hideMarked(many.html), E, `r.m${n}`, emit)?.replace(`${HIDE}=""`, `hidden={${E}.length < 2}`) : '';
				if (!single || several === undefined) return `what an error on ${field} adds does not show its message`;
				add(parent, { inserts: [{ before: kids(parent)[ins.before] ?? null, markup: single + several }] });
			}
		}
		// What a row shows only while others are there (its Remove), from the list down to one row.
		const alone = count < 2 ? undefined : snaps.find((x) => x.name === 'rows' && x.value === '1')?.root;
		const aloneRow = count < 2 ? row0 : alone ? kids(at(alone, pathIn(region, container)!) ?? alone)[rowPath.at(-1)!] : undefined;
		if (!aloneRow) return 'its list was not seen down to one row';
		const removes: Tree[] = [];
		const onlyWithOthers = (page: Tree, rec: Tree): void => {
			const a = kids(page);
			const b = kids(rec);
			let j = 0;
			for (const child of a) {
				if (j < b.length && child.tagName === b[j]!.tagName && attr(child, 'data-slot') === attr(b[j]!, 'data-slot')) {
					onlyWithOthers(child, b[j]!);
					j++;
				} else {
					add(child, { omit: ['hidden'], extra: [`hidden={${rows}.length < 2}`] });
					removes.push(...[...walk(child)].filter((x) => x.tagName === 'button'));
				}
			}
		};
		onlyWithOthers(rowA, aloneRow);
		if (!removes.length) return 'a row shows no Remove only while others are there';
		for (const b of removes) add(b, { extra: [`data-mm-fl-remove=${lit(listName)}`] });
		add(rowA, { extra: ['data-mm-fl-row={r.i}'] });
		// Add, disabled at the rows it stops at.
		const append = locate(list.append.sig, list.append.nth);
		if (!append || !pathInside(region, append)) return 'its Add is not on the converted page';
		const full = list.max !== undefined ? snaps.find((x) => x.name === 'rows' && x.value === String(list.max))?.root : undefined;
		const fullAdd = full ? [...walk(full)].find((x) => `${x.tagName}|${attr(x, 'data-slot') ?? ''}|${textContent(x).trim().replace(/\s+/g, ' ').slice(0, 60)}` === list.append.sig) : undefined;
		this.set(append, { extra: [`data-mm-fl-append=${lit(listName)}`] });
		if (fullAdd && attr(fullAdd, 'disabled') !== undefined && attr(append, 'disabled') === undefined) this.set(append, { omit: ['disabled'], extra: [`disabled={${rows}.length >= ${list.max}}`] });
		// The rows: the first one's markup, for each row the state holds; the others are its copies.
		const local = new Map(bindings);
		for (const [el, b] of local) this.set(el, b);
		this.lazy.set(row0, () => {
			this.emitting.add(row0);
			const declarations: string[] = [];
			try {
				return { declare: declarations, replace: `@for (const r of ${rows}; key r.k) { ${this.emitter(rowA, declarations)} }` };
			} finally {
				this.emitting.delete(row0);
			}
		});
		for (const el of rowEls.slice(1)) this.set(el!, { replace: '' });
		const initialRows = Array.from({ length: count }, (_, i) => ({ k: i, i, ...Object.fromEntries(subs.flatMap((_, n) => [[`e${n}`, []], [`m${n}`, '']])) }));
		const subSpecs = subs.map((sub) => ({ name: sub.join('.'), path: sub, item: sub.reduce<Json | undefined>((v, k) => (v && typeof v === 'object' ? (v as Record<string | number, Json>)[k] : undefined), list.item) ?? '' }));
		return {
			declare: [`let ${rows} = state(${JSON.stringify(initialRows)} as { k: number; i: number; ${subs.map((_, n) => `e${n}: string[]; m${n}: string`).join('; ')} }[]);`],
			handler: [`${rows} = (d.rows?.[${lit(listName)}] as typeof ${rows} | undefined) ?? ${rows};`],
			spec: { name: listName, path: list.path, subs: subSpecs, rows: count, ...(list.focusAppended ? { focusAppended: true } : {}) },
		};
	}

	/** The module of every placed form's spec, and each schema module, by its file under lib/parts/. */
	files(): Map<string, string> {
		const out = new Map<string, string>();
		if (!this.entries.size) return out;
		out.set(FORMS_MODULE, `// Generated by markless-migrate convert: each form's library, fields and schema; change the converter, not this file.\nimport type { FormEntry } from './form-library.ts';\n\nexport const FORMS: Readonly<Record<string, FormEntry>> = {\n${[...this.entries.values()].map((e) => `\t${e},`).join('\n')}\n};\n`);
		for (const [name, module] of this.schemas) out.set(`${SCHEMAS_DIR}/${name}.ts`, `// Generated by markless-migrate convert: the old source's schema, copied unchanged.\n${module}`);
		return out;
	}
}

/** Where `el` is under `root`, by element child indexes. */
function pathIn(root: Tree, el: Tree): number[] | undefined {
	const path: number[] = [];
	for (let x = el; x !== root; ) {
		const parent = x.parentNode as Tree | null;
		if (!parent || !isElement(parent)) return undefined;
		path.unshift(kids(parent).indexOf(x));
		x = parent;
	}
	return path;
}

const pathInside = (root: Tree, el: Tree): boolean => {
	for (let x: Tree | null = el; x; x = isElement(x.parentNode as Tree) ? (x.parentNode as Tree) : null) if (x === root) return true;
	return false;
};

/** A list's spec as the form-library part reads it. */
interface ListSpecOut {
	readonly name: string;
	readonly path: readonly (string | number)[];
	readonly subs: readonly { readonly name: string; readonly path: readonly (string | number)[]; readonly item: Json }[];
	readonly rows: number;
	readonly focusAppended?: boolean;
}

const HIDE = 'data-mm-fl-hide';
/** Markup with its top element marked, for the hidden attribute bound in its place once emitted. */
function hideMarked(html: string): string {
	const fragment = parseFragment(html) as unknown as Tree;
	const top = kids(fragment)[0];
	if (top) setAttr(top, HIDE, '');
	return outer(top ?? fragment);
}

/** What an error added, as tsrx: the first recorded message as the field's first error (`message`), two messages in siblings as one per error. */
function errorMarkup(html: string, errors: string, message: string, emit: (html: string) => string): string | undefined {
	const fragment = parseFragment(html) as unknown as Tree;
	const all = [...walk(fragment)];
	const first = all.find((el) => ownText(el) === MESSAGES[0] && kids(el).length === 0);
	const second = all.find((el) => ownText(el) === MESSAGES[1] && kids(el).length === 0);
	if (!first) return undefined;
	if (!second) return emit(html).replace(MESSAGES[0], `{${message}}`);
	if (first.parentNode !== second.parentNode || first.tagName !== second.tagName) return undefined;
	const item = emit(outer(first));
	const out = emit(html).replace(`${item}${emit(outer(second))}`, `@for (const m of ${errors}; key m) { ${item.replace(MESSAGES[0], '{m}')} }`);
	return out.includes(MESSAGES[1]) ? undefined : out;
}
