import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { VIEWPORTS } from '../check/types.ts';
import { fresh, quiet, type Reveal } from './reveal.ts';
import type { ToggleGroup, ToggleState } from './toggles.ts';

/**
 * The checkbox and radio items of a menu layer as the old page switched them: each group's markup on and off, and
 * whether the choice outlived the menu (React state the page holds: `kept`) or came back as it was once the menu opened
 * again (Base UI's own state, unmounted with the popup: `reset`). Items whose state no press changed are left out.
 */
export interface MenuToggles {
	readonly key: string;
	readonly groups: readonly (ToggleGroup & { readonly lasts: 'kept' | 'reset' })[];
}

const CHECKABLE = '[role="menuitemcheckbox"], [role="menuitemradio"]';
const SUB_TRIGGER = '[role^="menuitem"][aria-haspopup="menu"]';

/** The reveal that opens this one: the menu holding its trigger (a submenu's reveal is keyed by it). */
function parentOf(r: Reveal, all: readonly Reveal[]): Reveal | undefined {
	if (r.path[0] !== -1) return undefined;
	return all.find((p) => p !== r && p.added.some((a) => a.html.includes(`data-mm-key="${r.key}"`) || new RegExp(`id="${r.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*aria-haspopup="menu"|aria-haspopup="menu"[^>]*id="${r.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(a.html)));
}

/** The place of a submenu's trigger among the sub-triggers of its menu's recorded markup. */
function triggerIndex(r: Reveal, parent: Reveal): number {
	const html = parent.added.map((a) => a.html).join('');
	const tags = html.match(/<[^>]*aria-haspopup="menu"[^>]*>/g) ?? [];
	return tags.filter((t) => /role="menuitem/.test(t)).findIndex((t) => t.includes(`data-mm-key="${r.key}"`) || t.includes(`id="${r.key}"`));
}

const visibleMenus = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[role="menu"]')].filter((m) => m.getClientRects().length && getComputedStyle(m).visibility !== 'hidden').length);

/** Opens the menu a reveal shows, through the menus it opens from; marks it `data-mm-menu-under-test`. */
async function openMenu(page: Page, r: Reveal, all: readonly Reveal[]): Promise<boolean> {
	const parent = parentOf(r, all);
	if (parent && !(await openMenu(page, parent, all))) return false;
	// What opens now is the menu after those already in the page.
	const before = await page.evaluate(() => [...document.querySelectorAll('[role="menu"]')].length);
	if (parent) {
		const k = triggerIndex(r, parent);
		const trigger = page.locator('[data-mm-menu-under-test]').locator(SUB_TRIGGER).nth(k);
		if (k < 0 || !(await trigger.hover({ timeout: 2000 }).then(() => true, () => false))) return false;
		await quiet(page, 400);
	} else {
		const el = (
			await page.evaluateHandle((path) => {
				let node: Element | undefined = document.body;
				for (const i of path) node = node?.children[i];
				return node ?? null;
			}, r.path)
		).asElement();
		if (!el) return false;
		const clicked = await el.click({ timeout: 2000, button: r.action === 'contextmenu' ? 'right' : 'left' }).then(() => true, () => false);
		if (!clicked) return false;
		await quiet(page, 400);
	}
	return page.evaluate((before) => {
		const menus = [...document.querySelectorAll('[role="menu"]')];
		for (const m of menus) m.removeAttribute('data-mm-menu-under-test');
		const opened = menus.slice(before).find((m) => m.getClientRects().length) ?? menus.filter((m) => m.getClientRects().length).at(-1);
		opened?.setAttribute('data-mm-menu-under-test', '');
		return Boolean(opened);
	}, before);
}

interface Item {
	readonly sig: string;
	readonly nth: number;
	readonly role: string;
	readonly group: number;
	readonly state: ToggleState & { readonly on: boolean };
}

/** The menu's checkable items, as the markup convert renders reads them: pointer and focus marks left out. */
function readItems(page: Page): Promise<Item[]> {
	return page.evaluate((selector) => {
		const menu = document.querySelector('[data-mm-menu-under-test]');
		if (!menu) return [];
		// The pointer's and focus's marks follow use, not the item's state (the menu's port writes them).
		const kept = (a: Attr) => !/^(data-highlighted|data-hovered|data-pressed|data-focused|data-focus-visible|tabindex|data-mm-menu-under-test|data-mm-press)$/.test(a.name);
		const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		const canon = (n: Node): string => {
			if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent ?? '');
			if (!(n instanceof Element)) return '';
			const tag = n.tagName.toLowerCase();
			const list = [...n.attributes].filter(kept).sort((a, b) => (a.name < b.name ? -1 : 1)).map((a) => ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
			return /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/.test(tag) ? `<${tag}${list}>` : `<${tag}${list}>${[...n.childNodes].map(canon).join('')}</${tag}>`;
		};
		const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
		const counts = new Map<string, number>();
		const nths = new Map<Element, number>();
		for (const el of menu.querySelectorAll('*')) {
			const sig = sigOf(el);
			nths.set(el, counts.get(sig) ?? 0);
			counts.set(sig, (counts.get(sig) ?? 0) + 1);
		}
		const groups: Element[] = [];
		return [...menu.querySelectorAll(selector)]
			.filter((el) => el.closest('[role="menu"]') === menu)
			.map((el) => {
				const role = el.getAttribute('role')!;
				const holder = role === 'menuitemradio' ? (el.closest('[role="group"]') ?? menu) : el;
				if (!groups.includes(holder)) groups.push(holder);
				return { sig: sigOf(el), nth: nths.get(el) ?? 0, role, group: groups.indexOf(holder), state: { attrs: Object.fromEntries([...el.attributes].filter(kept).map((a) => [a.name, a.value])), inner: [...el.childNodes].map(canon).join(''), on: el.getAttribute('aria-checked') === 'true' } };
			});
	}, CHECKABLE);
}

// Ids a menu generates as it mounts differ on each opening: each state keeps the ones the layer was captured with.
const GENERATED = ['id', 'aria-labelledby', 'aria-describedby', 'aria-controls'];
const settle = (state: ToggleState, like: ToggleState): ToggleState => ({ attrs: { ...state.attrs, ...Object.fromEntries(GENERATED.filter((a) => a in like.attrs).map((a) => [a, like.attrs[a]!])) }, inner: state.inner });

async function closeAll(page: Page): Promise<void> {
	for (let i = 0; i < 3 && (await visibleMenus(page)); i++) {
		await page.keyboard.press('Escape').catch(() => {});
		await quiet(page, 250);
	}
}

/**
 * Presses one item on a fresh page and reads the menu's items after it, then again once the menu has closed and opened
 * again: undefined when the menu could not be opened.
 */
async function press(browser: Browser, origin: string, route: string, r: Reveal, all: readonly Reveal[], at: Item): Promise<{ before: Item[]; after: Item[]; reopened: Item[] } | undefined> {
	const { context, page } = await fresh(browser, origin, route, VIEWPORTS[0]!);
	try {
		if (!(await openMenu(page, r, all))) return undefined;
		const before = await readItems(page);
		const target = before.find((i) => i.sig === at.sig && i.nth === at.nth);
		if (!target) return undefined;
		await page.evaluate(([selector, sig, nth]) => {
			const menu = document.querySelector('[data-mm-menu-under-test]')!;
			const sigOf = (el: Element) => `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}`;
			const el = [...menu.querySelectorAll('*')].filter((e) => e.matches(selector) || sigOf(e) === sig).filter((e) => sigOf(e) === sig)[nth];
			el?.setAttribute('data-mm-press', '');
		}, [CHECKABLE, at.sig, at.nth] as const);
		await page.locator('[data-mm-press]').first().click({ timeout: 2000 });
		await quiet(page, 400);
		// A menu still open after the press (one its library drew again keeps no mark): its last open menu.
		const open = await page.evaluate(() => {
			const shown = [...document.querySelectorAll('[role="menu"]')].filter((m) => m.getClientRects().length && getComputedStyle(m).visibility !== 'hidden');
			const marked = shown.find((m) => m.hasAttribute('data-mm-menu-under-test')) ?? shown.at(-1);
			marked?.setAttribute('data-mm-menu-under-test', '');
			return Boolean(marked);
		});
		let after = open ? await readItems(page) : [];
		if (!after.length) {
			await closeAll(page);
			if (!(await openMenu(page, r, all))) return undefined;
			after = await readItems(page);
		}
		await closeAll(page);
		if (!(await openMenu(page, r, all))) return undefined;
		const reopened = await readItems(page);
		return { before, after, reopened };
	} catch {
		return undefined;
	} finally {
		await context.close().catch(() => {});
	}
}

/** Captures the checkable items of every menu layer a route reveals. Cached by route and menus. */
export async function captureMenuToggles(browser: Browser, origin: string, route: string, dir: string, reveals: readonly Reveal[]): Promise<readonly MenuToggles[]> {
	const menus = reveals.filter((r) => r.added.some((a) => /role="menuitem(checkbox|radio)"/.test(a.html)));
	if (!menus.length) return [];
	const file = join(dir, `${createHash('sha256').update(`menu-toggles:4:${route}|${JSON.stringify(menus.map((m) => [m.key, m.sig, m.nth, m.path, m.action]))}`).digest('hex').slice(0, 16)}.json`);
	const cached = await readFile(file, 'utf8').then((text) => JSON.parse(text) as { route: string; menus: MenuToggles[] }, () => undefined);
	if (cached && cached.route === route) return cached.menus;
	const out: MenuToggles[] = [];
	for (const r of menus) {
		const probe = await fresh(browser, origin, route, VIEWPORTS[0]!);
		let items: Item[] = [];
		try {
			if (await openMenu(probe.page, r, reveals)) items = await readItems(probe.page);
		} catch {
			items = [];
		} finally {
			await probe.context.close().catch(() => {});
		}
		const groups: (ToggleGroup & { lasts: 'kept' | 'reset' })[] = [];
		for (const g of [...new Set(items.map((i) => i.group))]) {
			const members = items.filter((i) => i.group === g);
			const radio = members[0]!.role === 'menuitemradio';
			const on = new Map<number, ToggleState>();
			const off = new Map<number, ToggleState>();
			let lasts: 'kept' | 'reset' | undefined;
			const targets = radio ? members.filter((m) => !m.state.on) : members;
			for (const t of targets) {
				const result = await press(browser, origin, route, r, reveals, t);
				if (!result) continue;
				const k = members.indexOf(t);
				const now = result.after.find((i) => i.sig === t.sig && i.nth === t.nth);
				if (!now || now.state.on === t.state.on) continue;
				(t.state.on ? off : on).set(k, settle(now.state, t.state));
				(t.state.on ? on : off).set(k, t.state);
				if (radio)
					members.forEach((m, j) => {
						if (!m.state.on) return;
						const was = result.after.find((i) => i.sig === m.sig && i.nth === m.nth);
						on.set(j, m.state);
						if (was) off.set(j, settle(was.state, m.state));
					});
				const back = result.reopened.find((i) => i.sig === t.sig && i.nth === t.nth);
				lasts ??= back && back.state.on === now.state.on ? 'kept' : 'reset';
			}
			if (!lasts || members.some((_, k) => !on.has(k) || !off.has(k))) continue;
			if (radio) groups.push({ kind: 'radio', lasts, controls: members.map((m, k) => ({ sig: m.sig, nth: m.nth, role: m.role, initial: m.state.on, on: on.get(k)!, off: off.get(k)! })) });
			else for (const [k, m] of members.entries()) if (on.has(k) && off.has(k)) groups.push({ kind: 'toggle', lasts, controls: [{ sig: m.sig, nth: m.nth, role: m.role, initial: m.state.on, on: on.get(k)!, off: off.get(k)! }] });
		}
		if (groups.length) out.push({ key: r.key, groups });
	}
	await mkdir(dir, { recursive: true });
	await writeFile(file, JSON.stringify({ route, menus: out }));
	return out;
}
