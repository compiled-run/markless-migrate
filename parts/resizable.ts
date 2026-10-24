// react-resizable-panels 4: a separator between two panels of a group resizes them, by pointer drag or by keyboard
// (arrows 5 %, Home and End to the preceding panel's minimum and maximum), each panel's size its flex-grow and the
// separator's aria-valuenow, within the minimum and maximum sizes the source gives each panel (data-mm-min-size,
// data-mm-max-size, written by the converter). data-separator is "hover" under the pointer and "active" while dragged.
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
	const forward = p.row ? (getComputedStyle(p.group).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown';
	const backward = p.row ? (forward === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight') : 'ArrowUp';
	const to = event.key === forward ? size + STEP : event.key === backward ? size - STEP : event.key === 'Home' ? -Infinity : event.key === 'End' ? Infinity : undefined;
	if (to === undefined) return false;
	event.preventDefault();
	resize(p, to);
	return true;
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	const p = pairOf(target);
	if (!p || event.button !== 0) return false;
	event.preventDefault();
	const box = p.group.getBoundingClientRect();
	const length = p.row ? box.width : box.height;
	const total = sizeOf(p.before) + sizeOf(p.after);
	const start = p.row ? event.clientX : event.clientY;
	const from = sizeOf(p.before);
	const rtl = p.row && getComputedStyle(p.group).direction === 'rtl' ? -1 : 1;
	p.separator.setAttribute('data-separator', 'active');
	p.separator.setPointerCapture?.(event.pointerId);
	const move = (e: PointerEvent) => resize(p, from + ((((p.row ? e.clientX : e.clientY) - start) * rtl) / (length || 1)) * (total || 100));
	const up = () => {
		p.separator.setAttribute('data-separator', p.separator.matches(':hover') ? 'hover' : 'inactive');
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
	p.separator.setAttribute('data-separator', 'hover');
	return false;
}

export function pointerout(target: Element, event: PointerEvent): boolean {
	const p = pairOf(target);
	if (!p || p.separator.getAttribute('data-separator') === 'active' || (event.relatedTarget instanceof Node && p.separator.contains(event.relatedTarget))) return false;
	p.separator.setAttribute('data-separator', 'inactive');
	return false;
}
