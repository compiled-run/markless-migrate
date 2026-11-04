// The forced states judged from the original's dataset: the old half (both old pages in each state, their shots and the
// cascade behind what changed) is a stored row, the new half is observed; the judge reads them as one live row.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { explanationOf, joinState, judgeStates, judgeStateViewport, newSkip, type CascadeAnswers, type ForcedStatesRow, type OldStateRun, type StateRun, type StatesViewportRow } from '../src/check/states-compare.ts';
import type { CssRule, CssState } from '../src/check/stylesheet.ts';
import type { ElementSnapshot, PageCapture, RouteCapture, RouteResult, Viewport } from '../src/check/types.ts';

const viewport: Viewport = { name: 'desktop', width: 1280, height: 800, isMobile: false };

const el = (id: number, name: string, style: Record<string, string>, y = 0): ElementSnapshot => ({ id, role: 'button', name, tag: 'button', text: name, path: `button "${name}"`, chain: `html:1>body:1>button:${id % 10}`, box: { x: 10, y: 10 + y, width: 80, height: 30 }, style });

function png(width: number, height: number, shade: number): Buffer {
	const image = new PNG({ width, height });
	image.data.fill(shade);
	for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
	return PNG.sync.write(image);
}

const rules: CssRule[] = [
	{ selector: 'button', file: '/app.css', line: 1, column: 1, order: 0, specificity: [0, 0, 1], conditions: [], declarations: [{ property: 'color', value: 'red', important: false }] },
	{ selector: 'button.save:hover', file: '/app.css', line: 2, column: 1, order: 1, specificity: [0, 2, 1], conditions: [], declarations: [{ property: 'color', value: 'green', important: false }] },
];
const hover: CssState = { kind: 'pseudo', pseudo: 'hover', target: 'button.save', label: ':hover on button.save' };

const base1 = [el(1, 'Save', { color: 'red', padding: '4px' }), el(2, 'Cancel', { color: 'blue', padding: '4px' }, 40)];
const s1 = [el(1, 'Save', { color: 'green', padding: '4px' }), el(2, 'Cancel', { color: 'blue', padding: '4px' }, 40)];
const s2 = [el(1, 'Save', { color: 'green', padding: '4px' }), el(2, 'Cancel', { color: 'blue', padding: '4px' }, 40)];
const baseN = [el(11, 'Save', { color: 'red', padding: '4px' }), el(12, 'Cancel', { color: 'blue', padding: '4px' }, 40)];
const sn = [el(11, 'Save', { color: 'yellow', padding: '4px' }), el(12, 'Cancel', { color: 'blue', padding: '4px' }, 40)];
const answers: CascadeAnswers = { color: { rule: 1, value: 'green' } };
const [oldShot, newShot] = [png(96, 46, 40), png(96, 46, 200)];

/** What a live run reads in the state: both old pages and the new one, the old page's cascade for the differing element. */
const live: StateRun = { label: hover.label, kind: hover.kind, targets: [0], s1, s2, sn, explanations: [explanationOf(rules, answers, ['color'])], images: [[], [], []], shots: [oldShot, oldShot, newShot] };
const stored: Extract<OldStateRun, { s1: unknown }> = { label: hover.label, kind: hover.kind, state: hover, targets: [0], containers: [], s1, s2, answers: new Map([[1, answers]]), images: [[], []], shots: [oldShot, oldShot] };
const row = (states: readonly OldStateRun[], noise: ForcedStatesRow['noise'] = []): ForcedStatesRow => ({ viewport: 'desktop', sources: 'x', base1, noise, states });
const verdict = (seen: StatesViewportRow) => judgeStateViewport('/', viewport, seen, [], seen.noise ?? []).failures.map((f) => `${f.check} | ${f.expected} | ${f.actual} | ${f.hint}`);

test('a state judged from the stored old half and the new page gives the verdict of the same live row', async () => {
	let clipped: unknown;
	const joined = await joinState(rules, row([stored]), stored, baseN, sn, async (clip) => ((clipped = clip), { images: [], shot: newShot }));
	assert.deepEqual(joined, live);
	assert.ok(clipped, "the new page is shot around the state's target, as the old pages were");
	const liveRow: StatesViewportRow = { viewport: 'desktop', explained: [], base1, baseN, states: [live] };
	const storedRow: StatesViewportRow = { ...liveRow, states: [joined], noise: [] };
	const found = verdict(storedRow);
	assert.deepEqual(found, verdict(liveRow));
	assert.ok(found.some((f) => f.startsWith('computed style in :hover on button.save') && f.includes('color: green') && f.includes('`button.save:hover`')), found.join('\n'));
	assert.ok(found.some((f) => f.startsWith('screenshot in :hover on button.save')), found.join('\n'));
});

test("the old side's noise comes from the stored row, not from loads taken elsewhere", () => {
	const result = { route: '/', ok: true, dimensions: {}, failures: [], weight: { old: { downloaded: 0, source: 0, executed: 0 }, new: { downloaded: 0, source: 0, executed: 0 } }, visualDiffs: [], shots: [] } as unknown as RouteResult;
	// The check's loads agree with each other: on their own, they mask nothing.
	const page = { elements: base1 } as unknown as PageCapture;
	const olds = [0, 1, 2].map(() => ({ origin: 'http://old', http: { status: 200, chain: [] }, pages: { desktop: page } }) as unknown as RouteCapture);
	const plan = [{ viewport, explain: [], forced: [hover] }];
	const seen: StatesViewportRow = { viewport: 'desktop', explained: [], base1, baseN, states: [live] };
	const styles = (r: RouteResult) => r.failures.filter((f) => f.check.startsWith('computed style')).length;
	assert.equal(styles(judgeStates('/', result, plan, olds, [viewport], { viewports: [seen] })), 1);
	assert.equal(styles(judgeStates('/', result, plan, olds, [viewport], { viewports: [{ ...seen, noise: [{ element: base1[0]!, props: new Set(['color']) }] }] })), 0, "a property the dataset's loads varied in is masked");
});

test('a quiet stored state is shot on the new page as on the old ones, judged unshot, and skipped when the new page has none of its targets', async () => {
	const quiet: typeof stored = { ...stored, s1: base1, s2: base1, answers: new Map() };
	let clipped: unknown;
	const same = await joinState(rules, row([quiet]), quiet, baseN, baseN, async (clip) => ((clipped = clip), { images: [], shot: newShot }));
	assert.deepEqual(clipped, { x: 10, y: 10, width: 80, height: 30 }, "the old pages' clip: the state's target");
	assert.equal('shots' in same, false, 'nothing differs, so the judge has no shot to compare');
	assert.equal(newSkip(stored, new Map()), `${hover.label}: no visible element on the page matches it on both sides`);
	assert.equal(newSkip(stored, new Map([[0, 0]])), undefined);
});

test('a stored state the new page differs in, with no old shots kept, is an error, never a pass', async () => {
	const { images: _i, shots: _s, ...unshot } = stored;
	await assert.rejects(joinState(rules, row([unshot]), unshot, baseN, sn, async () => ({ images: [], shot: newShot })), /hold no screenshots/);
});
