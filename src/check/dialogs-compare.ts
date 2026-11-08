// Each dialog's box once open and its opening and closing on each side, judged: no browser here (judges-pure.test.ts).
import { HINTS } from './hints.ts';
import type { RecordedJourney } from './journeys.ts';
import type { Box, Failure, Viewport } from './types.ts';

const MAX_DIALOGS = 4;

/** The dialog on screen at one frame: its box (`x,y,width,height`, in the viewport) and opacity, or none. */
export interface DialogFrame {
	readonly t: number;
	readonly box?: string;
	readonly opacity?: number;
}

export interface DialogRun {
	readonly failed?: string;
	/** Frames from the step that opens it, each kept only where it changed. */
	readonly enter: readonly DialogFrame[];
	/** Frames from the Escape that closes it. */
	readonly exit: readonly DialogFrame[];
}

export interface DialogsRow {
	readonly viewports: readonly { readonly viewport: string; readonly width: number; readonly height: number; readonly dialogs: readonly { readonly journey: string; readonly olds: readonly DialogRun[]; readonly next: DialogRun }[] }[];
}

/** Journeys whose last step opens a dialog and stays on the page, the first few. */
export function dialogJourneys(journeys: readonly RecordedJourney[]): RecordedJourney[] {
	const opens = (j: RecordedJourney) => {
		const last = j.expected[j.steps.length - 1];
		return Boolean(last && !last.failed && !last.navigated && last.added.some((l) => /^- (dialog|alertdialog)\b/.test(l.trim())));
	};
	return journeys.filter((j) => !j.destructive && !j.start && opens(j)).slice(0, MAX_DIALOGS);
}

const parse = (box: string): Box => {
	const [x, y, width, height] = box.split(',').map(Number);
	return { x: x!, y: y!, width: width!, height: height! };
};

/** The box the dialog settled at once open: the last frame of the opening that showed one. */
const opened = (run: DialogRun) => run.enter.findLast((f) => f.box)?.box;

/** How long a dialog's opening or closing moved: from its first frame on screen to its last change, when it took at least three frames; 0 when it appeared or went at once. */
export function moving(frames: readonly DialogFrame[], leaving: boolean): number {
	const seen = frames.filter((f) => f.box);
	if (leaving) {
		const gone = frames.findIndex((f, i) => i > 0 && !f.box);
		const until = gone < 0 ? frames : frames.slice(0, gone + 1);
		return until.length >= 4 ? until.at(-1)!.t - until[1]!.t : 0;
	}
	return seen.length >= 3 ? seen.at(-1)!.t - seen[0]!.t : 0;
}

const MOTION_SLACK_MS = 60;
const MOTION_SLACK_RATIO = 0.3;

type Finding = Pick<Failure, 'check' | 'expected' | 'actual' | 'hint'>;

/** What differs between one old run and the new one, at this width: the dialog not opening, its box once open, and its opening and closing motion. */
export function dialogFindings(viewport: Pick<Viewport, 'width' | 'height'>, old: DialogRun, also: readonly DialogRun[], next: DialogRun): Finding[] {
	const box = opened(old);
	if (old.failed || !box || also.some((o) => o.failed || !opened(o))) return [];
	if (next.failed || !opened(next)) return [{ check: 'opens', expected: `a dialog at ${box}`, actual: next.failed ?? 'no dialog opens', hint: HINTS.behaviour }];
	const out: Finding[] = [];
	const a = parse(box);
	const n = parse(opened(next)!);
	const slack = (side: number) => Math.max(4, side * 0.02);
	const off = (p: Box, q: Box) => Math.abs(p.x - q.x) > slack(viewport.width) || Math.abs(p.y - q.y) > slack(viewport.height) || Math.abs(p.width - q.width) > slack(viewport.width) || Math.abs(p.height - q.height) > slack(viewport.height);
	const describe = (b: Box) => `${b.width}x${b.height} at (${b.x}, ${b.y}) in the ${viewport.width}x${viewport.height} viewport (${Math.round((b.width / viewport.width) * 100)}% of its width, ${Math.round((b.height / viewport.height) * 100)}% of its height)`;
	if (off(a, n) && also.every((o) => !off(a, parse(opened(o)!)))) out.push({ check: 'box once open', expected: describe(a), actual: describe(n), hint: HINTS.dialogBox });
	for (const [what, leaving] of [['opening', false], ['closing', true]] as const) {
		const frames = (r: DialogRun) => (leaving ? r.exit : r.enter);
		const theirs = moving(frames(old), leaving);
		const runs = [theirs, ...also.map((o) => moving(frames(o), leaving))];
		const mine = moving(frames(next), leaving);
		const differs = (o: number) => (o > 0) !== (mine > 0) || Math.abs(o - mine) > Math.max(MOTION_SLACK_MS, o * MOTION_SLACK_RATIO);
		if (runs.every(differs)) out.push({ check: what, expected: theirs ? `moves for ${theirs} ms` : 'at once', actual: mine ? `moves for ${mine} ms` : 'at once', hint: HINTS.dialogMotion });
	}
	return out;
}

/** Red where the new page's dialog does not open, sits elsewhere or at another size once open, or opens or closes otherwise than every old run. */
export function judgeDialogs(route: string, row: DialogsRow): Failure[] {
	return row.viewports.flatMap((v) => v.dialogs.flatMap((d) => {
		const [first, ...rest] = d.olds;
		if (!first) return [];
		return dialogFindings(v, first, rest, d.next).map((f): Failure => ({ route, dimension: f.check === 'box once open' || f.check === 'opens' ? 'behaviour' : 'motion', check: `${d.journey}: the dialog, ${f.check}`, viewport: v.viewport, expected: f.expected, actual: f.actual, hint: f.hint }));
	}));
}
