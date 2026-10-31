/** A popup's box against the control that opened it, as the visitor sees it once the page is at rest. */
export interface PagePopupPlace {
	readonly role: string;
	readonly name: string;
	readonly side: 'below' | 'above' | 'right of' | 'left of' | 'over';
	/** Pixels between the trigger's edge and the popup's on its side; negative when they overlap. */
	readonly gap: number;
	/** Where the popup's start edge sits across the side from the trigger's start edge, in pixels. */
	readonly across: number;
	readonly align: 'start' | 'center' | 'end' | 'none';
	readonly width: number;
	readonly height: number;
	readonly triggerWidth: number;
	readonly triggerHeight: number;
	/** Share of the trigger's box the popup covers, 0 to 1. */
	readonly covers: number;
	/** The trigger's centre is hit-tested to the popup rather than to the trigger. */
	readonly hides: boolean;
}

/** One CSS transition, CSS animation or Web Animation that started since the last drain. */
export interface PageMotion {
	readonly kind: 'transition' | 'animation' | 'web animation';
	/** Whose: the popup (`role`), inside it (`in role`), the control, inside it, or `tag "text"`. */
	readonly subject: string;
	readonly properties: readonly string[];
	readonly duration: number;
	readonly delay: number;
	readonly easing: string;
	readonly iterations: number | 'infinite';
	readonly direction: string;
	/** Each keyframe as `offset prop=value, ...`, numbers rounded. */
	readonly keyframes: readonly string[];
}

/** A script that wrote one attribute of one element on several frames since the last drain (a path's d, a transform). */
export interface PageScriptMotion {
	readonly subject: string;
	readonly attribute: string;
	readonly frames: number;
	readonly span: number;
	readonly first: string;
	readonly last: string;
}

export interface PageState {
	/** The DOM changed since the last drain. */
	readonly changed?: boolean;
	readonly popups: readonly PagePopupPlace[];
	readonly motion: readonly PageMotion[];
	readonly script: readonly PageScriptMotion[];
}

type StateWindow = { __mmState__?: { drain(): PageState; quietFor(ms: number): boolean; stop(): void } };

/**
 * Runs in the page (evaluated whole, so it stays self-contained): records every animation and script-written attribute
 * from now on, and `drain()` returns what started since the last drain with the open popups' places against the probed control.
 */
