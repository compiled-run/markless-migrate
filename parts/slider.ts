// Radix Slider, Base UI Slider and React Aria's: a press on the control moves the closest thumb to the pointer and drags
// it; on a focused thumb the arrows step, Page Up and Page Down (and Shift with an arrow) take the library's page step,
// Home and End go to the ends. Each library's own markup is updated as it renders it: Radix's thumb wrapper `left: calc(P% + offset)`
// (getThumbInBoundsOffset) and range `left`/`right`; Base UI's `--position` on the thumb, `--start-position` on the
// indicator (thumbs aligned to the control's edges) and the range input's value; React Aria's thumb `left: P%`, the range
// shadcn renders from its values (`inset-inline-start`, `width`), and each thumb's range input value and aria-valuetext.

interface Slider {
	readonly root: HTMLElement;
	readonly base: boolean;
	readonly rac: boolean;
	readonly vertical: boolean;
	readonly thumbs: HTMLElement[];
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly rtl: boolean;
}

const ROOT = '[data-slot="slider"]';

function sliderOf(el: Element): Slider | undefined {
	const root = el.closest<HTMLElement>(ROOT);
	const rac = root?.hasAttribute('data-rac') === true;
	const vertical = root?.getAttribute('data-orientation') === 'vertical';
	if (!root || root.hasAttribute('data-disabled') || root.getAttribute('aria-disabled') === 'true') return undefined;
	const base = rac || root.querySelector('[data-base-ui-slider-control]') !== null;
	const thumbs = base ? [...root.querySelectorAll<HTMLElement>('[data-slot="slider-thumb"]')] : [...root.querySelectorAll<HTMLElement>('[role="slider"]')];
	if (!thumbs.length) return undefined;
	// React Aria bounds each thumb's input by its neighbours: the slider's ends are the first thumb's min and the last's max.
	const first = base ? thumbs[0]!.querySelector('input')! : thumbs[0]!;
	const last = base ? thumbs[thumbs.length - 1]!.querySelector('input')! : thumbs[thumbs.length - 1]!;
	const min = Number((base ? first.getAttribute('min') : first.getAttribute('aria-valuemin')) ?? 0);
	const max = Number((base ? last.getAttribute('max') : last.getAttribute('aria-valuemax')) ?? 100);
	const step = Number((base ? first.getAttribute('step') : root.dataset.mmStep) ?? 1) || 1;
	const rtl = (root.getAttribute('dir') ?? getComputedStyle(root).direction) === 'rtl';
	return { root, base, rac, vertical, thumbs, min, max, step, rtl };
}

const input = (s: Slider, i: number) => (s.base ? s.thumbs[i]!.querySelector('input')! : s.thumbs[i]!) as HTMLInputElement;
const valueAt = (s: Slider, i: number) => Number(s.base ? input(s, i).value : s.thumbs[i]!.getAttribute('aria-valuenow'));
const percent = (s: Slider, v: number) => ((v - s.min) / (s.max - s.min)) * 100;
const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;
const snap = (s: Slider, v: number) => Number(Math.min(s.max, Math.max(s.min, Math.round((v - s.min) / s.step) * s.step + s.min)).toFixed(decimals(s.step)));

// Sets thumb i to v and returns the thumb that holds it now. Radix's updateValues sorts the values, so a thumb passes its
// neighbour (minStepsBetweenThumbs at its default, 0) and focus follows the moved value; Base UI and React Aria clamp.
function set(s: Slider, i: number, v: number): number {
	const values = s.thumbs.map((_, k) => valueAt(s, k));
	if (!s.base) {
		const value = snap(s, v);
		const next = values.map((x, k) => (k === i ? value : x)).sort((a, b) => a - b);
		const at = next.indexOf(value);
		if (String(next) === String(values)) return at;
		render(s, next);
		s.thumbs[at]!.focus();
		return at;
	}
	const lo = i > 0 ? values[i - 1]! : s.min;
	const hi = i < values.length - 1 ? values[i + 1]! : s.max;
	values[i] = Math.min(hi, Math.max(lo, snap(s, v)));
	render(s, values);
	return i;
}

