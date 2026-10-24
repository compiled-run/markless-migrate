// recharts' Tooltip on the converter's chart state (convert's ChartPlan): the pointer over the plot activates the data
// point whose range it is in (as the old page's own sweep measured them), the arrow keys step through the points from
// the first once the chart has focus (accessibilityLayer), and leaving or blurring hides the tooltip. The active
// point's index goes to the chart as an `mmchart` event; this places the tooltip where recharts did, with its 400 ms
// transform transition, following the pointer down the plot.

interface Facts {
	readonly w: number;
	readonly h: number;
	/** Per point: the pointer's range from the surface's left edge, the tooltip's x, and its y less the pointer's. */
	readonly s: readonly (readonly [number, number, number, number])[];
}

const WRAPPER = '[data-mm-chart]';
const facts = new WeakMap<Element, Facts>();
const active = new WeakMap<Element, number>();
const wired = new WeakSet<Element>();

function factsOf(wrapper: Element): Facts | undefined {
	if (!facts.has(wrapper)) {
		try {
			facts.set(wrapper, JSON.parse(wrapper.getAttribute('data-mm-chart') ?? '') as Facts);
		} catch {
			return undefined;
		}
	}
	return facts.get(wrapper);
}

function show(wrapper: HTMLElement, index: number, pointerY: number): void {
	const f = factsOf(wrapper);
	const tip = wrapper.querySelector<HTMLElement>('.recharts-tooltip-wrapper');
	if (!f || !tip) return;
	if (active.get(wrapper) !== index) {
		active.set(wrapper, index);
		wrapper.dispatchEvent(new CustomEvent('mmchart', { detail: index }));
	}
	if (index < 0) {
		tip.style.visibility = 'hidden';
		return;
	}
	const [, , x, dy] = f.s[index]!;
	tip.style.visibility = 'visible';
	tip.style.transition = 'transform 400ms';
	tip.style.transform = `translate(${x}px, ${Math.max(0, pointerY + dy)}px)`;
}

function at(wrapper: HTMLElement, event: PointerEvent): void {
	const f = factsOf(wrapper);
	const svg = wrapper.querySelector('svg.recharts-surface');
	if (!f || !svg) return;
	const box = svg.getBoundingClientRect();
	const x = (event.clientX - box.left) * (f.w / (box.width || f.w));
	const y = (event.clientY - box.top) * (f.h / (box.height || f.h));
	const index = f.s.findIndex(([from, to]) => x >= from - 1 && x <= to + 1);
	show(wrapper, index, y);
}

export function pointerover(target: Element): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || wired.has(wrapper)) return false;
	wired.add(wrapper);
	wrapper.addEventListener('pointermove', (event) => at(wrapper, event));
	wrapper.addEventListener('pointerleave', () => show(wrapper, -1, 0));
	return false;
}

export function focusin(target: Element): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || !target.matches('svg.recharts-surface')) return false;
	const f = factsOf(wrapper);
	if (f?.s.length) show(wrapper, 0, f.h / 2);
	return true;
}

export function focusout(target: Element): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || !target.matches('svg.recharts-surface')) return false;
	show(wrapper, -1, 0);
	return true;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const wrapper = target.closest<HTMLElement>(WRAPPER);
	if (!wrapper || !target.matches('svg.recharts-surface') || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return false;
	const f = factsOf(wrapper);
	if (!f?.s.length) return false;
	event.preventDefault();
	const now = active.get(wrapper) ?? 0;
	show(wrapper, Math.min(f.s.length - 1, Math.max(0, now + (event.key === 'ArrowRight' ? 1 : -1))), f.h / 2);
	return true;
}
