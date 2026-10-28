// recharts 3.8's tick choice, for an axis whose text is not the capture's (a visitor behind UTC reads its dates a day
// earlier): getTicks keeps the ticks that fit, measured as recharts measures them, and the axis is drawn with those.
// Convert writes every tick the axis could show (`a` in the drawing's facts: coordinates and the formatter's text).

/** A cartesian axis as recharts' CartesianAxis was given it (convert's AxisModel). */
export interface Axis {
	readonly t: 'xAxis' | 'yAxis';
	readonly o: 'top' | 'bottom' | 'left' | 'right';
	readonly box: readonly [number, number, number, number];
	readonly vb: readonly [number, number, number, number];
	readonly gap: number;
	readonly iv: string | number;
	readonly ts: number;
	readonly tm: number;
	readonly m?: true;
	readonly u?: string;
	readonly ang?: number;
	readonly off: number;
	readonly c: readonly number[];
	readonly l: readonly string[];
}

interface Tick {
	readonly coordinate: number;
	readonly index: number;
	tickCoord?: number;
	isShow?: boolean;
}

type Size = (tick: Tick, index: number) => number;

const SPAN_ID = 'recharts_measurement_span';
const sizes = new Map<string, { width: number; height: number }>();

// recharts' getStringSize: a span at the end of the body, in the tick's font size and letter spacing.
function stringSize(text: string, style: { fontSize: string; letterSpacing: string }): { width: number; height: number } {
	const key = `${text}|${style.fontSize}|${style.letterSpacing}`;
	const known = sizes.get(key);
	if (known) return known;
	let span = document.getElementById(SPAN_ID);
	if (!span) {
		span = document.createElement('span');
		span.setAttribute('id', SPAN_ID);
		span.setAttribute('aria-hidden', 'true');
		document.body.appendChild(span);
	}
	Object.assign(span.style, { position: 'absolute', top: '-20000px', left: 0, padding: 0, margin: 0, border: 'none', whiteSpace: 'pre' }, style);
	span.textContent = text;
	const rect = span.getBoundingClientRect();
	const size = { width: rect.width, height: rect.height };
	sizes.set(key, size);
	return size;
}

// recharts' getAngledRectangleWidth.
function angledWidth(width: number, height: number, angle = 0): number {
	const normalized = ((angle % 180) + 180) % 180;
	const radians = (normalized * Math.PI) / 180;
	const threshold = Math.atan(height / width);
	const length = radians > threshold && radians < Math.PI - threshold ? height / Math.sin(radians) : width / Math.cos(radians);
	return Math.abs(length);
}

function isVisible(sign: number, at: number, size: () => number, start: number, end: number): boolean {
	if (sign * at < sign * start || sign * at > sign * end) return false;
	const s = size();
	return sign * (at - (sign * s) / 2 - start) >= 0 && sign * (at + (sign * s) / 2 - end) <= 0;
}

const everyNth = <T>(array: readonly T[], n: number): T[] => {
	if (n < 1) return [];
	if (n === 1) return [...array];
	const out: T[] = [];
	for (let i = 0; i < array.length; i += n) out.push(array[i]!);
	return out;
};

function ticksEnd(sign: number, bounds: { start: number; end: number }, size: Size, ticks: Tick[], gap: number): Tick[] {
	const result = ticks.map((t) => ({ ...t }));
	let { end } = bounds;
	for (let i = result.length - 1; i >= 0; i--) {
		const entry = result[i]!;
		let s: number | undefined;
		const get = () => (s ??= size(ticks[i]!, i));
		if (i === result.length - 1) {
			const over = sign * (entry.coordinate + (sign * get()) / 2 - end);
			entry.tickCoord = over > 0 ? entry.coordinate - over * sign : entry.coordinate;
		} else entry.tickCoord = entry.coordinate;
		if (isVisible(sign, entry.tickCoord, get, bounds.start, end)) {
			end = entry.tickCoord - sign * (get() / 2 + gap);
			entry.isShow = true;
		}
	}
	return result;
}