function render(s: Slider, values: number[]): void {
	const fmt = (n: number) => `${Number(n.toFixed(4))}`;
	if (s.rac) {
		const ps = values.map((v) => percent(s, v));
		values.forEach((v, k) => {
			const el = input(s, k);
			el.value = String(v);
			el.setAttribute('aria-valuetext', String(v));
			el.setAttribute('min', String(k > 0 ? values[k - 1]! : s.min));
			el.setAttribute('max', String(k < values.length - 1 ? values[k + 1]! : s.max));
			// useSliderThumb: `top` from the top for a vertical slider, `left` (mirrored in RTL) otherwise.
			if (s.vertical) s.thumbs[k]!.style.setProperty('top', `${fmt(100 - ps[k]!)}%`);
			else s.thumbs[k]!.style.setProperty('left', `${fmt(s.rtl ? 100 - ps[k]! : ps[k]!)}%`);
		});
		const range = s.root.querySelector<HTMLElement>('[data-slot="slider-range"]');
		if (range) {
			const start = ps.length > 1 ? Math.min(...ps) : 0;
			range.style.setProperty(s.vertical ? 'bottom' : 'inset-inline-start', `${fmt(start)}%`);
			range.style.setProperty(s.vertical ? 'height' : 'width', `${fmt(Math.max(...ps) - start)}%`);
		}
		return;
	}
	if (s.base) {
		const control = s.root.querySelector<HTMLElement>('[data-base-ui-slider-control]')!;
		const side = s.vertical ? 'height' : 'width';
		const width = control.getBoundingClientRect()[side] || 1;
		const positions = values.map((v, k) => {
			const size = s.thumbs[k]!.getBoundingClientRect()[side];
			const frac = (v - s.min) / (s.max - s.min);
			return ((size / 2 + frac * (width - size)) / width) * 100;
		});
		values.forEach((v, k) => {
			const el = input(s, k);
			el.value = String(v);
			el.setAttribute('value', String(v));
			el.setAttribute('aria-valuenow', String(v));
			s.thumbs[k]!.style.setProperty('--position', `${fmt(positions[k]!)}%`);
		});
		const indicator = s.root.querySelector<HTMLElement>('[data-base-ui-slider-indicator]');
		if (indicator) {
			indicator.style.setProperty('--start-position', `${fmt(positions.length > 1 ? positions[0]! : positions[0]!)}%`);
			if (positions.length > 1) indicator.style.setProperty('--end-position', `${fmt(positions[positions.length - 1]!)}%`);
		}
		return;
	}
	values.forEach((v, k) => {
		const thumb = s.thumbs[k]!;
		thumb.setAttribute('aria-valuenow', String(v));
		const p = percent(s, v);
		if (s.vertical) {
			const half = thumb.getBoundingClientRect().height / 2;
			thumb.parentElement!.style.setProperty('bottom', `calc(${fmt(p)}% + ${fmt(half - (p / 50) * half)}px)`.replace('+ -', '- '));
			return;
		}
		const half = thumb.getBoundingClientRect().width / 2;
		const direction = s.rtl ? -1 : 1;
		const offset = (half - (p / 50) * half * direction) * direction;
		const wrapper = thumb.parentElement!;
		const edge = s.rtl ? 'right' : 'left';
		wrapper.style.setProperty(edge, `calc(${fmt(p)}% + ${fmt(offset)}px)`.replace('+ -', '- '));
	});
	const range = s.root.querySelector<HTMLElement>('[data-slot="slider-range"]');
	if (range) {
		const ps = values.map((v) => percent(s, v));
		const start = ps.length > 1 ? Math.min(...ps) : 0;
		const end = 100 - Math.max(...ps);
		if (s.vertical) {
			range.style.setProperty('bottom', `${fmt(start)}%`);
			range.style.setProperty('top', `${fmt(end)}%`);
			return;
		}
		range.style.setProperty(s.rtl ? 'right' : 'left', `${fmt(start)}%`);
		range.style.setProperty(s.rtl ? 'left' : 'right', `${fmt(end)}%`);
	}
}

