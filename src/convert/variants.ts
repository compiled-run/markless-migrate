// Pages whose markup a query value changes in place (a preview frame's icon library): each value's page captured, the
// elements that differ recorded by position, and checked to sit in the same structure under every value.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { openPage } from '../check/browser.ts';
import { finishAnimations, settle } from '../check/capture.ts';
import { loadPage } from '../check/infrastructure.ts';
import { VIEWPORTS } from '../check/types.ts';
import { SCRIPTS_STILL_CAP_MS } from './capture.ts';
import { captureEnv } from './capture-env.ts';
import { attr, body, parseDocument, setAttr, walk, type Element } from './dom.ts';
import type { Binding } from './tsrx.ts';
import { serialize } from 'parse5';
import { scriptsStill, trackSettling } from './settle.ts';

/** A site's fact (`lib/site/variants.json`): the routes whose `elements` change with the query value `query`, by `name`. */
export interface VariantSpec {
	readonly routes: string;
	readonly name: string;
	readonly query: string;
	/** Each value's name and the query value that shows it; the empty one is the page as it loads. */
	readonly values: Readonly<Record<string, string>>;
	readonly elements: string;
	/** Where the values come from, in words. */
	readonly source: string;
}

export interface VariantCapture {
	readonly route: string;
	readonly name: string;
	/** The value the page shows as it loads. */
	readonly initial: string;
	readonly count: number;
	/** The structure around each element (its ancestors' tags and data-slots), the same under every value. */
	readonly frames: readonly string[];
	/** Each element that differs between values, by position: its markup under each value. */
	readonly swaps: readonly { readonly index: number; readonly markup: Readonly<Record<string, string>> }[];
	/** Why the values cannot be swapped by position: the elements or the structure around them differ. */
	readonly failed?: string;
}

// Runs in the page: each top-level element the spec names, its markup and its ancestors' tags and slots.
function readElements(selector: string): { markup: string; frame: string }[] {
	const frameOf = (el: globalThis.Element) => {
		const out: string[] = [];
		for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) out.push(`${up.tagName.toLowerCase()}${up.getAttribute('data-slot') ? `.${up.getAttribute('data-slot')}` : ''}`);
		return out.join('<');
	};
	return [...document.body.querySelectorAll(selector)].filter((el) => !el.closest('template') && !el.parentElement?.closest(selector)).map((el) => ({ markup: el.outerHTML, frame: frameOf(el) }));
}