export function armState(): void {
	const w = globalThis as unknown as StateWindow;
	w.__mmState__?.stop();
	const MARK = '[data-markless-migrate-probe]';
	const POPUP = 'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [role="tree"], [popover]';
	const SCRIPTED = ['d', 'transform', 'points', 'style', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r'];
	let stopped = false;
	let frame = 0;
	let lastWrite = 0;
	const known = new WeakSet<Animation>();
	for (const a of document.getAnimations()) known.add(a);
	let found: Animation[] = [];
	const shown = (e: Element) => {
		const r = e.getBoundingClientRect();
		return e.isConnected && r.width >= 1 && r.height >= 1 && e.checkVisibility({ visibilityProperty: true });
	};
	const text = (e: Element | null | undefined) => ((e as HTMLElement | null)?.innerText ?? e?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
	const roleOf = (e: Element) => e.getAttribute('role') ?? (e.localName === 'dialog' ? 'dialog' : e.hasAttribute('popover') ? 'popover' : e.localName);
	const subject = (el: Element | null | undefined): string => {
		if (!el) return 'the page';
		const control = document.querySelector(MARK);
		if (control && (el === control || control.contains(el))) return el === control ? 'the control' : 'inside the control';
		const popup = el.closest(POPUP);
		if (popup) return popup === el ? roleOf(popup) : `in ${roleOf(popup)}`;
		const t = text(el);
		return `${el.localName}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}${t ? ` "${t}"` : ''} outside the widget`;
	};
	// A transition reversed part way runs shorter than its rule, by however far it had got: the rule's timing is what the page declares.
	const rules = new Map<Animation, { duration: number; delay: number }>();
	const ms = (v: string | undefined) => (v === undefined ? undefined : v.endsWith('ms') ? Number.parseFloat(v) : Number.parseFloat(v) * 1000);
	const add = (a: Animation) => {
		if (known.has(a)) return;
		known.add(a);
		found.push(a);
		const effect = a.effect as KeyframeEffect | null;
		if (typeof CSSTransition === 'undefined' || !(a instanceof CSSTransition) || !effect?.target) return;
		const cs = getComputedStyle(effect.target, effect.pseudoElement ?? undefined);
		const list = (v: string) => v.split(',').map((x) => x.trim());
		const props = list(cs.transitionProperty);
		const at = props.indexOf(a.transitionProperty) >= 0 ? props.indexOf(a.transitionProperty) : props.lastIndexOf('all');
		if (at < 0) return;
		const pick = (v: string[]) => v[at % v.length];
		const duration = ms(pick(list(cs.transitionDuration)));
		const delay = ms(pick(list(cs.transitionDelay)));
		if (duration !== undefined && delay !== undefined) rules.set(a, { duration, delay });
	};
	const scan = () => {
		for (const a of document.getAnimations()) add(a);
	};
	addEventListener('transitionrun', scan, true);
	addEventListener('animationstart', scan, true);
	const tick = () => {
		if (stopped) return;
		frame++;
		scan();
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const writes = new Map<Element, Map<string, { frames: Set<number>; first: string; last: string; t0: number; t1: number }>>();
	const observer = new MutationObserver((list) => {
		const now = performance.now();
		for (const m of list) {
			if (!(m.target instanceof Element) || !m.attributeName) continue;
			const value = m.target.getAttribute(m.attributeName) ?? '';
			if (value === m.oldValue) continue;
			const byAttr = writes.get(m.target) ?? new Map();
			writes.set(m.target, byAttr);
			const entry = byAttr.get(m.attributeName) ?? { frames: new Set<number>(), first: m.oldValue ?? '', last: value, t0: now, t1: now };
			entry.frames.add(frame);
			entry.last = value;
			entry.t1 = now;
			byAttr.set(m.attributeName, entry);
			lastWrite = now;
		}
	});
	observer.observe(document.documentElement, { attributes: true, attributeOldValue: true, attributeFilter: SCRIPTED, subtree: true });
	let changed = false;
	const SCOPE = 'data-markless-migrate-state';
	const any = new MutationObserver((list) => {
		if (list.some((m) => m.type !== 'attributes' || !m.attributeName?.startsWith('data-markless-migrate'))) changed = true;
	});
	any.observe(document.documentElement, { attributes: true, childList: true, characterData: true, subtree: true });
	const round = (v: unknown) => String(v).replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100));
	const kebab = (p: string) => (p === 'cssFloat' ? 'float' : p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
	const motionOf = (a: Animation): PageMotion | undefined => {
		const effect = a.effect as KeyframeEffect | null;
		if (!effect) return undefined;
		const timing = effect.getComputedTiming();
		const duration = typeof timing.duration === 'number' ? timing.duration : 0;
		if (!(duration > 1)) return undefined;
		const transition = typeof CSSTransition !== 'undefined' && a instanceof CSSTransition;
		const keyframes = effect.getKeyframes();
		const skip = new Set(['offset', 'computedOffset', 'easing', 'composite']);
		const properties = transition ? [(a as CSSTransition).transitionProperty] : [...new Set(keyframes.flatMap((k) => Object.keys(k).filter((p) => !skip.has(p)).map(kebab)))].sort();
		const easing = effect.getTiming().easing ?? 'linear';
		return {
			kind: transition ? 'transition' : typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation ? 'animation' : 'web animation',
			subject: subject(effect.target),
			properties,
			duration: Math.round(rules.get(a)?.duration ?? duration),
			delay: Math.round(rules.get(a)?.delay ?? Number(effect.getTiming().delay ?? 0)),
			easing: easing !== 'linear' ? easing : (keyframes.find((k) => k.easing && k.easing !== 'linear')?.easing ?? 'linear'),
			iterations: Number.isFinite(timing.iterations ?? 1) ? (timing.iterations ?? 1) : 'infinite',
			direction: String(effect.getTiming().direction ?? 'normal'),
			keyframes: keyframes.map((k) => `${round(k.computedOffset ?? k.offset)} ${Object.keys(k).filter((p) => !skip.has(p)).sort().map((p) => `${kebab(p)}=${round(k[p])}`).join(', ')}`),
		};
	};
	const place = (popup: Element, trigger: Element): PagePopupPlace => {
		const p = popup.getBoundingClientRect();
		const t = trigger.getBoundingClientRect();
		const r = (n: number) => Math.round(n);
		const side = p.top >= t.bottom - 1 ? 'below' : p.bottom <= t.top + 1 ? 'above' : p.left >= t.right - 1 ? 'right of' : p.right <= t.left + 1 ? 'left of' : 'over';
		const vertical = side === 'below' || side === 'above' || side === 'over';
		const gap = side === 'below' ? p.top - t.bottom : side === 'above' ? t.top - p.bottom : side === 'right of' ? p.left - t.right : side === 'left of' ? t.left - p.right : -Math.min(p.bottom - t.top, t.bottom - p.top);
		const [ps, pe, ts, te] = vertical ? [p.left, p.right, t.left, t.right] : [p.top, p.bottom, t.top, t.bottom];
		const offsets = { start: Math.abs(ps - ts), center: Math.abs((ps + pe) / 2 - (ts + te) / 2), end: Math.abs(pe - te) };
		const best = (Object.entries(offsets) as ['start' | 'center' | 'end', number][]).sort((a, b) => a[1] - b[1])[0]!;
		const ix = Math.max(0, Math.min(p.right, t.right) - Math.max(p.left, t.left));
		const iy = Math.max(0, Math.min(p.bottom, t.bottom) - Math.max(p.top, t.top));
		const hit = document.elementFromPoint((t.left + t.right) / 2, (t.top + t.bottom) / 2);
		return {
			role: roleOf(popup),
			name: popup.getAttribute('aria-label') ?? text(popup),
			side,
			gap: r(gap),
			across: r(ps - ts),
			align: best[1] <= 2 ? best[0] : 'none',
			width: r(p.width),
			height: r(p.height),
			triggerWidth: r(t.width),
			triggerHeight: r(t.height),
			covers: t.width * t.height ? Math.round(((ix * iy) / (t.width * t.height)) * 10) / 10 : 0,
			hides: Boolean(hit && popup.contains(hit) && !trigger.contains(hit)),
		};
	};
	const triggerOf = (popup: Element): Element | null => {
		const id = popup.id;
		const by = id ? document.querySelector(`[aria-controls~="${CSS.escape(id)}"], [aria-describedby~="${CSS.escape(id)}"], [aria-owns~="${CSS.escape(id)}"]`) : null;
		return by ?? document.querySelector(MARK);
	};
	w.__mmState__ = {
		drain() {
			scan();
			const motion: PageMotion[] = [];
			for (const a of found) {
				const m = motionOf(a);
				if (m) motion.push(m);
			}
			found = [];
			const script: PageScriptMotion[] = [];
			for (const [el, byAttr] of writes) {
				for (const [attribute, e] of byAttr) {
					if (e.frames.size < 3 || (attribute === 'style' && el.closest(POPUP) === null && el.getAnimations().length)) continue;
					script.push({ subject: subject(el), attribute, frames: e.frames.size, span: Math.round(e.t1 - e.t0), first: e.first.slice(0, 400), last: e.last.slice(0, 400) });
				}
			}
			writes.clear();
			const list = [...document.querySelectorAll(POPUP)].filter((p) => shown(p) && (!p.hasAttribute('popover') || p.matches(':popover-open')));
			const outer = list.filter((p) => !list.some((o) => o !== p && o.contains(p)));
			const popups = outer.flatMap((p) => {
				const t = triggerOf(p);
				return t && shown(t) && !p.contains(t) ? [place(p, t)] : [];
			});
			// The tree is read where the step acts: the widget around the control and each popup outside it, so a page's other content costs nothing.
			const control = document.querySelector(MARK);
			const scope = control?.closest('figure, section, article, form, fieldset, [role="group"], [role="region"], [role="tabpanel"], [data-slot="card"], [data-slot$="preview"]');
			const roots = [scope && scope.querySelectorAll('*').length <= 1500 ? scope : (control?.parentElement?.parentElement ?? control), ...outer].filter((e): e is Element => Boolean(e));
			const keep = roots.filter((e, i) => !roots.some((o, j) => j !== i && o.contains(e) && o !== e));
			for (const o of document.querySelectorAll(`[${SCOPE}]`)) if (!keep.includes(o)) o.removeAttribute(SCOPE);
			for (const e of keep) if (!e.hasAttribute(SCOPE)) e.setAttribute(SCOPE, '');
			const was = changed;
			changed = false;
			return { changed: was, popups, motion, script };
		},
		quietFor(ms: number) {
			return performance.now() - lastWrite >= ms;
		},
		stop() {
			stopped = true;
			observer.disconnect();
			any.disconnect();
			removeEventListener('transitionrun', scan, true);
			removeEventListener('animationstart', scan, true);
		},
	};
}