function fromPointer(s: Slider, x: number, y = 0): number {
	const control = s.base && !s.rac ? s.root.querySelector<HTMLElement>('[data-base-ui-slider-control]') : null;
	if (control) {
		// Base UI's getFingerState with the thumbs inset (thumbAlignment "edge"): the travel is the control's content box
		// less a thumb, starting half a thumb in.
		const box = control.getBoundingClientRect();
		const css = getComputedStyle(control);
		const px = (name: string) => parseFloat(css.getPropertyValue(name)) || 0;
		const [start, end] = s.vertical ? [px('border-top-width') + px('padding-top'), px('border-bottom-width') + px('padding-bottom')] : [px('border-inline-start-width') + px('padding-inline-start'), px('border-inline-end-width') + px('padding-inline-end')];
		const half = s.thumbs[0]!.getBoundingClientRect()[s.vertical ? 'height' : 'width'] / 2;
		const travel = (s.vertical ? box.height : box.width) - start - end - half * 2;
		const along = s.vertical ? box.bottom - y - end : (s.rtl ? box.right - x : x - box.left) - start;
		return s.min + Math.min(1, Math.max(0, (along - half) / (travel || 1))) * (s.max - s.min);
	}
	const track = (s.root.querySelector<HTMLElement>('[data-base-ui-slider-control]') ?? (s.rac ? s.root.querySelector<HTMLElement>('[data-slot="slider-track"]') : null) ?? s.root).getBoundingClientRect();
	if (s.vertical) return s.min + Math.min(1, Math.max(0, (track.bottom - y) / (track.height || 1))) * (s.max - s.min);
	let frac = (x - track.left) / (track.width || 1);
	if (s.rtl) frac = 1 - frac;
	return s.min + Math.min(1, Math.max(0, frac)) * (s.max - s.min);
}

export function pointerdown(target: Element, event: PointerEvent): boolean {
	if (event.button !== 0) return false;
	const s = sliderOf(target);
	if (!s) return false;
	const v = fromPointer(s, event.clientX, event.clientY);
	const values = s.thumbs.map((_, k) => valueAt(s, k));
	let i = 0;
	for (let k = 1; k < values.length; k++) if (Math.abs(values[k]! - v) < Math.abs(values[i]! - v)) i = k;
	// A press on a Radix thumb only focuses it; anywhere else on the track moves the closest thumb there.
	const thumb = s.base ? -1 : s.thumbs.findIndex((t) => t === target || t.contains(target));
	if (thumb >= 0) i = thumb;
	else i = set(s, i, v);
	event.preventDefault();
	input(s, i).focus({ preventScroll: true });
	s.root.setPointerCapture?.(event.pointerId);
	const move = (e: PointerEvent) => (i = set(s, i, fromPointer(s, e.clientX, e.clientY)));
	const up = () => {
		s.root.removeEventListener('pointermove', move);
		s.root.removeEventListener('pointerup', up);
		s.root.removeEventListener('pointercancel', up);
	};
	s.root.addEventListener('pointermove', move);
	s.root.addEventListener('pointerup', up);
	s.root.addEventListener('pointercancel', up);
	return true;
}

// React Aria's pageSize (useSliderState): a tenth of the range snapped to the step; Base UI's largeStep default; Radix's step x 10.
function pageStep(s: Slider): number {
	if (s.rac) return Math.max(Number((Math.round((s.max - s.min) / 10 / s.step) * s.step).toFixed(decimals(s.step))), s.step);
	return s.base ? 10 : s.step * 10;
}

export function keydown(target: Element, event: KeyboardEvent): boolean {
	const s = sliderOf(target);
	if (!s) return false;
	const i = s.thumbs.findIndex((t) => t === target || t.contains(target));
	if (i < 0) return false;
	const v = valueAt(s, i);
	const big = pageStep(s);
	const forward = s.rtl ? -1 : 1;
	const next = {
		ArrowRight: v + (event.shiftKey ? big : s.step) * (s.vertical ? 1 : forward),
		ArrowLeft: v - (event.shiftKey ? big : s.step) * (s.vertical ? 1 : forward),
		ArrowUp: v + (event.shiftKey ? big : s.step),
		ArrowDown: v - (event.shiftKey ? big : s.step),
		PageUp: v + big,
		PageDown: v - big,
		Home: s.min,
		End: s.max,
	}[event.key];
	if (next === undefined) return false;
	event.preventDefault();
	// Radix's Home sets the first value and End the last, whichever thumb has focus.
	const at = s.base ? i : event.key === 'Home' ? 0 : event.key === 'End' ? s.thumbs.length - 1 : i;
	set(s, at, next);
	return true;
}
