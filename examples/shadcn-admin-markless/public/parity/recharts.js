// Parity port of recharts, the half that runs in the browser: the data (Math.random at load, as the old modules
// drew it, analytics first in the old app's import order) and the layout of the charts the page rendered
// (lib/parity/recharts/charts.tsrx). It only sets attributes and text: Markless 0.4.0 runs no attach= at load,
// and it resumes by counting elements in document order, so this script never adds or removes one.
(() => {
	const MARGIN = 5;
	const Y_AXIS_WIDTH = 60;
	const X_AXIS_HEIGHT = 30;
	const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	// Before the chart modules load, the old page draws 171 numbers on the dashboard (React, the router, Radix ids and the
	// sidebar's skeleton widths, measured on desktop and phone); drawing as many first keeps a seeded run comparable.
	for (let i = 0; i < 171; i++) Math.random();
	const analytics = days.map((name) => ({ name, clicks: Math.floor(Math.random() * 900) + 100, uniques: Math.floor(Math.random() * 700) + 80 }));
	const overview = months.map((name) => ({ name, total: Math.floor(Math.random() * 5000) + 1000 }));

	const set = (node, attrs) => {
		if (node) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
	};
	const round = (n) => Math.round(n * 10000) / 10000;

	// recharts-scale's getNiceTickValues for a [0, max] domain and five ticks.
	function niceTicks(max, count = 5) {
		const rough = max / (count - 1);
		for (let correction = 0; correction < 20; correction++) {
			const digits = Math.floor(Math.log10(rough)) + 1;
			const unit = 10 ** digits;
			const scale = digits !== 1 ? 0.05 : 0.1;
			const step = (Math.ceil(rough / unit / scale) + correction) * scale * unit;
			if (step * (count - 1) >= max) return Array.from({ length: count }, (_, i) => Math.round(step * i * 1e6) / 1e6);
		}
		return [0, max];
	}

	function frame(container, height) {
		const width = Math.floor(container.getBoundingClientRect().width);
		if (!width) return undefined;
		const wrapper = container.querySelector('.recharts-wrapper');
		const svg = container.querySelector('svg.recharts-surface');
		set(wrapper, { width, height, style: `position: relative; cursor: default; width: ${width}px; height: ${height}px;` });
		set(svg, { width, height, viewBox: `0 0 ${width} ${height}` });
		const plot = { x: MARGIN + Y_AXIS_WIDTH, y: MARGIN, w: width - 2 * MARGIN - Y_AXIS_WIDTH, h: height - 2 * MARGIN - X_AXIS_HEIGHT };
		set(svg.querySelector('defs > clipPath > rect'), { x: plot.x, y: plot.y, height: plot.h, width: plot.w });
		return plot;
	}

	const canvas = document.createElement('canvas').getContext('2d');
	const textWidth = (node) => {
		const style = getComputedStyle(node);
		canvas.font = `${style.fontWeight} 12px ${style.fontFamily}`;
		return canvas.measureText(node.firstElementChild?.dataset.label ?? node.textContent ?? '').width;
	};

	// The x axis's default interval, preserveEnd: walking back from the last tick, a label that would overlap
	// the one after it (with minTickGap 5) is not drawn.
	function preserveEnd(texts, centers, start, end) {
		const shown = new Array(texts.length).fill(false);
		const coords = [...centers];
		let limit = end;
		for (let i = texts.length - 1; i >= 0; i--) {
			const size = textWidth(texts[i]);
			if (i === texts.length - 1 && coords[i] + size / 2 > limit) coords[i] = limit - size / 2;
			if (coords[i] - size / 2 >= start && coords[i] + size / 2 <= limit) {
				shown[i] = true;
				limit = coords[i] - size / 2 - 5;
			}
		}
		return { shown, coords };
	}

	function axes(container, plot, centers, ticks, format) {
		const top = ticks[ticks.length - 1];
		const texts = [...container.querySelectorAll('.recharts-xAxis-tick-labels text')];
		// Tick labels may reach the chart's own edges, not just the plot area's (the area chart's Mon sits on the plot's left edge).
		const { shown, coords } = preserveEnd(texts, centers, plot.x - Y_AXIS_WIDTH - MARGIN, plot.x + plot.w + MARGIN);
		texts.forEach((text, i) => {
			set(text, { width: plot.w, x: coords[i], y: plot.y + plot.h + 8 });
			set(text.firstElementChild, { x: coords[i] });
			// recharts does not render a tick label it skips; the element stays (resume counts elements), its text goes.
			const tspan = text.firstElementChild;
			if (tspan.dataset.label === undefined) tspan.dataset.label = tspan.textContent;
			tspan.textContent = shown[i] ? tspan.dataset.label : '';
		});
		container.querySelectorAll('.recharts-yAxis-tick-labels text').forEach((text, i) => {
			const y = plot.y + plot.h * (1 - ticks[i] / top);
			set(text, { height: plot.h, x: plot.x - 8, y });
			set(text.firstElementChild, { x: plot.x - 8 });
			text.firstElementChild.textContent = format(ticks[i]);
		});
	}

	function barChart(container) {
		const plot = frame(container, 350);
		if (!plot) return false;
		const ticks = niceTicks(Math.max(...overview.map((d) => d.total)));
		const top = ticks[ticks.length - 1];
		const band = plot.w / overview.length;
		const size = Math.floor(band * 0.8);
		const r = 4;
		container.querySelectorAll('path.recharts-rectangle').forEach((path, i) => {
			const h = (plot.h * overview[i].total) / top;
			const x = round(plot.x + band * i + band * 0.1);
			const y = round(plot.y + plot.h - h);
			const base = plot.y + plot.h;
			set(path, { x, y, width: size, height: round(h), d: `M${x},${round(y + r)}A ${r},${r},0,0,1,${round(x + r)},${y}L ${round(x + size - r)},${y}A ${r},${r},0,0,1,\n        ${round(x + size)},${round(y + r)}L ${round(x + size)},${base}L ${x},${base}Z` });
		});
		axes(container, plot, overview.map((_, i) => plot.x + band * (i + 0.5)), ticks, (t) => `$${t}`);
		return true;
	}

	// d3-shape's curveMonotoneX, the curve recharts draws for type="monotone".
	function monotone(points) {
		const n = points.length;
		const sign = (v) => (v < 0 ? -1 : 1);
		const t = new Array(n);
		for (let i = 1; i < n - 1; i++) {
			const h0 = points[i][0] - points[i - 1][0];
			const h1 = points[i + 1][0] - points[i][0];
			const s0 = (points[i][1] - points[i - 1][1]) / h0;
			const s1 = (points[i + 1][1] - points[i][1]) / h1;
			const p = (s0 * h1 + s1 * h0) / (h0 + h1);
			t[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
		}
		const slope = (i) => (points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]);
		t[0] = (3 * slope(0) - t[1]) / 2;
		t[n - 1] = (3 * slope(n - 2) - t[n - 2]) / 2;
		const f = (v) => String(Math.round(v * 1000) / 1000);
		let d = `M${f(points[0][0])},${f(points[0][1])}`;
		for (let i = 0; i < n - 1; i++) {
			const dx = (points[i + 1][0] - points[i][0]) / 3;
			d += `C${f(points[i][0] + dx)},${f(points[i][1] + dx * t[i])},${f(points[i + 1][0] - dx)},${f(points[i + 1][1] - dx * t[i + 1])},${f(points[i + 1][0])},${f(points[i + 1][1])}`;
		}
		return d;
	}

	function areaChart(container) {
		const plot = frame(container, 300);
		if (!plot) return false;
		const ticks = niceTicks(Math.max(...analytics.flatMap((d) => [d.clicks, d.uniques])));
		const top = ticks[ticks.length - 1];
		const step = plot.w / (analytics.length - 1);
		const base = plot.y + plot.h;
		container.querySelectorAll('.recharts-area').forEach((group, k) => {
			const key = k === 0 ? 'clicks' : 'uniques';
			const pts = analytics.map((d, i) => [plot.x + step * i, plot.y + plot.h * (1 - d[key] / top)]);
			const line = monotone(pts);
			set(group.querySelector('clipPath rect'), { x: plot.x, width: plot.w + 1, height: base + 1 });
			set(group.querySelector('.recharts-area-area'), { width: plot.w, d: `${line}L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z` });
			set(group.querySelector('.recharts-area-curve'), { width: plot.w, d: line });
		});
		axes(container, plot, analytics.map((_, i) => plot.x + step * i), ticks, String);
		return true;
	}

	// recharts measures label widths in a span it leaves at the end of <body>, holding the last label it measured.
	function measurementSpan(text) {
		let span = document.getElementById('recharts_measurement_span');
		if (!span) {
			span = document.createElement('span');
			span.id = 'recharts_measurement_span';
			span.setAttribute('aria-hidden', 'true');
			span.setAttribute('style', 'position: absolute; top: -20000px; left: 0px; padding: 0px; margin: 0px; border-width: medium; border-style: none; border-color: currentcolor; border-image: none; white-space: pre; font-size: 12px; letter-spacing: normal;');
			document.body.append(span);
		}
		span.textContent = text;
	}

	const draw = { overview: barChart, analytics: areaChart };
	const drawn = new WeakMap();
	const drawAll = () => {
		for (const container of document.querySelectorAll('[data-parity-chart]')) {
			const width = Math.floor(container.getBoundingClientRect().width);
			if (!width || drawn.get(container) === width) continue;
			if (draw[container.dataset.parityChart]?.(container)) drawn.set(container, width);
		}
	};
	drawAll();
	measurementSpan('$0');
	// ResponsiveContainer lays out again at a new width; a tab that shows a chart for the first time lays it out then.
	const resized = new ResizeObserver(drawAll);
	resized.observe(document.body);
	for (const container of document.querySelectorAll('[data-parity-chart]')) resized.observe(container);
	new MutationObserver(drawAll).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
})();
