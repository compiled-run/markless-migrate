// @shadcn/react MessageScroller: the opening position, following the live edge, holding an anchored turn at the reading
// line, keeping the reader's row in place on a prepend, and the scroll buttons, on the transcript Markless renders.
const ROOT = '[data-slot="message-scroller"]';
const VIEWPORT = '[data-slot="message-scroller-viewport"]';
const CONTENT = '[data-slot="message-scroller-content"]';
const BUTTON = '[data-slot="message-scroller-button"]';
const SPACER = '[data-message-scroller-spacer]';
const SCROLL_POSITION_EPSILON = 0.5;
const AUTOSCROLLING_CLEAR_DELAY = 180;
const USER_SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' ']);

type Mode = 'following-bottom' | 'free-scrolling' | 'anchored-to-message' | 'settling-jump';
type Align = 'start' | 'center' | 'end' | 'nearest';
type Position = 'start' | 'end' | 'last-anchor';
interface Scrollable {
	readonly start: boolean;
	readonly end: boolean;
}

const px = (value: string | undefined) => {
	const n = Number.parseFloat(value ?? '');
	return Number.isFinite(n) ? n : 0;
};
const blockPadding = (el: Element) => {
	const style = getComputedStyle(el);
	return { start: px(style.paddingBlockStart || style.paddingTop), end: px(style.paddingBlockEnd || style.paddingBottom) };
};
const isAnchor = (el: HTMLElement) => el.dataset.scrollAnchor === 'true';
const elementTop = (el: Element, viewport: HTMLElement) => el.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
const viewportTop = (el: Element, viewport: HTMLElement) => el.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
const maxScrollTop = (viewport: HTMLElement) => Math.max(0, viewport.scrollHeight - viewport.clientHeight);
const numberAttr = (el: Element, name: string, fallback: number) => (el.hasAttribute(name) ? px(el.getAttribute(name)!) : fallback);

export class Scroller {
	readonly root: HTMLElement;
	readonly viewport: HTMLElement;
	readonly content: HTMLElement;
	readonly spacer: HTMLElement | null;
	readonly autoScroll: boolean;
	readonly position: Position;
	readonly edge: number;
	readonly margin: number;
	readonly peek: number;
	readonly preserveOnPrepend: boolean;
	mode: Mode;
	private autoscrolling = false;
	private autoscrollingTimer: number | null = null;
	private applied = false;
	private itemCount = 0;
	private firstItem: HTMLElement | null = null;
	private lastScrollTop = 0;
	private streamingTurn: HTMLElement | null = null;
	private prepend: { element: HTMLElement; viewportTop: number } | null = null;
	private spacerHeight = 0;
	private spacerGap = 0;
	private stateFrame: number | null = null;
	private resizeFrame = 0;
	private readonly handledAnchors = new WeakSet<HTMLElement>();
	state: Scrollable = { start: false, end: false };

	constructor(root: HTMLElement, viewport: HTMLElement, content: HTMLElement) {
		this.root = root;
		this.viewport = viewport;
		this.content = content;
		this.spacer = [...content.children].find((c): c is HTMLElement => c instanceof HTMLElement && c.matches(SPACER)) ?? null;
		this.autoScroll = root.hasAttribute('data-mm-auto-scroll');
		const position = root.getAttribute('data-mm-default-scroll-position');
		this.position = position === 'start' || position === 'last-anchor' ? position : 'end';
		this.edge = numberAttr(root, 'data-mm-scroll-edge-threshold', 8);
		this.margin = numberAttr(root, 'data-mm-scroll-margin', 0);
		this.peek = numberAttr(root, 'data-mm-scroll-previous-item-peek', 64);
		this.preserveOnPrepend = viewport.getAttribute('data-mm-preserve-scroll-on-prepend') !== 'false';
		this.mode = this.autoScroll ? 'following-bottom' : 'free-scrolling';
		if (this.spacer) this.spacerGap = px(getComputedStyle(content).rowGap === 'normal' ? getComputedStyle(content).gap : getComputedStyle(content).rowGap);
	}

	items(): HTMLElement[] {
		return [...this.content.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c !== this.spacer);
	}

	private contentBottom(): number {
		const padding = blockPadding(this.content);
		const top = this.viewport.getBoundingClientRect().top;
		let bottom = padding.start + padding.end;
		for (const item of this.items()) bottom = Math.max(bottom, item.getBoundingClientRect().bottom - top + this.viewport.scrollTop + padding.end);
		return bottom;
	}