function ticksStart(sign: number, bounds: { start: number; end: number }, size: Size, ticks: Tick[], gap: number, preserveEnd: boolean): Tick[] {
	const result = ticks.map((t) => ({ ...t }));
	let { start, end } = bounds;
	const len = result.length;
	if (preserveEnd && len) {
		const tail = result[len - 1]!;
		const tailSize = size(ticks[len - 1]!, len - 1);
		const over = sign * (tail.coordinate + (sign * tailSize) / 2 - end);
		tail.tickCoord = over > 0 ? tail.coordinate - over * sign : tail.coordinate;
		if (isVisible(sign, tail.tickCoord, () => tailSize, start, end)) {
			end = tail.tickCoord - sign * (tailSize / 2 + gap);
			tail.isShow = true;
		}
	}
	for (let i = 0; i < (preserveEnd ? len - 1 : len); i++) {
		const entry = result[i]!;
		let s: number | undefined;
		const get = () => (s ??= size(ticks[i]!, i));
		if (i === 0) {
			const under = sign * (entry.coordinate - (sign * get()) / 2 - start);
			entry.tickCoord = under < 0 ? entry.coordinate - under * sign : entry.coordinate;
		} else entry.tickCoord = entry.coordinate;
		if (isVisible(sign, entry.tickCoord, get, start, end)) {
			start = entry.tickCoord + sign * (get() / 2 + gap);
			entry.isShow = true;
		}
	}
	return result;
}

function equidistant(sign: number, bounds: { start: number; end: number }, size: Size, ticks: Tick[], gap: number): Tick[] {
	let index = 0;
	let step = 1;
	let start = bounds.start;
	while (step <= ticks.length) {
		const entry = ticks[index];
		if (entry === undefined) return everyNth(ticks, step);
		const i = index;
		let s: number | undefined;
		const get = () => (s ??= size(entry, i));
		if (index === 0 || isVisible(sign, entry.coordinate, get, start, bounds.end)) {
			start = entry.coordinate + sign * (get() / 2 + gap);
			index += step;
		} else {
			index = 0;
			start = bounds.start;
			step += 1;
		}
	}
	return [];
}

function equidistantEnd(sign: number, bounds: { start: number; end: number }, size: Size, ticks: Tick[], gap: number): Tick[] {
	const len = ticks.length;
	for (let step = 1; step <= len; step++) {
		const offset = (len - 1) % step;
		let start = bounds.start;
		let ok = true;
		for (let index = offset; index < len; index += step) {
			const entry = ticks[index]!;
			let s: number | undefined;
			const get = () => (s ??= size(entry, index));
			if (index !== offset && !isVisible(sign, entry.coordinate, get, start, bounds.end)) {
				ok = false;
				break;
			}
			start = entry.coordinate + sign * (get() / 2 + gap);
		}
		if (ok) return everyNth(ticks.slice(offset), step);
	}
	return [];
}

/** recharts' getTicks: the ticks an axis shows, each with the coordinate its text is drawn at. */
export function chooseTicks(axis: Axis, labels: readonly string[], style: { fontSize: string; letterSpacing: string }): Tick[] {
	const ticks: Tick[] = axis.c.map((coordinate, index) => ({ coordinate, index }));
	if (!ticks.length) return [];
	if (typeof axis.iv === 'number') return everyNth(ticks, axis.iv + 1);
	const horizontal = axis.o === 'top' || axis.o === 'bottom';
	const unit = axis.u && horizontal ? stringSize(axis.u, style) : { width: 0, height: 0 };
	const size: Size = (tick) => {
		const text = stringSize(labels[tick.index] ?? '', style);
		return horizontal ? angledWidth(text.width + unit.width, text.height + unit.height, axis.ang) : text.height;
	};
	const sign = ticks.length >= 2 ? Math.sign(ticks[1]!.coordinate - ticks[0]!.coordinate) : 1;
	const [x, y, width, height] = axis.vb;
	const bounds = sign === 1 ? { start: horizontal ? x : y, end: horizontal ? x + width : y + height } : { start: horizontal ? x + width : y + height, end: horizontal ? x : y };
	if (axis.iv === 'equidistantPreserveStart') return equidistant(sign, bounds, size, ticks, axis.gap);
	if (axis.iv === 'equidistantPreserveEnd') return equidistantEnd(sign, bounds, size, ticks, axis.gap);
	const all = axis.iv === 'preserveStart' || axis.iv === 'preserveStartEnd' ? ticksStart(sign, bounds, size, ticks, axis.gap, axis.iv === 'preserveStartEnd') : ticksEnd(sign, bounds, size, ticks, axis.gap);
	return all.filter((t) => t.isShow);
}

