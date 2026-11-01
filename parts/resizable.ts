// react-resizable-panels 4: a separator between two panels of a group resizes them, by pointer drag or by keyboard
// (the arrows of the group's orientation 5 %, in either text direction, Home and End to the preceding panel's minimum and maximum), each panel's size its flex-grow and the
// separator's aria-valuenow, within the minimum and maximum sizes the source gives each panel (data-mm-min-size,
// data-mm-max-size, written by the converter). data-separator is "hover" under the pointer and "active" while dragged; a
// press focuses the separator, and a release leaves it "inactive" until the pointer moves again.
const SEPARATOR = '[data-group] > [role="separator"]';
const STEP = 5;

interface Pair {
	readonly separator: HTMLElement;
	readonly group: HTMLElement;
	readonly before: HTMLElement;
	readonly after: HTMLElement;
	readonly row: boolean;
}

function pairOf(target: Element): Pair | undefined {
	const separator = target.closest<HTMLElement>(SEPARATOR);
	const group = separator?.parentElement;
	if (!separator || !group) return undefined;
	const panels = [...group.children].filter((c): c is HTMLElement => c.hasAttribute('data-panel'));
	const at = [...group.children].indexOf(separator);
	const before = panels.filter((p) => [...group.children].indexOf(p) < at).pop();
	const after = panels.find((p) => [...group.children].indexOf(p) > at);
	if (!before || !after) return undefined;
	return { separator, group, before, after, row: getComputedStyle(group).flexDirection !== 'column' };
}

// A separator's hit area is its box grown to 10 px (20 px for a coarse pointer), found by position: another element may
// be drawn over it (react-resizable-panels 4's resizeTargetMinimumSize and its document-level pointer handling).
function pairAt(target: Element, x: number, y: number): Pair | undefined {
	const min = matchMedia('(pointer: coarse)').matches ? 20 : 10;
	for (let group = target.closest<HTMLElement>('[data-group]'); group; group = group.parentElement?.closest<HTMLElement>('[data-group]') ?? null) {
		for (const separator of group.querySelectorAll<HTMLElement>(':scope > [role="separator"]')) {
			const r = separator.getBoundingClientRect();
			const [w, h] = [Math.max(r.width, min), Math.max(r.height, min)];
			const [left, top] = [r.left - (w - r.width) / 2, r.top - (h - r.height) / 2];
			if (x >= left && x <= left + w && y >= top && y <= top + h) return pairOf(separator);
		}
	}
	return undefined;
}

// While a separator is pointed at or dragged the library adopts a sheet putting its resize cursor on everything.
let cursorSheet: CSSStyleSheet | undefined;
function setState(p: Pair, state: 'inactive' | 'hover' | 'active'): void {
	p.separator.setAttribute('data-separator', state);
	cursorSheet ??= new CSSStyleSheet();
	const adopted = document.adoptedStyleSheets.filter((s) => s !== cursorSheet);
	if (state === 'inactive') {
		document.adoptedStyleSheets = adopted;
		return;
	}
	cursorSheet.replaceSync(`*, :hover { cursor: ${p.row ? 'ew-resize' : 'ns-resize'} !important;${state === 'active' ? ' touch-action: none;' : ''} }`);
	document.adoptedStyleSheets = [...adopted, cursorSheet];
}

const sizeOf = (panel: HTMLElement) => parseFloat(panel.style.flexGrow || getComputedStyle(panel).flexGrow) || 0;
const limit = (panel: HTMLElement, name: 'min' | 'max', fallback: number) => {
	const v = parseFloat(panel.dataset[name === 'min' ? 'mmMinSize' : 'mmMaxSize'] ?? '');
	return Number.isFinite(v) ? v : fallback;
};

function resize(p: Pair, to: number): void {
	const total = sizeOf(p.before) + sizeOf(p.after);
	const lo = Math.max(limit(p.before, 'min', 0), total - limit(p.after, 'max', total));
	const hi = Math.min(limit(p.before, 'max', total), total - limit(p.after, 'min', 0));
	const before = Math.min(hi, Math.max(lo, to));
	const after = total - before;
	const fmt = (n: number) => `${Number(n.toFixed(3))}`;
	p.before.style.flex = `${fmt(before)} 1 0px`;
	p.after.style.flex = `${fmt(after)} 1 0px`;
	p.separator.setAttribute('aria-valuenow', fmt(before));
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const p = pairOf(target);
	if (!p || target !== p.separator) return false;
	const size = sizeOf(p.before);
	// onDocumentKeyDown: the arrows of the group's orientation, whatever the text direction; the other two do nothing.
	const step = { ArrowRight: p.row ? STEP : 0, ArrowLeft: p.row ? -STEP : 0, ArrowDown: p.row ? 0 : STEP, ArrowUp: p.row ? 0 : -STEP, Home: -Infinity, End: Infinity }[event.key];
	if (step === undefined) return false;
	event.preventDefault();
	if (step) resize(p, size + step);
	return true;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const p = pairOf(target) ?? pairAt(target, event.clientX, event.clientY);
	if (!p || event.button !== 0) return false;
	event.preventDefault();
	// calculateAvailableGroupSize: the panels' own sizes, without the separators between them.
	const length = [...p.group.children].reduce((sum, c) => (c instanceof HTMLElement && c.hasAttribute('data-panel') ? sum + (p.row ? c.offsetWidth : c.offsetHeight) : sum), 0);
	const total = sizeOf(p.before) + sizeOf(p.after);
	const start = p.row ? event.clientX : event.clientY;
	const from = sizeOf(p.before);
	setState(p, 'active');
	p.separator.focus();
	p.separator.setPointerCapture?.(event.pointerId);
	const move = (e: PointerEvent) => resize(p, from + (((p.row ? e.clientX : e.clientY) - start) / (length || 1)) * (total || 100));
	const up = () => {
		setState(p, 'inactive');
		p.separator.addEventListener('pointermove', () => p.separator.getAttribute('data-separator') === 'inactive' && setState(p, 'hover'), { once: true });
		p.separator.removeEventListener('pointermove', move);
		p.separator.removeEventListener('pointerup', up);
		p.separator.removeEventListener('pointercancel', up);
	};
	p.separator.addEventListener('pointermove', move);
	p.separator.addEventListener('pointerup', up);
	p.separator.addEventListener('pointercancel', up);
	return true;
}

export function pointerover(target: Element): boolean {
	const p = pairOf(target);
	if (!p || p.separator.getAttribute('data-separator') === 'active') return false;
	setState(p, 'hover');
	return false;
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	const p = pairOf(target);
	if (!p || p.separator.getAttribute('data-separator') === 'active' || (event.relatedTarget instanceof Node && p.separator.contains(event.relatedTarget))) return false;
	setState(p, 'inactive');
	return false;
}