	private scrollable(): Scrollable {
		return { start: this.viewport.scrollTop > this.edge, end: this.contentBottom() - this.viewport.scrollTop - this.viewport.clientHeight > this.edge };
	}

	private writeState(state: Scrollable): void {
		const value = [state.start && 'start', state.end && 'end'].filter(Boolean).join(' ');
		for (const el of [this.root, this.viewport]) {
			if (value) el.setAttribute('data-scrollable', value);
			else el.removeAttribute('data-scrollable');
			el.toggleAttribute('data-autoscrolling', this.autoscrolling);
		}
		for (const button of this.buttons()) {
			const active = button.getAttribute('data-direction') === 'start' ? state.start : state.end;
			const was = button.getAttribute('data-active') === 'true';
			button.setAttribute('data-active', active ? 'true' : 'false');
			button.inert = !active;
			if (active !== was) {
				if (active) {
					const own = button.getAttribute('data-mm-tabindex');
					if (own === null) button.removeAttribute('tabindex');
					else button.setAttribute('tabindex', own);
				} else button.setAttribute('tabindex', '-1');
			}
		}
	}

	buttons(): HTMLButtonElement[] {
		return [...this.root.querySelectorAll<HTMLButtonElement>(BUTTON)].filter((b) => b.closest(ROOT) === this.root);
	}

	private reconcileFollow(state: Scrollable): void {
		const top = this.viewport.scrollTop;
		const scrolledUp = top < this.lastScrollTop - SCROLL_POSITION_EPSILON;
		this.lastScrollTop = top;
		if (this.autoScroll && !state.end && this.mode !== 'settling-jump' && this.mode !== 'anchored-to-message') this.mode = 'following-bottom';
		else if (this.mode === 'following-bottom' && state.end && scrolledUp && !this.autoscrolling) this.mode = 'free-scrolling';
	}

	commit(): void {
		const next = this.scrollable();
		this.reconcileFollow(next);
		this.state = this.mode === 'following-bottom' ? { ...next, end: false } : next;
		this.writeState(this.state);
	}

	scheduleCommit(): void {
		if (this.stateFrame !== null) return;
		this.stateFrame = requestAnimationFrame(() => {
			this.stateFrame = null;
			this.commit();
		});
	}

	private setAutoscrolling(on: boolean): void {
		if (this.autoscrollingTimer !== null) {
			clearTimeout(this.autoscrollingTimer);
			this.autoscrollingTimer = null;
		}
		if (this.autoscrolling !== on) {
			this.autoscrolling = on;
			this.commit();
		}
		if (on)
			this.autoscrollingTimer = window.setTimeout(() => {
				this.autoscrollingTimer = null;
				this.autoscrolling = false;
				this.commit();
			}, AUTOSCROLLING_CLEAR_DELAY);
	}

	private setSpacer(height: number): void {
		const spacer = this.spacer;
		if (!spacer) return;
		const next = Math.max(0, Math.ceil(height));
		if (this.spacerHeight === next) return;
		this.spacerHeight = next;
		spacer.hidden = next === 0;
		spacer.style.height = `${next}px`;
		spacer.style.marginTop = next > 0 ? `${-this.spacerGap}px` : '';
	}

	private scrollToPosition(top: number, behavior: ScrollBehavior, autoscrolling = false): void {
		const next = Math.max(0, top);
		if (Math.abs(this.viewport.scrollTop - next) <= SCROLL_POSITION_EPSILON) {
			this.viewport.scrollTop = next;
			this.commit();
			return;
		}
		if (autoscrolling) this.setAutoscrolling(true);
		this.viewport.scrollTo({ top: next, behavior });
		this.scheduleCommit();
	}

	scrollToStart(behavior: ScrollBehavior = 'auto'): boolean {
		this.setSpacer(0);
		this.streamingTurn = null;
		this.mode = 'free-scrolling';
		this.scrollToPosition(0, behavior);
		return true;
	}

	scrollToEnd(behavior: ScrollBehavior = 'auto'): boolean {
		this.setSpacer(0);
		this.streamingTurn = null;
		this.mode = this.autoScroll ? 'following-bottom' : 'free-scrolling';
		this.scrollToPosition(maxScrollTop(this.viewport), behavior, true);
		return true;
	}