// CartesianAxis' getTickLineCoord: where a tick's line and text go.
function placeOf(axis: Axis, tick: Tick): { line: { x1: number; y1: number; x2: number; y2: number }; text: { x: number; y: number } } {
	const [x, y, width, height] = axis.box;
	const sign = axis.m ? -1 : 1;
	const at = tick.tickCoord ?? tick.coordinate;
	const c = tick.coordinate;
	switch (axis.o) {
		case 'top': {
			const y2 = y + +!axis.m * height;
			const y1 = y2 - sign * axis.ts;
			return { line: { x1: c, x2: c, y1, y2 }, text: { x: at, y: y1 - sign * axis.tm } };
		}
		case 'left': {
			const x2 = x + +!axis.m * width;
			const x1 = x2 - sign * axis.ts;
			return { line: { x1, x2, y1: c, y2: c }, text: { x: x1 - sign * axis.tm, y: at } };
		}
		case 'right': {
			const x2 = x + +!!axis.m * width;
			const x1 = x2 + sign * axis.ts;
			return { line: { x1, x2, y1: c, y2: c }, text: { x: x1 + sign * axis.tm, y: at } };
		}
		default: {
			const y2 = y + +!!axis.m * height;
			const y1 = y2 + sign * axis.ts;
			return { line: { x1: c, x2: c, y1, y2 }, text: { x: at, y: y1 + sign * axis.tm } };
		}
	}
}

const set = (el: Element, name: string, value: number | string) => {
	if (el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value));
};

/**
 * Draws the axis' ticks for `labels` (the formatter's text as this visitor's page shows it): the ones getTicks keeps,
 * text and line placed as CartesianAxis places them. `written` is each label as the page writes it into the text (the
 * capture's, which the clock part then writes for this visitor). Does nothing where the drawing is not recharts' own.
 */
export function drawTicks(svg: SVGSVGElement, axis: Axis, nth: number, labels: readonly string[], written: readonly string[] = labels): void {
	const group = svg.querySelectorAll(`g.recharts-${axis.t}-tick-labels`)[nth];
	const lines = svg.querySelectorAll(`g.recharts-${axis.t}-tick-lines`)[nth];
	const template = group?.querySelector(':scope > g.recharts-cartesian-axis-tick-label');
	const value = template?.querySelector('text.recharts-cartesian-axis-tick-value');
	if (!group || !template || !value || value.querySelectorAll('tspan').length !== 1) return;
	const style = getComputedStyle(value);
	const shown = chooseTicks(axis, labels, { fontSize: style.fontSize, letterSpacing: style.letterSpacing });
	const labelsNow = [...group.querySelectorAll(':scope > g.recharts-cartesian-axis-tick-label')];
	const linesNow = lines ? [...lines.querySelectorAll(':scope > g.recharts-cartesian-axis-tick')] : [];
	const lineTemplate = linesNow[0];
	shown.forEach((tick, i) => {
		const place = placeOf(axis, tick);
		const label = labelsNow[i] ?? group.appendChild(template.cloneNode(true) as Element);
		const text = label.querySelector('text.recharts-cartesian-axis-tick-value')!;
		const span = text.querySelector('tspan')!;
		set(text, 'x', place.text.x);
		set(text, 'y', place.text.y);
		set(span, 'x', place.text.x);
		// A fresh text node each time: the one there may hold the clock part's writing of another tick's date.
		span.textContent = `${written[tick.index] ?? ''}${axis.u ?? ''}`;
		if (!lines || !lineTemplate) return;
		const line = (linesNow[i] ?? lines.appendChild(lineTemplate.cloneNode(true) as Element)).querySelector('line');
		if (line) for (const [k, v] of Object.entries(place.line)) set(line, k, v);
	});
	for (const extra of labelsNow.slice(shown.length)) extra.remove();
	for (const extra of linesNow.slice(shown.length)) extra.remove();
}

interface Clock {
	rewrite(text: string, rules: readonly unknown[], now?: number, may?: 'long' | 'short'): string;
	monthNamesIn(text: string): 'long' | 'short' | undefined;
}

/**
 * Every drawing of the chart (each width and control state the old page drew it at) gets the ticks recharts shows for
 * the dates as this visitor reads them: the clock part writes the text, and its widths decide which ticks fit.
 */
export function relabel(wrapper: Element, rules: readonly unknown[], clock: Clock): void {
	for (const svg of wrapper.querySelectorAll<SVGSVGElement>(':scope > svg.recharts-surface')) {
		let axes: readonly (Axis | null)[] | undefined;
		try {
			axes = (JSON.parse(svg.getAttribute('data-mm-facts') ?? '{}') as { a?: (Axis | null)[] }).a;
		} catch {
			continue;
		}
		const seen = { xAxis: 0, yAxis: 0 };
		for (const axis of axes ?? []) {
			if (!axis) continue;
			const nth = seen[axis.t]++;
			const may = clock.monthNamesIn(axis.l.join('\n'));
			const local = axis.l.map((l) => clock.rewrite(l, rules, Date.now(), may));
			if (local.every((l, i) => l === axis.l[i])) continue;
			drawTicks(svg, axis, nth, local, axis.l);
		}
	}
}
