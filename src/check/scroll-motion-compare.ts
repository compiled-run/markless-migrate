// What moved with the scroll on each side, judged: no browser here (judges-pure.test.ts).
import { HINTS } from './hints.ts';
import type { Failure } from './types.ts';

/** One element, by its tag, the classes it loaded with and which of those it is, and what it showed at each position: `x,y,scale,opacity`. */
export interface ScrollTrack {
	readonly sig: string;
	readonly at: readonly string[];
}

export interface ScrollSample {
	/** `down 25%`, `up 50%`... in the order they were read; none when the page does not scroll. */
	readonly positions: readonly string[];
	readonly tracks: readonly ScrollTrack[];
}

export interface ScrollRow {
	readonly viewports: readonly {
		readonly viewport: string;
		/** The old page twice, from fresh loads: what varies between them is its own; the second and NEW only when the first moved anything. */
		readonly olds: readonly ScrollSample[];
		readonly next?: ScrollSample;
	}[];
}

const close = (a: string | undefined, b: string | undefined) => {
	if (a === undefined || b === undefined) return a === b;
	const [ax, ay, as, ao] = a.split(',').map(Number);
	const [bx, by, bs, bo] = b.split(',').map(Number);
	return Math.abs(ax! - bx!) <= 2 && Math.abs(ay! - by!) <= 2 && Math.abs(as! - bs!) <= 0.02 && Math.abs(ao! - bo!) <= 0.05;
};

/** Each element the old page moves with the scroll, at every position where its two loads agree, against the same element on the new page. */
export function judgeScroll(route: string, row: ScrollRow): Failure[] {
	const failures: Failure[] = [];
	for (const { viewport, olds, next } of row.viewports) {
		const [a, b] = olds;
		if (!a?.tracks.length || !b || !next) continue;
		const again = new Map(b.tracks.map((t) => [t.sig, t]));
		const theirs = new Map(next.tracks.map((t) => [t.sig, t]));
		for (const t of a.tracks) {
			const twice = again.get(t.sig);
			if (!twice) continue;
			const steady = t.at.map((v, k) => close(v, twice.at[k]));
			// An element whose own two loads disagree everywhere it moves is not scroll-linked: what it does is the motion checks'.
			if (new Set(t.at.filter((_, k) => steady[k])).size < 2) continue;
			const n = theirs.get(t.sig);
			const k = t.at.findIndex((v, i) => steady[i] && !close(v, n?.at[i]));
			if (k < 0) continue;
			const shown = (at: readonly string[]) => at.map((v, i) => `${a.positions[i]}: ${v}`).join(' | ');
			failures.push({
				route,
				dimension: 'motion',
				check: `scroll-linked motion of ${t.sig.replace(/#0$/, '').slice(0, 100)}`,
				viewport,
				expected: `scrolling ${a.positions[k]}: x,y,scale,opacity ${t.at[k]} (${shown(t.at)})`,
				actual: n ? `${n.at[k]} (${shown(n.at)})` : 'no such element (by its tag and the classes it loaded with) on the new page',
				hint: HINTS.motionScrollLinked,
			});
		}
	}
	return failures;
}