	private elementScrollTop(el: HTMLElement, align: Align, margin: number): number {
		const top = elementTop(el, this.viewport);
		const height = el.getBoundingClientRect().height;
		const padding = this.spacer?.parentElement ? blockPadding(this.spacer.parentElement) : { start: 0, end: 0 };
		const view = this.viewport.clientHeight;
		if (align === 'center') return top - padding.start - (Math.max(0, view - padding.start - padding.end) - height) / 2 - margin;
		if (align === 'end') return top - view + height + padding.end + margin;
		if (align === 'nearest') {
			const bottom = top + height;
			const from = this.viewport.scrollTop + padding.start;
			const to = this.viewport.scrollTop + view - padding.end;
			if (top >= from && bottom <= to) return this.viewport.scrollTop;
			if (top < from) return top - padding.start - margin;
			return bottom - view + padding.end + margin;
		}
		return top - padding.start - margin;
	}

	scrollToElement(el: HTMLElement, { align = 'start', behavior = 'auto', scrollMargin = this.margin }: { align?: Align; behavior?: ScrollBehavior; scrollMargin?: number } = {}, keepPreviousPeek = false): boolean {
		if (!this.content.contains(el)) return false;
		const top = this.elementScrollTop(el, align, keepPreviousPeek ? scrollMargin + this.peek : scrollMargin);
		this.setSpacer(top + this.viewport.clientHeight - this.contentBottom());
		this.prepend = { element: el, viewportTop: viewportTop(el, this.viewport) };
		this.mode = keepPreviousPeek ? 'anchored-to-message' : 'settling-jump';
		this.streamingTurn = keepPreviousPeek ? el : null;
		this.scrollToPosition(top, behavior);
		return true;
	}

	scrollToMessage(id: string, options?: { align?: Align; behavior?: ScrollBehavior; scrollMargin?: number }): boolean {
		const el = this.items().find((item) => item.dataset.messageId === id);
		this.applied = true;
		this.clearPending();
		return el ? this.scrollToElement(el, options) : false;
	}

	private reanchor(): boolean {
		const el = this.streamingTurn;
		if (!el || !el.isConnected || this.mode !== 'anchored-to-message') return false;
		return this.scrollToElement(el, { align: 'start' }, true);
	}

	private clearPending(): void {
		this.root.removeAttribute('data-pending-scroll');
		this.viewport.removeAttribute('data-pending-scroll');
	}

	private applyDefault(): boolean {
		if (this.applied || this.itemCount === 0) return false;
		let handled: boolean;
		if (this.position === 'last-anchor') {
			const anchor = [...this.items()].reverse().find(isAnchor);
			if (!anchor) handled = this.scrollToEnd();
			else handled = this.contentBottom() - elementTop(anchor, this.viewport) <= this.viewport.clientHeight ? this.scrollToEnd() : this.scrollToElement(anchor, { align: 'start' }, true);
		} else handled = this.position === 'end' ? this.scrollToEnd() : this.scrollToStart();
		if (!handled) return false;
		this.applied = true;
		this.clearPending();
		return true;
	}

	private capturePrepend(): void {
		const top = this.viewport.getBoundingClientRect();
		const anchor = this.items().find((item) => {
			if (!item.dataset.messageId) return false;
			const r = item.getBoundingClientRect();
			return r.bottom > top.top && r.top < top.bottom;
		});
		this.prepend = anchor ? { element: anchor, viewportTop: viewportTop(anchor, this.viewport) } : null;
	}

	private restorePrepend(): boolean {
		const anchor = this.prepend;
		if (!anchor || !anchor.element.isConnected) return false;
		const delta = viewportTop(anchor.element, this.viewport) - anchor.viewportTop;
		if (Math.abs(delta) <= SCROLL_POSITION_EPSILON) return false;
		this.viewport.scrollTop += delta;
		anchor.viewportTop = viewportTop(anchor.element, this.viewport);
		this.scheduleCommit();
		return true;
	}

	contentChanged(): void {
		const items = this.items();
		const previousCount = this.itemCount;
		const previousFirst = this.firstItem;
		this.itemCount = items.length;
		this.firstItem = items[0] ?? null;
		this.reconcile(items, previousCount, previousFirst);
		this.capturePrepend();
	}

