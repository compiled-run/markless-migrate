// Disclosure panels Markless shows and hides (Base UI Collapsible and Accordion panels, Radix Collapsible and Accordion
// content): the size each library measures into its CSS variables, its open and closed state attributes, and a closing
// panel kept shown until its own exit animation ends. Each step runs once Markless has committed the state, before paint.

const BASE_VARS = /^--(accordion|collapsible)-panel-(height|width)$/;
const RADIX_VARS = ['--radix-collapsible-content-height', '--radix-collapsible-content-width'];
const run = new WeakMap<Element, number>();

const isRadix = (el: Element) => el.hasAttribute('data-state');
const shown = (el: HTMLElement) => el.isConnected && !el.hidden;

/** The panel and the `depth` ancestors that open and close with it (a navigation menu's viewport around its content). */
function withAncestors(el: HTMLElement, depth: number): HTMLElement[] {
	const out = [el];
	for (let n = el.parentElement; n && out.length <= depth; n = n.parentElement) out.push(n);
	return out;
}

/** Calls `then` with the element of `id` once `ready` holds for it: at once, or when Markless's commit makes it so. */
function whenCommitted(id: string, ready: (el: HTMLElement) => boolean, then: (el: HTMLElement) => void): void {
	const now = document.getElementById(id);
	if (now && ready(now)) return then(now);
	const observer = new MutationObserver(() => {
		const el = document.getElementById(id);
		if (!el || !ready(el)) return;
		stop();
		then(el);
	});
	// A state that never shows the panel (its content could not be rendered) leaves nothing waiting.
	const timer = setTimeout(() => stop(), 2_000);
	const stop = () => {
		observer.disconnect();
		clearTimeout(timer);
	};
	observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-state', 'data-open', 'data-closed'] });
}

function motionOf(el: HTMLElement): 'none' | 'css-transition' | 'css-animation' {
	const cs = getComputedStyle(el);
	const timed = (v: string) => v.split(',').some((p) => Number.parseFloat(p) > 0);
	const animated = cs.animationName.split(',').some((n) => n.trim() !== '' && n.trim() !== 'none') && timed(cs.animationDuration);
	if (timed(cs.transitionDuration)) return 'css-transition';
	return animated ? 'css-animation' : 'none';
}

const baseVars = (el: HTMLElement) => [...el.style].filter((p) => BASE_VARS.test(p));

function setBaseSize(el: HTMLElement, measured: boolean): void {
	for (const p of baseVars(el)) el.style.setProperty(p, measured ? `${/height$/.test(p) ? el.scrollHeight : el.scrollWidth}px` : 'auto');
}

function setOpen(el: HTMLElement, open: boolean): void {
	if (isRadix(el)) {
		el.setAttribute('data-state', open ? 'open' : 'closed');
		return;
	}
	el.toggleAttribute('data-open', open);
	el.toggleAttribute('data-closed', !open);
}

const finished = (el: HTMLElement) => Promise.all(el.getAnimations().map((a) => a.finished)).then(
	() => undefined,
	() => undefined,
);

// Radix's CollapsibleContent layout effect: the content measured with its animation and transition held.
function measureRadix(el: HTMLElement): void {
	const name = el.style.animationName;
	const duration = el.style.transitionDuration;
	el.style.transitionDuration = '0s';
	el.style.animationName = 'none';
	const rect = el.getBoundingClientRect();
	el.style.setProperty(RADIX_VARS[0]!, `${rect.height}px`);
	el.style.setProperty(RADIX_VARS[1]!, `${rect.width}px`);
	el.style.animationName = name;
	el.style.transitionDuration = duration;
}

/** The panel of `id` opens: called from the trigger's handler as it sets the open state. */
export function panelEnter(id: string, depth = 0): void {
	if (!id) return;
	whenCommitted(id, shown, (el) => {
		const token = (run.get(el) ?? 0) + 1;
		run.set(el, token);
		el.removeAttribute('data-ending-style');
		const unit = withAncestors(el, depth);
		if (unit.some(isRadix)) {
			for (const n of unit.filter(isRadix)) setOpen(n, true);
			return depth ? undefined : measureRadix(el);
		}
		setOpen(el, true);
		// Base UI's useCollapsiblePanel: measured into its variables with data-starting-style for the first frame,
		// back to auto once the open motion has finished.
		const motion = motionOf(el);
		if (motion === 'none') return setBaseSize(el, false);
		el.setAttribute('data-starting-style', '');
		setBaseSize(el, true);
		requestAnimationFrame(() => {
			if (run.get(el) !== token) return;
			el.removeAttribute('data-starting-style');
			void finished(el).then(() => {
				if (run.get(el) === token) setBaseSize(el, false);
			});
		});
	});
}

/** The panel of `id` closes: it stays shown (the caller's closing state) until its exit motion ends, then `done`. */
export function panelExit(id: string, done: () => void, depth = 0): void {
	const el = id ? document.getElementById(id) : null;
	if (!el || !shown(el)) return done();
	const token = (run.get(el) ?? 0) + 1;
	run.set(el, token);
	const parts = withAncestors(el, depth).filter(isRadix);
	const end = () => {
		if (run.get(el) !== token) return;
		el.removeAttribute('data-ending-style');
		if (!parts.length) setBaseSize(el, false);
		done();
	};
	if (parts.length) {
		// Radix's Presence: each part whose closed state starts an animation of its own stays until that animation ends.
		const before = parts.map((n) => getComputedStyle(n).animationName);
		for (const n of parts) setOpen(n, false);
		const leaving = parts.filter((n, i) => {
			const now = getComputedStyle(n).animationName;
			return now !== 'none' && now !== before[i];
		});
		if (!leaving.length) return end();
		void Promise.all(leaving.map(finished)).then(end);
		return;
	}
	// A panel open on load had its open animation suppressed (Base UI's first paint); its first close animates.
	if (el.style.animationName === 'none') el.style.removeProperty('animation-name');
	setBaseSize(el, true);
	el.removeAttribute('data-starting-style');
	setOpen(el, false);
	if (motionOf(el) === 'none' || !(el.scrollHeight > 0 || el.scrollWidth > 0)) return end();
	// Base UI sets data-ending-style a frame after data-closed and watches the animations a frame after that.
	requestAnimationFrame(() => {
		if (run.get(el) !== token) return;
		el.setAttribute('data-ending-style', '');
		requestAnimationFrame(() => {
			if (run.get(el) === token) void finished(el).then(end);
		});
	});
}
