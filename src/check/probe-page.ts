/**
 * Runs in the page (evaluated whole, so it stays self-contained): finds the controls the widget probes use, marks the one a
 * probe drives, and reads what a visitor meets after each step: focus and whether it shows its ring, the control's and its
 * widget's state attributes, what is open, toasts, tab stops, scroll lock and what the page hides behind a modal.
 */
export function installProbe(): void {
	const MARK = 'data-markless-migrate-probe';
	const STATE = /^(aria-(expanded|selected|checked|pressed|current|valuenow|valuetext|activedescendant|disabled|invalid|modal|hidden)|data-(state|selected|open|pressed|checked|expanded|highlighted|active|focused|focus-visible|hovered|disabled|dragging|orientation|swipe|front|visible|mounted|removed|index|y-position|x-position|resize-handle-state|separator|panel-size|indeterminate|invalid|placeholder|today|outside-month|range-start|range-end|range-middle|selection-start|selection-end|unavailable|popup-open|starting-style|ending-style)|tabindex|hidden|open|inert)$/;
	const POPUP = 'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [role="tree"], [role="grid"][data-mm-layer], [popover]';
	const ITEM = '[role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="treeitem"]';
	const COMPOSITE = '[role="tablist"], [role="radiogroup"], [role="toolbar"], [role="menubar"], [role="listbox"], [role="grid"], [role="treegrid"], [role="tree"], [role="table"], table, [role="group"]';
	const shown = (e: Element | null | undefined): e is Element => {
		if (!e || !e.isConnected) return false;
		const r = e.getBoundingClientRect();
		return r.width >= 1 && r.height >= 1 && e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
	};
	const text = (e: Element | null | undefined, n = 40) => ((e instanceof HTMLElement ? e.innerText : e?.textContent) ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	const anonymous = (v: string) => v.replace(/(react-aria|radix-|base-ui-|headlessui-|mm-|_r_|«|:r)[\w:«»-]*/gi, '#id').replace(/\b[0-9a-f]{8,}\b/gi, '#id');
	const IMPLICIT: Record<string, string> = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', dialog: 'dialog', summary: 'button', table: 'table', li: 'listitem' };
	const roleOf = (e: Element) => e.getAttribute('role') ?? (e instanceof HTMLInputElement ? ({ range: 'slider', checkbox: 'checkbox', radio: 'radio' } as Record<string, string>)[e.type] ?? 'textbox' : IMPLICIT[e.localName] ?? e.localName);
	const name = (e: Element) => {
		const by = e.getAttribute('aria-labelledby');
		const label = e.getAttribute('aria-label') ?? (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '');
		return (label || text(e, 30)).replace(/\s+/g, ' ').trim().slice(0, 30);
	};
	const describe = (e: Element | null) => {
		if (!e || e === document.body || e === document.documentElement) return 'the page (body)';
		const slot = e.getAttribute('data-slot');
		const n = name(e);
		return `${roleOf(e)}${slot ? ` {${slot}}` : ''}${n ? ` "${n}"` : ''}`;
	};
	const attrs = (e: Element, skip?: RegExp) => {
		const out: string[] = [];
		// A fractional value (a panel at 65.707%) is read to the whole unit: its last digits follow the layout, not the state.
		const whole = (v: string) => (/^-?\d+\.\d+$/.test(v) ? String(Math.round(Number(v))) : v);
		for (const a of e.attributes) if (STATE.test(a.name) && !(skip && skip.test(a.name))) out.push(`${a.name}=${whole(anonymous(a.value)).slice(0, 40)}`);
		if (e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) out.push(`checked=${e.checked}`);
		else if (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement) out.push(`value=${e.value.slice(0, 40)}`);
		return out.sort().join(' ');
	};
	const control = () => document.querySelector(`[${MARK}]`);
	// Every element that scrolled since the last reading, its name taken as it scrolled: a list that jumps while its pop-up fades out is gone by the reading.
	const g = globalThis as { __markless_migrate_probe_scrolled__?: Set<string> };
	if (!g.__markless_migrate_probe_scrolled__) {
		const scrolled = (g.__markless_migrate_probe_scrolled__ = new Set<string>());
		addEventListener('scroll', (e) => {
			if (e.target instanceof Element && e.target !== document.scrollingElement && scrolled.size < 20) scrolled.add(describe(e.target));
		}, { capture: true, passive: true });
	}
	const AROUND = 'section, article, figure, form, fieldset, [role="region"], [role="group"], [role="tabpanel"]';
	const items = () => {
		const top = [...document.querySelectorAll(POPUP)].filter((p) => shown(p) && p.querySelector(ITEM)).pop();
		return top ? [...top.querySelectorAll(ITEM)].filter(shown) : [];
	};
	// The widget around the control, by what it is rather than how many wrappers a port adds: its composite, else the nearest group, form, section or component part holding it.
	const SCOPE = `${COMPOSITE}, form, fieldset, figure, section, article, label, [role="region"], [role="group"], [data-slot]:not([data-slot$="trigger"]):not([data-slot="button"])`;
	const scopeOf = (el: Element) => {
		const composite = el.closest(COMPOSITE);
		if (composite && composite.querySelectorAll('*').length <= 400) return composite;
		let at = el.parentElement;
		for (let n = 0; at && at !== document.body && n < 6; at = at.parentElement, n++) if (at.matches(SCOPE)) break;
		return at && at !== document.body && at.matches(SCOPE) && at.querySelectorAll('*').length <= 150 ? at : el;
	};
	const scopeState = (scope: Element, own: Element) => {
		const out: string[] = [];
		const count = new Map<string, number>();
		for (const e of [scope, ...scope.querySelectorAll('*')]) {
			if (e === own || e.closest('template, svg defs')) continue;
			// A library's empty focus guards around what it opened are its own plumbing, not state a visitor meets.
			if (e.localName === 'span' && e.getAttribute('aria-hidden') === 'true' && e.hasAttribute('tabindex') && !e.childElementCount && !e.textContent) continue;
			const key = `${e.localName}${e.getAttribute('data-slot') ? `{${e.getAttribute('data-slot')}}` : ''}${e.getAttribute('role') ? `[${e.getAttribute('role')}]` : ''}`;
			const n = (count.get(key) ?? 0) + 1;
			count.set(key, n);
			const a = attrs(e, /^data-(hovered|focus-visible|focused)$/);
			if (a) out.push(`${key} #${n}: ${a}`);
		}
		return out;
	};
	const tabStops = (root: Element) => {
		const stops = [root, ...root.querySelectorAll('*')].filter((e) => e instanceof HTMLElement && e.tabIndex >= 0 && !e.matches(':disabled') && !e.closest('[inert]') && shown(e) && (e.hasAttribute('tabindex') || e.matches('a[href], button, input, select, textarea, summary, [contenteditable="true"]')));
		return `${stops.length}: ${stops.slice(0, 8).map(describe).join(', ')}`;
	};
	const popups = () => {
		const list = [...document.querySelectorAll(POPUP)].filter((p) => shown(p) && (!p.hasAttribute('popover') || p.matches(':popover-open')));
		const outer = list.filter((p) => !list.some((o) => o !== p && o.contains(p) && !p.matches('[role="dialog"], [role="alertdialog"], dialog')));
		return outer.map((p) => {
			const items = [...p.querySelectorAll(ITEM)].filter(shown);
			const active = items.filter((i) => i === document.activeElement || i.hasAttribute('data-highlighted') || i.hasAttribute('data-focused') || i.id === document.activeElement?.getAttribute('aria-activedescendant')).map((i) => text(i, 20));
			const chosen = items.filter((i) => i.getAttribute('aria-selected') === 'true' || i.getAttribute('aria-checked') === 'true').map((i) => text(i, 20));
			const state = p.getAttribute('data-state');
			// Its line count: a port that renders a layer's content twice (a date picker's month) shows it twice as long.
			const rows = (p instanceof HTMLElement ? p.innerText : '').split('\n').filter((l) => l.trim()).length;
			return `${roleOf(p)}${items.length ? ` (${items.length} items, highlighted: ${active.join('|') || 'none'}, chosen: ${chosen.join('|') || 'none'})` : ` "${text(p, 30)}"`}, ${rows} lines${state ? ` state=${state}` : ''}`;
		}).sort();
	};
	const toasts = () => {
		const list = [...document.querySelectorAll('[data-sonner-toast], [role="status"][data-state], li[role="status"], [data-toast], [role="alert"][data-state]')].filter(shown);
		return list.map((t) => `"${text(t, 30)}"${['data-front', 'data-expanded', 'data-index', 'data-visible'].map((a) => (t.hasAttribute(a) ? ` ${a.slice(5)}=${t.getAttribute(a)}` : '')).join('')}`);
	};
	// Whether the page behind what is open is hidden from assistive tech or made inert, read on the main content and the control.
	const behind = (el: Element) => {
		const of = (e: Element | null) => (!e ? '' : e.closest('[inert]') ? 'inert' : e.closest('[aria-hidden="true"]') ? 'hidden' : 'available');
		const main = document.querySelector('main, [role="main"]');
		return `main ${of(main) || 'absent'}, control ${of(el)}`;
	};
	// Transforms and offsets of what a drag moves, rounded to whole pixels: sub-pixel placement is layout noise.
	const geometry = (scope: Element) => {
		const out: string[] = [];
		for (const e of [scope, ...scope.querySelectorAll('*')]) {
			if (!(e instanceof HTMLElement) || !e.style) continue;
			const t = e.style.transform || e.style.translate;
			const flex = e.style.flexGrow || e.style.flexBasis || (e.style.flex ? e.style.flex.split(' ')[0] : '');
			const left = e.style.left || e.style.insetInlineStart || e.style.right;
			const rounded = (v: string) => v.replace(/-?\d+(\.\d+)?/g, (n) => String(Math.round(Number(n))));
			if (t && t !== 'none') out.push(`${e.localName}${e.getAttribute('data-slot') ? `{${e.getAttribute('data-slot')}}` : ''} transform ${rounded(t)}`);
			if (flex) out.push(`${e.localName}${e.getAttribute('data-slot') ? `{${e.getAttribute('data-slot')}}` : ''} flex ${rounded(flex)}`);
			if (left && e.closest('[role="slider"], [data-slot*="slider"], [data-orientation]')) out.push(`${e.localName} at ${rounded(left)}`);
			if (out.length >= 12) break;
		}
		return out;
	};
	const strip = (html: string) => html.replace(/ data-markless-migrate-[\w-]+(="[^"]*")?/g, '').replace(/\s+/g, ' ');
	const openTag = (e: Element) => `<${e.localName}${[...e.attributes].filter((a) => !a.name.startsWith('data-markless-migrate')).map((a) => ` ${a.name}="${a.value}"`).join('')}>`;
	const probe = {
		/**
		 * What makes two copies of a widget the same one, hashed: the control's markup, the opening tags of the four elements
		 * around it (what a converter part's selectors match), its label, and what it controls when that is on the page. Ids a
		 * library or the converter derives per page, and a Markless page's handler numbers, are numbered by first use, so only how
		 * they point at each other counts.
		 */
		print(el: Element): string {
			const parts = [describe(el), strip(el.outerHTML)];
			for (let at = el.parentElement, n = 0; at && at !== document.body && n < 4; at = at.parentElement, n++) parts.push(openTag(at));
			const labels = el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement ? [...(el.labels ?? [])] : [];
			for (const id of `${el.getAttribute('aria-labelledby') ?? ''} ${el.getAttribute('aria-controls') ?? ''}`.split(/\s+/).filter(Boolean)) {
				const target = document.getElementById(id);
				if (target && !target.contains(el) && !labels.includes(target as HTMLLabelElement)) labels.push(target as HTMLLabelElement);
			}
			for (const target of labels) parts.push(strip(target.outerHTML));
			const numbered = new Map<string, string>();
			const handlers = new Map<string, string>();
			// A Markless page numbers its handlers in page order: what an element listens for is kept, the number counted from this widget.
			const text = parts.join('\n').replace(/(m:on="[^"]*")/g, (on) => on.replace(/:(\d+)/g, (_, n: string) => `:#h${handlers.get(n) ?? (handlers.set(n, String(handlers.size)), handlers.get(n))}`)).replace(/\b(react-aria|radix-|base-ui-|headlessui-|mm-[0-9a-f]+-|_r_|«|:r)[\w:«»-]*/gi, (id) => numbered.get(id) ?? (numbered.set(id, `#id${numbered.size}`), numbered.get(id)!));
			let h1 = 0x811c9dc5;
			let h2 = 0x01000193;
			for (let i = 0; i < text.length; i++) {
				const c = text.charCodeAt(i);
				h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
				h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
			}
			return `${text.length}:${h1.toString(16)}${h2.toString(16)}`;
		},
		mark(el: Element): void {
			for (const o of document.querySelectorAll(`[${MARK}]`)) o.removeAttribute(MARK);
			el.setAttribute(MARK, '');
		},
		/** What a visitor meets now: one entry per field, each a line or a list. */
		read(): Record<string, string | string[]> {
			const el = control();
			const active = document.activeElement;
			const out: Record<string, string | string[]> = { url: location.pathname + location.search };
			const focusAt = !active || active === document.body ? 'the page (body)' : el && active === el ? `the control` : el && el.contains(active) ? `inside the control: ${describe(active)}` : describe(active);
			out.focus = focusAt;
			out['focus ring'] = active && active !== document.body ? (active.matches(':focus-visible') ? 'shown (:focus-visible)' : 'not shown') + (active.hasAttribute('data-focus-visible') ? ', data-focus-visible' : '') : 'no focus';
			if (!el) {
				out.control = 'gone';
				return out;
			}
			out.control = `${attrs(el)} "${text(el, 30)}"`;
			const hovered = [...document.querySelectorAll('[data-hovered], [data-hover]')].filter((h) => h.getAttribute('data-hovered') !== 'false').map(describe);
			out.hovered = hovered.slice(0, 6);
			const scope = scopeOf(el);
			out.widget = scopeState(scope, el);
			out['widget text'] = text(scope, 160);
			// What the rest of the demo or section shows: a control's change another element reads (a label, a count, a chart).
			const around = scope.parentElement?.closest(AROUND);
			if (around && around !== document.body) out.around = text(around, 300);
			if (scope.matches(COMPOSITE)) out['tab stops'] = tabStops(scope);
			out.open = popups();
			// In order: which toast is in front, and how they stack, is what a visitor sees.
			const t = toasts();
			out.toasts = t.length ? `${t.length} shown: ${t.join(', ')}` : 'none';
			const body = getComputedStyle(document.body);
			const html = getComputedStyle(document.documentElement);
			out['page lock'] = `scroll ${body.overflow === 'hidden' || html.overflow === 'hidden' ? 'locked' : 'free'}; ${behind(el)}`;
			out.moved = geometry(scope);
			// What the form would send: a hidden input that follows the visible value (a select's, a combobox's) is the submission.
			const form = el.closest('form');
			if (form) out.form = [...new FormData(form)].map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 40) : '(file)'}`);
			out.scroll = String(Math.round(scrollY / 40) * 40);
			out['scrolled since'] = [...(g.__markless_migrate_probe_scrolled__ ?? [])].sort();
			g.__markless_migrate_probe_scrolled__?.clear();
			return out;
		},
		/** A point that holds no control and is outside the control and everything open, for a click outside. */
		outside(): { x: number; y: number } | null {
			const el = control();
			const open = [...document.querySelectorAll(POPUP)].filter(shown);
			const boxes = [el, ...open].filter((e): e is Element => Boolean(e)).map((e) => e.getBoundingClientRect());
			const controls = 'a[href], button, input, select, textarea, summary, label, [role], [tabindex], [contenteditable]';
			for (const fy of [0.5, 0.9, 0.1, 0.7, 0.3]) {
				for (const fx of [0.03, 0.97, 0.5, 0.25, 0.75]) {
					const x = Math.round(innerWidth * fx);
					const y = Math.round(innerHeight * fy);
					if (boxes.some((b) => x >= b.left - 6 && x <= b.right + 6 && y >= b.top - 6 && y <= b.bottom + 6)) continue;
					const hit = document.elementFromPoint(x, y);
					if (!hit || hit.closest(controls) || (el && hit.contains(el) && hit !== document.body && hit !== document.documentElement && hit.querySelectorAll('*').length < 30)) continue;
					return { x, y };
				}
			}
			return null;
		},
		/** Marks what a step aims at inside or around the control: the topmost open dialog's close button, an open popup, a slider thumb, a carousel's track. */
		/** The first letter of the n-th item, among the open list's items whose first letters differ, for typeahead; '' when there is none. */
		letter(n: number): string {
			const letters: string[] = [];
			for (const i of items()) {
				const l = /^\p{L}/u.exec(text(i, 10))?.[0]?.toLowerCase();
				if (l && !letters.includes(l)) letters.push(l);
			}
			return letters[n] ?? '';
		},
		aim(what: 'close' | 'popup' | 'thumb' | 'track' | 'toaster' | 'label' | 'before' | 'submenu' | 'scroller' | `item ${number}`): boolean {
			const AIM = 'data-markless-migrate-aim';
			for (const o of document.querySelectorAll(`[${AIM}]`)) o.removeAttribute(AIM);
			const el = control();
			let found: Element | undefined | null;
			if (what === 'close') {
				const top = [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]')].filter(shown).pop();
				found = top && [...top.querySelectorAll('button, [role="button"]')].filter(shown).find((b) => /\b(close|cancel|dismiss|done)\b/i.test(`${b.getAttribute('aria-label') ?? ''} ${text(b)}`));
			} else if (what.startsWith('item ')) found = items()[Number(what.slice(5))];
			else if (what === 'scroller') found = [...document.querySelectorAll(POPUP)].filter(shown).flatMap((p) => [p, ...p.querySelectorAll('*')]).find((e) => shown(e) && e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY));
			else if (what === 'submenu') found = [...document.querySelectorAll(POPUP)].filter(shown).flatMap((p) => [...p.querySelectorAll(ITEM)]).find((i) => shown(i) && /^(true|menu)$/.test(i.getAttribute('aria-haspopup') ?? ''));
			else if (what === 'popup') found = [...document.querySelectorAll(POPUP)].filter(shown).pop();
			else if (what === 'toaster') found = [...document.querySelectorAll('[data-sonner-toaster], [aria-live]:not([aria-live="off"]), [role="region"][aria-label*="otification" i]')].find((t) => t.querySelector('*') && shown(t.querySelector('[data-sonner-toast], li, [role="status"]') ?? t));
			else if (what === 'thumb') found = el && ([el, ...el.querySelectorAll('[role="slider"], input[type="range"]')].find((t) => t.matches('[role="slider"], input[type="range"]') && shown(t)) ?? el);
			else if (what === 'track') found = el && ([...el.querySelectorAll('*')].find((t) => t instanceof HTMLElement && t.scrollWidth > t.clientWidth + 2 && getComputedStyle(t).overflowX !== 'visible') ?? el.querySelector(':scope > * > *') ?? el);
			else if (what === 'label' && el) {
				const by = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => document.getElementById(id)).find((l) => l?.localName === 'label');
				found = (el instanceof HTMLInputElement ? el.labels?.[0] : null) ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null) ?? el.closest('label') ?? by;
			}
			else if (what === 'before' && el) {
				const all = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((e) => e instanceof HTMLElement && e.tabIndex >= 0 && shown(e) && !el.contains(e) && !(el.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
				found = all.pop();
			}
			if (!found) return false;
			found.setAttribute(AIM, '');
			return true;
		},
	};
	(globalThis as { __markless_migrate_probe__?: typeof probe }).__markless_migrate_probe__ = probe;
}

/** One control a probe can drive, as the old page shows it: found again on both sides by role, name and place. */
export interface ProbeControl {
	readonly role: string;
	readonly name: string;
	readonly nth: number;
	/** What kind of part it is (its component slot, else tag and role): controls of one kind run the same code, so a few stand for the rest. */
	readonly kind: string;
	readonly classes: readonly string[];
	readonly region: string;
	/** What it says it opens (its aria-haspopup), when it says. */
	readonly popup?: string;
	/** Its widget's print (installProbe's `print`), when asked for. */
	readonly print?: string;
}

/**
 * Runs in the page: the controls of each probe class, in page order. `hover` holds the elements the handler scan saw listening
 * for the pointer moving over them (handlers.ts),
 * `notify` the names of buttons whose click announced something in a live region,
 * `found` the classes discovery gave controls by their key; with `prints`, only the controls of those keys, each with its widget's print.
 */
export function probeControls({ notify, mark, found = {}, prints }: { readonly notify: readonly string[]; readonly mark?: string; readonly found?: Readonly<Record<string, readonly string[]>>; readonly prints?: readonly string[] }): ProbeControl[] {
	const printer = (globalThis as { __markless_migrate_probe__?: { print(el: Element): string } }).__markless_migrate_probe__;
	const hover = (globalThis as { __markless_migrate_hover__?: WeakSet<Element> }).__markless_migrate_hover__;
	const shown = (e: Element) => {
		const r = e.getBoundingClientRect();
		return r.width >= 1 && r.height >= 1 && e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
	};
	const IMPLICIT: Record<string, string> = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', summary: 'button' };
	const roleOf = (e: Element) => e.getAttribute('role') ?? (e instanceof HTMLInputElement ? ({ range: 'slider', checkbox: 'checkbox', radio: 'radio', search: 'searchbox', number: 'spinbutton' } as Record<string, string>)[e.type] ?? 'textbox' : IMPLICIT[e.localName] ?? '');
	const accessibleName = (e: Element) => {
		const by = e.getAttribute('aria-labelledby');
		const label = e.getAttribute('aria-label') ?? (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '');
		const own = e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement ? (e.labels?.[0]?.textContent ?? e.placeholder ?? '') : (e.textContent ?? '');
		return (label || own || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
	};
	const COMPOSITE = '[role="tablist"], [role="radiogroup"], [role="toolbar"], [role="menubar"], [role="grid"], [role="treegrid"], [role="tree"], [role="group"]';
	const ITEMS = '[role="tab"], [role="radio"], input[type="radio"], [aria-pressed], [role="checkbox"], [role="menuitem"], [role="gridcell"], [role="row"], [role="treeitem"], button';
	const out: ProbeControl[] = [];
	const seen = new Map<string, number>();
	const add = (e: Element, role: string, classes: string[]) => {
		// Counted among shown controls only: a port that keeps hidden copies of a layer must not move which one is the n-th.
		if (!shown(e) || e.closest('[aria-hidden="true"], [inert], template')) return;
		const label = accessibleName(e);
		const key = `${role}|${label.replace(/\s+/g, '')}`;
		const nth = seen.get(key) ?? 0;
		seen.set(key, nth + 1);
		if (mark !== undefined) {
			if (`${key}|${nth}` === mark) e.setAttribute('data-markless-migrate-probe', '');
			return;
		}
		if (prints) {
			if (printer && prints.includes(`${key}|${nth}`)) out.push({ role, name: label, nth, kind: '', classes: [], region: '', print: printer.print(e) });
			return;
		}
		for (const cls of found[`${key}|${nth}`] ?? []) if (!classes.includes(cls)) classes.push(cls);
		if (!classes.length || e.matches(':disabled, [aria-disabled="true"]')) return;
		const main = e.closest('main, [role="main"]');
		const landmark = main ? null : e.closest('header, nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"]');
		const region = main ? 'main' : landmark ? (landmark.getAttribute('role') ?? landmark.localName) : '';
		const slot = e.getAttribute('data-slot');
		const popup = (e.getAttribute('aria-haspopup') ?? '').toLowerCase();
		// Right to left is its own kind: a library flips placement, arrows and outside clicks there, and a port can get that one wrong alone.
		const dir = e.closest('[dir]')?.getAttribute('dir') === 'rtl' ? '|rtl' : '';
		out.push({ role, name: label, nth, kind: `${region}|${slot ?? `${e.localName}[${role}]`}${dir}`, classes, region, ...(popup && popup !== 'false' ? { popup } : {}) });
	};
	if (mark !== undefined) for (const o of document.querySelectorAll('[data-markless-migrate-probe]')) o.removeAttribute('data-markless-migrate-probe');
	// A right-click target says so only through its handler: React's and Vue's props, or the element's own property.
	const contextual = (e: Element) => e instanceof HTMLElement && (Boolean(e.oncontextmenu) || Object.keys(e).some((k) => (k.startsWith('__reactProps$') && typeof (e as unknown as Record<string, Record<string, unknown>>)[k]?.onContextMenu === 'function') || (k === '_vei' && Boolean((e as unknown as Record<string, Record<string, unknown>>)[k]?.onContextmenu))));
	for (const e of document.body.querySelectorAll('*')) {
		const carousel = /^carousel$/i.test(e.getAttribute('aria-roledescription') ?? '');
		let role = roleOf(e) || (carousel ? 'region' : '');
		// A right-click area has no role, and a port may answer it from a delegated handler: it is counted among the innermost role-less elements of its text on both pages alike, whatever listens.
		const menu = !role && contextual(e);
		if (!role && e.childElementCount <= 20) {
			const label = accessibleName(e);
			if (label && label.length <= 80 && ![...e.children].some((c) => accessibleName(c) === label)) role = 'area';
		}
		if (!role) continue;
		const classes: string[] = [];
		const focusable = e instanceof HTMLElement && e.tabIndex >= 0;
		const popup = (e.getAttribute('aria-haspopup') ?? '').toLowerCase();
		const opener = role === 'button' && ((popup && popup !== 'false') || (e.hasAttribute('aria-expanded') && e.hasAttribute('aria-controls')));
		if (focusable && /^(button|link|textbox|searchbox|combobox|checkbox|switch|tab|radio|slider|spinbutton)$/.test(role)) classes.push('modality');
		if (opener || role === 'combobox') classes.push('popup');
		// A link listens for hover to prefetch its page (Next's Link does): it is a hover target only when it says it shows something.
		if (hover?.has(e) && /^(button|link|checkbox|switch|tab|radio)$/.test(role) && (role !== 'link' || e.hasAttribute('data-state') || e.hasAttribute('aria-describedby') || e.hasAttribute('aria-haspopup') || e.hasAttribute('aria-expanded'))) classes.push('hover');
		if (role === 'slider' || (role === 'separator' && focusable) || carousel) classes.push('drag');
		if (menu) classes.push('context menu');
		if (/^(checkbox|switch)$/.test(role) || (role === 'button' && e.hasAttribute('aria-pressed'))) classes.push('toggle');
		if (role === 'button' && notify.includes(accessibleName(e))) classes.push('repeat');
		if (/^(tablist|radiogroup|toolbar|menubar|grid|treegrid|tree)$/.test(role) || (role === 'group' && e.querySelectorAll(ITEMS).length >= 2 && [...e.querySelectorAll('[aria-pressed], [role="radio"], [role="checkbox"]')].length >= 2)) {
			if (!e.parentElement?.closest(COMPOSITE) || /^(tablist|radiogroup|toolbar|menubar)$/.test(role)) classes.push('tab stops');
		}
		add(e, role, classes);
	}
	return out;
}