	private reconcile(items: HTMLElement[], previousCount: number, previousFirst: HTMLElement | null): void {
		if (previousCount === 0) {
			if (this.applyDefault()) return;
			if (items.length > 0 && this.autoScroll && this.scrollToEnd()) return;
			this.commit();
			return;
		}
		const firstIndex = previousFirst ? items.indexOf(previousFirst) : -1;
		if (this.preserveOnPrepend && firstIndex > 0) {
			this.restorePrepend();
			return;
		}
		if (items.length > previousCount) {
			const fresh = items.slice(previousCount).filter(isAnchor);
			if (fresh[0]) {
				if (this.autoScroll && this.mode === 'following-bottom' && fresh.length > 1) {
					this.scrollToEnd();
					return;
				}
				this.scrollToElement(fresh[0], { align: 'start' }, true);
				this.handledAnchors.add(fresh[0]);
				return;
			}
		}
		if (items.length === previousCount) {
			const anchor = items.find((item) => isAnchor(item) && !this.handledAnchors.has(item));
			if (anchor) {
				this.scrollToElement(anchor, { align: 'start' }, true);
				this.handledAnchors.add(anchor);
				return;
			}
		}
		if (this.mode === 'following-bottom' && this.autoScroll) this.scrollToEnd();
		else this.commit();
	}

	resized(): void {
		if (this.mode === 'following-bottom' && this.autoScroll) {
			this.scrollToEnd();
			return;
		}
		const previousSpacer = this.spacerHeight;
		if (this.reanchor()) {
			if (this.autoScroll && previousSpacer > 0 && this.spacerHeight === 0) this.scrollToEnd();
			return;
		}
		this.scheduleCommit();
	}

	scheduleResize(): void {
		cancelAnimationFrame(this.resizeFrame);
		this.resizeFrame = requestAnimationFrame(() => this.resized());
	}

	userScrollIntent(): void {
		if (this.mode === 'following-bottom' || this.mode === 'anchored-to-message' || this.mode === 'settling-jump') {
			this.streamingTurn = null;
			this.mode = 'free-scrolling';
		}
	}

	afterScroll(): void {
		this.commit();
		this.capturePrepend();
	}

	start(): void {
		for (const button of this.buttons()) if (button.hasAttribute('tabindex') && button.getAttribute('data-active') === 'true') button.setAttribute('data-mm-tabindex', button.getAttribute('tabindex')!);
		this.writeState(this.state);
		this.contentChanged();
		if (!this.applied && this.itemCount === 0) this.clearPending();
		new MutationObserver(() => this.contentChanged()).observe(this.content, { childList: true });
		const resize = new ResizeObserver(() => this.scheduleResize());
		resize.observe(this.viewport);
		resize.observe(this.content);
		this.viewport.addEventListener('scroll', () => this.afterScroll(), { passive: true });
		this.viewport.addEventListener('wheel', () => this.userScrollIntent(), { passive: true });
		this.viewport.addEventListener('touchmove', () => this.userScrollIntent(), { passive: true });
		if (this.autoScroll && this.mode === 'following-bottom' && this.itemCount > 0) this.scrollToEnd();
		else this.commit();
	}
}

const scrollers = new WeakMap<Element, Scroller>();

/** The scroller a transcript element belongs to, started on first use. */
export function scrollerOf(el: Element): Scroller | undefined {
	const root = el.closest<HTMLElement>(ROOT);
	if (!root) return undefined;
	const known = scrollers.get(root);
	if (known) return known;
	const viewport = [...root.querySelectorAll<HTMLElement>(VIEWPORT)].find((v) => v.closest(ROOT) === root);
	const content = viewport?.querySelector<HTMLElement>(CONTENT);
	if (!viewport || !content) return undefined;
	const scroller = new Scroller(root, viewport, content);
	scrollers.set(root, scroller);
	scroller.start();
	return scroller;
}

export function mount(el: Element): void {
	if (el.matches(ROOT)) scrollerOf(el);
}

export function click(target: Element): boolean {
	const button = target.closest<HTMLButtonElement>(BUTTON);
	if (!button) return false;
	const scroller = scrollerOf(button);
	if (!scroller) return false;
	if (button.getAttribute('data-active') !== 'true') return true;
	button.blur();
	const behavior = (button.getAttribute('data-mm-behavior') as ScrollBehavior | null) ?? 'smooth';
	if (button.getAttribute('data-direction') === 'start') scroller.scrollToStart(behavior);
	else scroller.scrollToEnd(behavior);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	if (!USER_SCROLL_KEYS.has(event.key) || !target.matches(VIEWPORT)) return false;
	scrollerOf(target)?.userScrollIntent();
	return false;
}

/** useMessageScroller's scrollToMessage, from a control outside the transcript (a menu item): the message is found by its id. */
export function scrollToMessage(id: string, behavior: ScrollBehavior): void {
	const item = [...document.querySelectorAll<HTMLElement>(`${CONTENT} > [data-message-id]`)].find((el) => el.dataset.messageId === id);
	if (item) scrollerOf(item)?.scrollToMessage(id, { align: 'start', behavior });
}
