// A cubic whose control points lie on its chord draws a straight line wherever on the chord they sit; rough.js (Mermaid's shapes) places them at random.
const NEAR = 0.5;

type Segment = { readonly op: 'M' | 'L' | 'Z'; readonly to: readonly number[] } | { readonly op: 'C'; readonly to: readonly number[] };

function parse(d: string): Segment[] | undefined {
	const body = /^path\("(.*)"\)$/.exec(d.trim())?.[1] ?? d;
	const tokens = body.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
	if (!tokens) return undefined;
	const out: Segment[] = [];
	let at = [0, 0];
	let start = [0, 0];
	for (let i = 0; i < tokens.length; ) {
		const op = tokens[i++]!;
		const take = (n: number) => {
			const nums = tokens.slice(i, i + n).map(Number);
			if (nums.length !== n || nums.some((v) => !Number.isFinite(v))) throw new Error('short');
			i += n;
			return nums;
		};
		if (op === 'M' || op === 'L') {
			const [x, y] = take(2);
			out.push({ op, to: [x!, y!] });
			at = [x!, y!];
			if (op === 'M') start = at;
		} else if (op === 'C') {
			const c = take(6);
			out.push({ op, to: c });
			at = [c[4]!, c[5]!];
		} else if (op === 'Z' || op === 'z') {
			out.push({ op: 'Z', to: [] });
			at = start;
		} else return undefined;
	}
	return out;
}

function onChord(x0: number, y0: number, x1: number, y1: number, px: number, py: number): boolean {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const length = Math.hypot(dx, dy);
	if (length < NEAR) return Math.hypot(px - x0, py - y0) <= NEAR;
	const t = ((px - x0) * dx + (py - y0) * dy) / (length * length);
	const off = Math.abs((px - x0) * dy - (py - y0) * dx) / length;
	return off <= NEAR && t >= -NEAR / length && t <= 1 + NEAR / length;
}

function drawn(d: string): Segment[] | undefined {
	let segments: Segment[] | undefined;
	try {
		segments = parse(d);
	} catch {
		return undefined;
	}
	if (!segments) return undefined;
	let at = [0, 0];
	return segments.map((s) => {
		const from = at;
		if (s.op !== 'Z') at = s.op === 'C' ? [s.to[4]!, s.to[5]!] : [...s.to];
		if (s.op !== 'C') return s;
		const [c1x, c1y, c2x, c2y, x, y] = s.to as [number, number, number, number, number, number];
		return onChord(from[0]!, from[1]!, x, y, c1x, c1y) && onChord(from[0]!, from[1]!, x, y, c2x, c2y) ? { op: 'L', to: [x, y] } : s;
	});
}

/** Whether two SVG path values (a computed `d`) draw the same shape: equal, or equal once every cubic whose control points sit on its chord is the straight line it draws. */
export function samePath(a: string, b: string): boolean {
	if (a === b) return true;
	const [pa, pb] = [drawn(a), drawn(b)];
	if (!pa || !pb || pa.length !== pb.length) return false;
	return pa.every((s, i) => {
		const t = pb[i]!;
		return s.op === t.op && s.to.length === t.to.length && s.to.every((v, k) => Math.abs(v - t.to[k]!) <= NEAR);
	});
}
