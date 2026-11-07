// Every picture of the page once each side has loaded all of them, judged: no browser here (judges-pure.test.ts).
import { HINTS } from './hints.ts';
import type { Box, Failure } from './types.ts';

/** One `<img>` once the page was scrolled through and its pictures had loaded. */
export interface Picture {
	/** The file it shows (its currentSrc), by path on the page's own origin. */
	readonly src: string;
	readonly naturalWidth: number;
	readonly naturalHeight: number;
	/** It finished and decoded nothing. */
	readonly broken: boolean;
	/** It was still loading when reading gave up. */
	readonly pending?: boolean;
	/** Its srcset lists widths, or a `<picture>` holds it: the browser picks the file. */
	readonly picks?: boolean;
	/** Where it is drawn, in page coordinates; absent when it is not drawn. */
	readonly box?: Box;
}

export interface MediaRow {
	readonly viewports: readonly {
		readonly viewport: string;
		/** The old page once, and again where it and the new page differ. */
		readonly olds: readonly (readonly Picture[])[];
		readonly next: readonly Picture[];
	}[];
}

const file = (src: string) => src.split('/').pop() || src;
const size = (p: Picture) => (p.broken ? 'broken' : p.pending ? 'still loading' : `${p.naturalWidth}x${p.naturalHeight}`);
const drawn = (b?: Box) => (b ? `${b.width}x${b.height}` : 'not drawn');
const near = (a?: Box, b?: Box) => (!a || !b ? a === b : Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2);

/** What one old picture and the new page's in its place differ in: the picture it decodes to, a broken picture on both, the size it is drawn at, and the file its srcset picks. */
function pictureFindings(o: Picture, n: Picture | undefined): { what: string; expected: string; actual: string; hint: string }[] {
	if (!n) return [{ what: '', expected: size(o), actual: '(absent)', hint: HINTS.image }];
	if (size(o) !== size(n)) return [{ what: '', expected: size(o), actual: size(n), hint: HINTS.image }];
	if (o.broken) return o.src ? [{ what: '', expected: 'an image that loads', actual: 'broken on both sides: the old page\'s source failed here as well', hint: HINTS.imageBrokenBoth }] : [];
	const out: { what: string; expected: string; actual: string; hint: string }[] = [];
	if (o.picks && o.src.startsWith('/') && n.src !== o.src) out.push({ what: ': the file its srcset picks', expected: file(o.src), actual: file(n.src), hint: HINTS.imageShown });
	if (!near(o.box, n.box)) out.push({ what: ': drawn size', expected: drawn(o.box), actual: drawn(n.box), hint: HINTS.imageShown });
	return out;
}

/** Red for each picture, at each width, that the new page shows otherwise than every old load: a file that fails or decodes to another size, one broken on both sides, one drawn at another size, or another file of its srcset. */
export function judgeMedia(route: string, row: MediaRow): Failure[] {
	const failures: Failure[] = [];
	for (const { viewport, olds, next } of row.viewports) {
		const [first, ...rest] = olds;
		if (!first) continue;
		first.forEach((o, i) => {
			const found = pictureFindings(o, next[i]);
			const steady = (f: { what: string; expected: string }) => rest.every((again) => pictureFindings(o, again[i]).every((g) => g.what !== f.what) || f.expected === 'an image that loads');
			for (const f of found.filter(steady)) failures.push({ route, dimension: 'assets', check: `image #${i + 1} ${o.src}${f.what} (every picture loaded)`, viewport, expected: f.expected, actual: f.actual, hint: f.hint });
		});
	}
	return failures;
}
