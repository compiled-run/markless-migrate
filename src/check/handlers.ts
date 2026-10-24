import type { Page } from 'playwright';

/** Pointer and key events an element answers to when it is a control. */
const INPUT_EVENTS = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'dblclick']);
/** Events a surface answers the pointer moving over (a chart's tooltip and active point). */
const HOVER_EVENTS = new Set(['mousemove', 'pointermove', 'mouseover', 'pointerover', 'mouseenter', 'pointerenter']);
const MAX_ELEMENTS = 3000;

/**
 * Marks, page-side in `globalThis.__markless_migrate_handlers__` (a WeakSet the page never sees in its
 * DOM), every visible element that listens for a pointer or key event itself: native listeners as
 * Chromium's DOMDebugger reports them, and the props React, Vue, Svelte and Solid keep on the element
 * for the listeners they delegate to the root.
 */
export async function markHandlers(page: Page): Promise<void> {
	const cdp = await page.context().newCDPSession(page).catch(() => undefined);
	try {
		await page.evaluate(frameworkHandlers).catch(() => {});
		if (!cdp) return;
		const list = await cdp.send('Runtime.evaluate', { expression: `(${listElements.toString()})(${MAX_ELEMENTS})`, objectGroup: 'mm-handlers' });
		const arrayId = list.result.objectId;
		if (!arrayId) return;
		const { result } = await cdp.send('Runtime.getProperties', { objectId: arrayId, ownProperties: true });
		const elements = result.filter((p) => /^\d+$/.test(p.name) && p.value?.objectId).map((p) => p.value!.objectId!);
		const marked: string[] = [];
		const hovered: string[] = [];
		for (const objectId of elements) {
			const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId, depth: 0 }).catch(() => ({ listeners: [] as { type: string }[] }));
			if (listeners.some((l) => INPUT_EVENTS.has(l.type))) marked.push(objectId);
			if (listeners.some((l) => HOVER_EVENTS.has(l.type))) hovered.push(objectId);
		}
		for (const objectId of marked) await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function () { (globalThis.__markless_migrate_handlers__ ??= new WeakSet()).add(this); }' }).catch(() => {});
		for (const objectId of hovered) await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function () { (globalThis.__markless_migrate_hover__ ??= new WeakSet()).add(this); }' }).catch(() => {});
		await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'mm-handlers' }).catch(() => {});
	} finally {
		await cdp?.detach().catch(() => {});
	}
}

// HTML elements first, then the shapes inside SVG (a chart's bars and slices), within the same budget.
function listElements(max: number): Element[] {
	const out: Element[] = [];
	const shapes: Element[] = [];
	for (const el of document.body?.querySelectorAll('*') ?? []) {
		if (out.length >= max) break;
		if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|BR|HR)$/.test(el.tagName) || !el.getClientRects().length) continue;
		if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) shapes.push(el);
		else out.push(el);
	}
	return [...out, ...shapes.slice(0, Math.max(0, max - out.length))];
}

function frameworkHandlers(): void {
	const set: WeakSet<Element> = ((globalThis as { __markless_migrate_handlers__?: WeakSet<Element> }).__markless_migrate_handlers__ ??= new WeakSet());
	const hover: WeakSet<Element> = ((globalThis as { __markless_migrate_hover__?: WeakSet<Element> }).__markless_migrate_hover__ ??= new WeakSet());
	const reactHover = /^on(MouseMove|PointerMove|MouseEnter|MouseOver|PointerEnter|PointerOver)(Capture)?$/;
	const vueHover = /^on(Mousemove|Pointermove|Mouseenter|Mouseover|Pointerenter|Pointerover)$/;
	const react = /^on(Click|MouseDown|MouseUp|PointerDown|PointerUp|KeyDown|KeyUp|DoubleClick)(Capture)?$/;
	const vue = /^on(Click|Mousedown|Mouseup|Pointerdown|Pointerup|Keydown|Keyup|Dblclick)$/;
	for (const el of document.body?.querySelectorAll('*') ?? []) {
		const own = el as unknown as Record<string, unknown>;
		for (const key of Object.keys(own)) {
			const value = own[key];
			if (key.startsWith('__reactProps$') && value && typeof value === 'object' && Object.keys(value).some((k) => react.test(k) && typeof (value as Record<string, unknown>)[k] === 'function')) set.add(el);
			if (key.startsWith('__reactProps$') && value && typeof value === 'object' && Object.keys(value).some((k) => reactHover.test(k) && typeof (value as Record<string, unknown>)[k] === 'function')) hover.add(el);
			if (key === '_vei' && value && typeof value === 'object' && Object.keys(value).some((k) => vueHover.test(k))) hover.add(el);
			else if (key === '_vei' && value && typeof value === 'object' && Object.keys(value).some((k) => vue.test(k))) set.add(el);
			else if (/^(__|\$\$)(click|mousedown|pointerdown|keydown)$/.test(key) && own[key] !== undefined) set.add(el);
		}
	}
}
