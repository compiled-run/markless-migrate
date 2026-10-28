/**
 * Runs in the page (evaluated whole, so it stays self-contained): lists the visible controls of a page with their boxes,
 * reads what a click reaches at points over each control and each landmark region, arms observers for one use of a
 * control and reads what the use changed: the regions outside it, the address, focus, the pop-up it opened, where that
 * pop-up sits against its trigger and how it first showed.
 */
export function installParity(): void {
	const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=combobox], [role=slider], [role=spinbutton], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=link], [role=treeitem]';
	const POPUP = '[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [role=grid][data-mm-layer], [data-slot=popover-content]';
	const LAYOUT = 'header, nav, aside, footer, [role=banner], [role=navigation], [role=complementary], [role=contentinfo]';
	const LAND = 'header, nav, main, aside, footer, [role=banner], [role=navigation], [role=main], [role=complementary], [role=contentinfo]';
	const INPUT_ROLE: Record<string, string> = { checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', reset: 'button', search: 'searchbox', number: 'spinbutton' };
	const IMPLICIT: Record<string, string> = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', summary: 'button' };
	const REGION_ROLE: Record<string, string> = { dialog: 'dialog', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', aside: 'complementary', form: 'form', table: 'table', ul: 'list', ol: 'list', section: 'region', figure: 'figure' };
	const REGION = /^(dialog|alertdialog|menu|listbox|list|table|grid|tree|tablist|tabpanel|region|form|figure|group|status|log|tooltip|main|navigation|complementary|banner|contentinfo|search)$/;
	const LANDMARK = /^(main|navigation|complementary|banner|contentinfo|search|dialog|alertdialog)$/;
	const MARK = 'data-markless-migrate-parity';
	const visible = (el: Element) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !el.closest('[hidden], [inert], [aria-hidden=true], template');
	const roleOf = (el: Element) => el.getAttribute('role') ?? (el instanceof HTMLInputElement ? INPUT_ROLE[el.type] ?? 'textbox' : IMPLICIT[el.localName] ?? el.localName);
	const nameOf = (el: Element) => {
		const by = el.getAttribute('aria-labelledby');
		const n = el.getAttribute('aria-label') ?? (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '');
		return (n || el.textContent || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
	};
	const shownControls = () => [...document.querySelectorAll(SEL)].filter((el) => visible(el) && el.getBoundingClientRect().width >= 2 && el.getBoundingClientRect().height >= 2);
	const keyOf = (el: Element, among: readonly Element[]) => {
		const role = roleOf(el), name = nameOf(el);
		const nth = among.filter((o) => roleOf(o) === role && nameOf(o) === name).indexOf(el);
		return `${role} "${name}"${nth > 0 ? ` #${nth + 1}` : ''}`;
	};
	const reachAt = (x: number, y: number, own?: Element) => {
		const hit = document.elementFromPoint(x, y);
		if (!hit) return 'nothing';
		const owner = hit.closest(SEL);
		if (own && (owner === own || own.contains(hit))) return 'itself';
		return owner ? `${roleOf(owner)} "${nameOf(owner)}"` : 'no control';
	};
	const regionLabel = (el: Element) => (el.getAttribute('aria-label') ?? (el.getAttribute('aria-labelledby') ? el.getAttribute('aria-labelledby')!.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '')).replace(/\s+/g, ' ').trim().slice(0, 40);
	const regionRole = (el: Element) => el.getAttribute('role') ?? REGION_ROLE[el.localName];
	const describeRegion = (el: Element) => `${regionRole(el) ?? el.localName}${regionLabel(el) ? ` "${regionLabel(el)}"` : ''}`;
	const heading = (el: Element) => {
		for (let at: Element | null = el; at && at !== document.body; at = at.parentElement) {
			for (let s = at.previousElementSibling; s; s = s.previousElementSibling) if (/^h[1-4]$/.test(s.localName)) return (s.textContent ?? '').replace(/#$/, '').trim().slice(0, 40);
		}
		return '';
	};
	const regionOf = (el: Element) => {
		let region: Element | undefined;
		for (let at: Element | null = el; at && at !== document.body; at = at.parentElement) {
			const role = regionRole(at) ?? '';
			if (!region && REGION.test(role) && (role !== 'group' || regionLabel(at))) region = at;
			if (LANDMARK.test(role)) {
				const h = heading(el);
				return `${region && region !== at ? `${describeRegion(region)} in ${describeRegion(at)}` : describeRegion(at)}${h ? ` under "${h}"` : ''}`;
			}
		}
		return region ? describeRegion(region) : 'the page';
	};
	const focusKey = () => {
		const a = document.activeElement;
		if (!a || a === document.body || a === document.documentElement) return 'the page';
		if (!a.matches(SEL)) return `${a.getAttribute('role') ?? a.localName}${a.getAttribute('aria-label') ? ` "${a.getAttribute('aria-label')!.slice(0, 40)}"` : ''}`;
		return keyOf(a, shownControls());
	};
	const shownPopups = () => [...document.querySelectorAll(POPUP)].filter((p) => p.checkVisibility());
	interface Armed {
		readonly el: Element;
		readonly observer: MutationObserver;
		readonly touched: Set<Node>;
		readonly was: Map<Element, Map<string, string | null>>;
		readonly frames: { ms: number; opacity: number; transform: string; anims: string[] }[];
		readonly url: string;
		readonly openBefore: Set<Element>;
		firstInput?: number;
	}
	let armed: Armed | undefined;
	const observe = (st: Armed, doc: Document) => st.observer.observe(doc, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true });
	const startWatch = (el: Element): Armed => {
		const st: Armed = { el, observer: undefined as unknown as MutationObserver, touched: new Set(), was: new Map(), frames: [], url: location.pathname + location.search, openBefore: new Set(shownPopups()) };
		(st as { observer: MutationObserver }).observer = new MutationObserver((records) => {
			for (const rec of records) {
				if (rec.type === 'attributes') {
					if (rec.attributeName?.startsWith(MARK)) continue;
					const target = rec.target as Element;
					const m = st.was.get(target) ?? st.was.set(target, new Map()).get(target)!;
					if (!m.has(rec.attributeName!)) m.set(rec.attributeName!, rec.oldValue);
					continue;
				}
				st.touched.add(rec.target);
				if (rec.type === 'childList') for (const n of rec.addedNodes) st.touched.add(n);
			}
		});
		observe(st, document);
		for (const frame of document.querySelectorAll('iframe')) {
			try {
				if (frame.contentDocument && frame.checkVisibility()) observe(st, frame.contentDocument);
			} catch {}
		}
		const t0 = performance.now();
		const first = () => void (st.firstInput ??= performance.now());
		addEventListener('pointerdown', first, { capture: true, once: true });
		addEventListener('keydown', first, { capture: true, once: true });
		const tick = () => {
			const now = performance.now();
			const popup = shownPopups().find((p) => !st.openBefore.has(p));
			if (popup && st.firstInput !== undefined) {
				const cs = getComputedStyle(popup);
				st.frames.push({ ms: Math.round(now - st.firstInput), opacity: Number(cs.opacity), transform: cs.transform, anims: popup.getAnimations().map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'animation') });
			}
			if (now - t0 < 1500 && st.frames.length < 30) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		return st;
	};
	(globalThis as unknown as { __markless_migrate_parity__: unknown }).__markless_migrate_parity__ = {
		controls() {
			const all = shownControls();
			return all.map((el) => {
				const r = el.getBoundingClientRect();
				const frame = el.closest('[data-slot=preview], figure, section, [role=dialog], main') ?? document.body;
				const f = frame.getBoundingClientRect();
				const pr = el.parentElement?.getBoundingClientRect() ?? r;
				const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null;
				let leaves = false;
				if (href !== null) {
					try {
						const u = new URL(href, location.href);
						leaves = u.origin !== location.origin || u.pathname !== location.pathname || (u.hash !== '' && u.search === location.search);
					} catch {
						leaves = true;
					}
				}
				const key = keyOf(el, all);
				const role = roleOf(el);
				return {
					key,
					role,
					name: nameOf(el),
					layout: Boolean(el.closest(LAYOUT)),
					leaves,
					disabled: el.matches(':disabled, [aria-disabled=true]'),
					popup: el.hasAttribute('aria-haspopup') || el.hasAttribute('aria-expanded') || role === 'combobox',
					template: `${role}|${el.closest('[data-slot]')?.getAttribute('data-slot') ?? ''}`,
					type: el instanceof HTMLInputElement ? el.type : el instanceof HTMLTextAreaElement ? 'textarea' : '',
					hint: [el.getAttribute('placeholder'), el.getAttribute('name'), el.id, el.getAttribute('inputmode'), el.getAttribute('aria-label')].filter(Boolean).join(' '),
					options: el instanceof HTMLSelectElement ? [...el.options].map((o) => o.value) : undefined,
					box: { x: Math.round(r.x - f.x), y: Math.round(r.y - f.y), w: Math.round(r.width), h: Math.round(r.height) },
					parent: { w: Math.round(pr.width), h: Math.round(pr.height) },
					frame: { w: Math.round(f.width), h: Math.round(f.height) },
				};
			});
		},
		grid(points: readonly { region: string; fx: number; fy: number; key: string }[] | null) {
			const seen = new Map<string, number>();
			const out: { region: string; fx: number; fy: number; key: string; near?: string[] }[] = [];
			for (const el of document.querySelectorAll(LAND)) {
				if (!visible(el)) continue;
				const r = el.getBoundingClientRect();
				const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight), left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
				if (bottom - top < 20 || right - left < 20) continue;
				const name = describeRegion(el);
				const nth = seen.get(name) ?? 0;
				seen.set(name, nth + 1);
				const region = `${name}${nth ? ` #${nth + 1}` : ''}`;
				const at = (fx: number, fy: number) => [left + fx * (right - left), top + fy * (bottom - top)] as const;
				if (points) {
					for (const p of points.filter((q) => q.region === region)) {
						const [x, y] = at(p.fx, p.fy);
						// Within 4 px a point reaches the same control: a layout a pixel off is no difference.
						out.push({ ...p, near: [...new Set([[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]].map(([dx, dy]) => reachAt(x + dx!, y + dy!)))] });
					}
					continue;
				}
				const spots = [0.1, 0.3, 0.5, 0.7, 0.9].flatMap((fy) => [0.1, 0.3, 0.5, 0.7, 0.9].map((fx) => [fx, fy] as const));
				// The centre of each control the region shows in view too, so a narrow bar's links are reached.
				for (const c of shownControls().filter((c) => el.contains(c)).slice(0, 20)) {
					const b = c.getBoundingClientRect();
					const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
					if (cx > left && cx < right && cy > top && cy < bottom) spots.push([(cx - left) / (right - left), (cy - top) / (bottom - top)]);
				}
				for (const [fx, fy] of spots) out.push({ region, fx, fy, key: reachAt(...at(fx, fy)) });
			}
			return out;
		},
		arm(key: string) {
			const all = shownControls();
			const el = all.find((e) => keyOf(e, all) === key);
			if (!el) return null;
			for (const o of document.querySelectorAll(`[${MARK}]`)) o.removeAttribute(MARK);
			el.setAttribute(MARK, '');
			el.scrollIntoView({ block: 'center', inline: 'center' });
			const r = el.getBoundingClientRect();
			const hits = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]].map(([fx, fy]) => reachAt(r.x + r.width * fx!, r.y + r.height * fy!, el));
			armed = startWatch(el);
			return { hits };
		},
		quiet() {
			armed = startWatch(document.body);
		},
		read() {
			const st = armed;
			if (!st) return { affected: [], url: '', focus: focusKey(), popupRole: '' };
			st.observer.disconnect();
			const affected = new Set<string>();
			const changedAttrs = new Set([...st.was].filter(([el, m]) => [...m].some(([n, v]) => (n === 'style' ? (el.getAttribute(n) ?? '') !== (v ?? '') : el.getAttribute(n) !== v))).map(([el]) => el));
			for (const node of [...st.touched, ...changedAttrs]) {
				const doc = node.ownerDocument ?? (node as Document);
				if (doc !== document) {
					const frame = [...document.querySelectorAll('iframe')].find((f) => {
						try {
							return f.contentDocument === doc;
						} catch {
							return false;
						}
					});
					if (frame) affected.add(`iframe${frame.title ? ` "${frame.title}"` : ''} in ${regionOf(frame)}`);
					continue;
				}
				const el = node instanceof Element ? node : node.parentElement;
				if (!el?.isConnected || el.closest('head')) continue;
				if (el === document.body || el === document.documentElement) {
					if (node === el && changedAttrs.has(el)) affected.add('the page');
					continue;
				}
				if (st.el !== document.body && (st.el === el || st.el.contains(el))) continue;
				if ([...st.openBefore].some((p) => p.contains(el))) continue;
				if (el.closest(`[${MARK}-prefix]`)) continue;
				if (!el.checkVisibility() && !el.parentElement?.checkVisibility()) continue;
				affected.add(regionOf(el));
			}
			const shown = shownPopups().find((p) => !st.openBefore.has(p));
			const first = st.frames[0];
			let anchor: { side: string; dx: number; dy: number; w: number; h: number; tw: number } | undefined;
			if (shown && st.el.isConnected && st.el !== document.body) {
				const t = st.el.getBoundingClientRect(), p = shown.getBoundingClientRect();
				anchor = { side: p.top >= t.bottom - 2 ? 'below' : p.bottom <= t.top + 2 ? 'above' : p.left >= t.right - 2 ? 'right' : p.right <= t.left + 2 ? 'left' : 'over', dx: Math.round(p.left - t.left), dy: Math.round(p.top - t.bottom), w: Math.round(p.width), h: Math.round(p.height), tw: Math.round(t.width) };
			}
			return {
				affected: [...affected].sort().slice(0, 6),
				url: location.pathname + location.search !== st.url ? location.pathname + location.search : '',
				focus: focusKey(),
				popupRole: shown?.getAttribute('role') ?? (shown ? 'pop-up' : ''),
				...(first ? { first: { ms: first.ms, opacity: Math.round(first.opacity * 100) / 100, transform: first.transform, anims: [...new Set(st.frames.flatMap((f) => f.anims))].sort() } } : {}),
				...(anchor ? { anchor } : {}),
			};
		},
		keep() {
			const el = document.querySelector(`[${MARK}]`);
			el?.removeAttribute(MARK);
			el?.setAttribute(`${MARK}-prefix`, '');
		},
		stillOpen() {
			return Boolean(armed && shownPopups().some((p) => !armed!.openBefore.has(p)));
		},
		field() {
			const el = document.querySelector(`[${MARK}]`) ?? armed?.el;
			if (!el) return { value: '', invalid: '', badInput: false };
			const value = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el.value : el.textContent ?? '';
			return { value: value.trim().slice(0, 80), invalid: el.getAttribute('aria-invalid') ?? '', badInput: el instanceof HTMLInputElement ? !el.validity.valid : false };
		},
		blur() {
			((document.querySelector(`[${MARK}]`) ?? armed?.el) as HTMLElement | undefined)?.blur?.();
		},
		/** What a pop-up opened over the page marks as chosen, and its caption: a date picker's chosen day. */
		popupSummary() {
			const before = armed?.openBefore ?? new Set<Element>();
			const pop = shownPopups().find((x) => !before.has(x));
			if (!pop) return '';
			const picked = [...pop.querySelectorAll('[aria-selected=true], [data-selected=true], [data-selected-single=true], [aria-checked=true], [aria-current=date]')].filter((x) => x.checkVisibility()).map((x) => `${(x.textContent ?? '').trim().slice(0, 30)}${x.getAttribute('data-day') ? ` (${x.getAttribute('data-day')})` : ''}`);
			const caption = [...pop.querySelectorAll('[role=status], [aria-live]')].filter((x) => x.checkVisibility()).map((x) => (x.textContent ?? '').trim().slice(0, 40));
			return [...new Set([...caption, ...picked])].join('; ').slice(0, 200) || `${pop.getAttribute('role') ?? 'pop-up'} open`;
		},
		/** Marks the button beside the used field, in its group. */
		markBeside() {
			const el = document.querySelector(`[${MARK}]`);
			for (let at = el?.parentElement, up = 0; at && up < 2; at = at.parentElement, up++) {
				const b = [...at.querySelectorAll('button, [role=button]')].find((x) => x !== el && visible(x));
				if (b) {
					b.setAttribute(`${MARK}-beside`, '');
					return true;
				}
			}
			return false;
		},
	};
}