/** Each value's page of the route, the elements that differ recorded by position, checked to be in one structure. */
export async function captureVariants(browser: Browser, origin: string, route: string, dir: string, spec: VariantSpec): Promise<VariantCapture> {
	const file = join(dir, `${createHash('sha256').update(`variants:1:${route}|${JSON.stringify(spec)}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((t) => JSON.parse(t) as VariantCapture, () => undefined);
	if (cached && cached.route === route) return cached;
	const names = Object.keys(spec.values);
	const initial = names.find((n) => spec.values[n] === '') ?? names[0] ?? '';
	const read: Record<string, { markup: string; frame: string }[]> = {};
	for (const name of names) {
		const { context, page } = await openPage(browser, captureEnv(origin), VIEWPORTS[0] ?? { name: 'desktop', width: 1280, height: 800, isMobile: false });
		await trackSettling(context);
		try {
			const url = new URL(route, origin);
			const value = spec.values[name];
			if (value) url.searchParams.set(spec.query, value);
			await loadPage(page, url.href);
			await settle(page);
			await finishAnimations(page);
			await scriptsStill(page, SCRIPTS_STILL_CAP_MS).catch(() => undefined);
			read[name] = await page.evaluate(readElements, spec.elements);
		} finally {
			await context.close().catch(() => {});
		}
	}
	const base = read[initial] ?? [];
	let failed: string | undefined;
	for (const name of names) {
		const other = read[name] ?? [];
		if (other.length !== base.length) failed ??= `${spec.name} ${name} shows ${other.length} ${spec.elements} where ${initial} shows ${base.length}`;
		else {
			const at = other.findIndex((x, i) => x.frame !== base[i]?.frame);
			if (at >= 0) failed ??= `${spec.name} ${name}: ${spec.elements} ${at} sits in ${other[at]?.frame || 'the body'} where ${initial}'s sits in ${base[at]?.frame || 'the body'}`;
		}
	}
	const swaps = failed ? [] : base.flatMap((x, index) => (names.some((n) => read[n]?.[index]?.markup !== x.markup) ? [{ index, markup: Object.fromEntries(names.map((n) => [n, read[n]?.[index]?.markup ?? ''])) }] : []));
	const capture: VariantCapture = { route, name: spec.name, initial, count: base.length, frames: base.map((x) => x.frame), swaps, ...(failed ? { failed } : {}) };
	if (!failed) {
		await mkdir(dir, { recursive: true });
		await writeFile(file, JSON.stringify(capture));
	}
	return capture;
}

/**
 * Marks, in the captured document the page is written from, each element that a value changes (`data-mm-variant`, its
 * position), once that document is checked to hold the same elements in the same structure as each value's page. Done
 * before convert inserts what controls reveal, so only what the captured page showed is matched.
 */
export function markVariants(html: string, capture: VariantCapture, selector: string): { readonly html?: string; readonly failed?: string } {
	const doc = parseDocument(html);
	const page = body(doc);
	const tag = selector.toLowerCase();
	const found = [...walk(page)].filter((el) => el.tagName === tag && !inside(el, 'template') && !inside(el, tag));
	const frameOf = (el: Element) => {
		const out: string[] = [];
		for (let up = el.parentNode as Element | null; up && up !== page && up.tagName; up = up.parentNode as Element | null) out.push(`${up.tagName}${attr(up, 'data-slot') ? `.${attr(up, 'data-slot')}` : ''}`);
		return out.join('<');
	};
	const at = found.findIndex((el, i) => frameOf(el) !== capture.frames[i]);
	const odd = found[at];
	if (found.length !== capture.count) return { failed: `the captured page holds ${found.length} ${selector} where each value's held ${capture.count}${odd ? `; the first that differs is ${selector} ${at}, in ${frameOf(odd) || 'the body'}` : ''}` };
	if (odd) return { failed: `${selector} ${at} sits in ${frameOf(odd) || 'the body'} on the captured page, in ${capture.frames[at] || 'the body'} on each value's` };
	for (const { index } of capture.swaps) {
		const el = found[index];
		if (el) setAttr(el, 'data-mm-variant', String(index));
	}
	return { html: serialize(doc) };
}

/**
 * The written page's marked elements on Markless state: each marked element's parent holds one state of the value its
 * page shows (`onMmvariant` sets it), and each marked element is an `@switch` arm per value, its captured markup in each.
 * No part writes a node: the frame sends the value as an event and Markless renders the arm.
 */
export class VariantPlan {
	private readonly bindings = new Map<Element, Binding>();
	private readonly names = new Map<Element, string>();
	private n = 0;

	bind(el: Element): Binding | undefined {
		return this.bindings.get(el);
	}

	/** The state an element's arms read: part of its identity, so no shared component holds it for two pages. */
	nameOf(el: Element): string | undefined {
		return this.names.get(el);
	}

	/** Binds the page's marked elements; returns how many of the page's elements of the kind are not marked beyond the captured ones no value changes (what convert inserts from reveals). */
	add(page: Element, capture: VariantCapture, selector: string, emit: (html: string) => string): { readonly bound: number; readonly unswapped: number } {
		const tag = selector.toLowerCase();
		const all = [...walk(page)].filter((el) => el.tagName === tag && !inside(el, 'template') && !inside(el, tag));
		const marked = all.filter((el) => attr(el, 'data-mm-variant') !== undefined);
		const byIndex = new Map(capture.swaps.map((s) => [String(s.index), s.markup]));
		const values = Object.keys(capture.swaps[0]?.markup ?? {});
		const holders = new Map<Element, Element[]>();
		for (const el of marked) {
			const parent = el.parentNode as Element;
			const kids = holders.get(parent) ?? [];
			holders.set(parent, [...kids, el]);
		}
		for (const [parent, kids] of holders) {
			const name = `iv${this.n++}`;
			this.names.set(parent, name);
			this.bindings.set(parent, { declare: [`let ${name} = state(${JSON.stringify(capture.initial)});`], extra: [`data-mm-variant-holder=${JSON.stringify(capture.name)}`, `onMmvariant={(event) => (${name} = (event as CustomEvent<string>).detail)}`] });
			for (const el of kids) {
				const markup = byIndex.get(attr(el, 'data-mm-variant') ?? '') ?? {};
				const arms = values.filter((v) => v !== capture.initial).map((v) => `@case ${JSON.stringify(v)}: {\n${emit(markup[v] ?? '')}\n}`);
				this.names.set(el, name);
				this.bindings.set(el, { replace: `@switch (${name}) {\n${arms.join('\n')}\n@default: {\n${emit(markup[capture.initial] ?? '')}\n}\n}` });
			}
		}
		return { bound: marked.length, unswapped: Math.max(0, all.length - marked.length - (capture.count - capture.swaps.length)) };
	}
}

const inside = (el: Element, tag: string): boolean => {
	for (let up = el.parentNode as Element | null; up && up.tagName; up = up.parentNode as Element | null) if (up.tagName === tag) return true;
	return false;
};
