import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareMotion, motionCycles, motionDismissals, motionJourneys, motionRules, pinnedMoments, sameEasing, type MotionCapture, type MotionRecord, type PinnedElement, type PinnedFrame } from '../src/check/motion.ts';
import type { RecordedJourney, StepResult } from '../src/check/journeys.ts';
import type { ElementSnapshot } from '../src/check/types.ts';

const el = (id: number, path = 'complementary>navigation>list/ul'): ElementSnapshot => ({ id, role: 'list', name: '', tag: 'ul', text: '', path, box: { x: 0, y: 100, width: 240, height: 96 }, style: {} });
const height = (element: ElementSnapshot, over: Partial<MotionRecord> = {}): MotionRecord => ({ kind: 'transition', name: 'height', properties: ['height'], from: '96px', to: '0px', duration: 250, delay: 0, easing: 'ease-in-out', iterations: 1, element, ...over });
const capture = (motions: MotionRecord[], elements: ElementSnapshot[]): MotionCapture => ({ interaction: 'click', motions, elements });

test('an animation the old page runs and the new one does not is named with its property, values, duration and easing', () => {
	const [o, n] = [el(1), el(7)];
	const [failure] = compareMotion('/docs', 'click button "Getting Started"', 'desktop', [capture([height(o)], [o])], capture([], [n]));
	assert.equal(failure?.dimension, 'motion');
	assert.equal(failure?.check, 'click button "Getting Started": motion of list (complementary>navigation>list/ul)');
	assert.equal(failure?.expected, 'old animates height 96px→0px over 250 ms ease-in-out');
	assert.equal(failure?.actual, 'new jumps: list (complementary>navigation>list/ul) has no transition or animation of height');
});

test('identical motion, and timing within 20 ms or 10%, is green; a longer duration or another easing is red', () => {
	const [o, n] = [el(1), el(2)];
	assert.deepEqual(compareMotion('/', 'x', 'desktop', [capture([height(o)], [o])], capture([height(n, { duration: 265 })], [n])), []);
	assert.deepEqual(compareMotion('/', 'x', 'desktop', [capture([height(o)], [o])], capture([height(n, { easing: 'cubic-bezier(0.42, 0, 0.58, 1)' })], [n])), [], 'a keyword and its cubic-bezier are one easing');
	const [slow] = compareMotion('/', 'x', 'desktop', [capture([height(o)], [o])], capture([height(n, { duration: 400, easing: 'linear' })], [n]));
	assert.equal(slow?.check, 'x: motion timing of list (complementary>navigation>list/ul)');
	assert.equal(slow?.actual, 'new height 96px→0px over 400 ms linear');
});

test('an animation only the new page runs is red, and a difference one OLD run did not show is not held against NEW', () => {
	const [o, n] = [el(1), el(2)];
	const fade: MotionRecord = { kind: 'animation', name: 'fadeIn_x1', properties: ['opacity'], duration: 300, delay: 0, easing: 'ease', iterations: 1, element: n };
	const [extra] = compareMotion('/', 'x', 'desktop', [capture([], [o])], capture([fade], [n]));
	assert.equal(extra?.expected, 'old does not animate opacity');
	assert.equal(extra?.actual, 'new animates animation fadeIn_x1 (opacity) over 300 ms ease');
	assert.deepEqual(compareMotion('/', 'x', 'desktop', [capture([], [o]), capture([{ ...fade, element: o }], [o])], capture([fade], [n])), []);
});

test('a sound the old page plays on an interaction and the new one does not is red', () => {
	const [o, n] = [el(1), el(2)];
	const [failure] = compareMotion('/', 'click button "Send"', 'desktop', [capture([{ kind: 'media', name: 'sent.mp3', properties: ['audio'], duration: 400, delay: 0, easing: '', iterations: 1, element: o }], [o])], capture([], [n]));
	assert.equal(failure?.check, 'click button "Send": sound of list (complementary>navigation>list/ul)');
	assert.equal(failure?.expected, 'old plays audio sent.mp3');
	assert.equal(failure?.actual, 'new plays nothing (audio)');
});

test('the same motion missing on many elements (every link when the theme changes) is one failure', () => {
	const link = (id: number, name: string): ElementSnapshot => ({ ...el(id, 'main>link/a'), role: 'link', name, tag: 'a' });
	const color = (element: ElementSnapshot, from: string): MotionRecord => ({ kind: 'transition', name: 'color', properties: ['color'], from, to: 'rgb(46, 133, 85)', duration: 200, delay: 0, easing: 'ease', iterations: 1, element });
	const old = [link(1, 'Docs'), link(2, 'Blog'), link(3, 'Help')];
	const next = [link(11, 'Docs'), link(12, 'Blog'), link(13, 'Help')];
	const failures = compareMotion('/', 'click button "Theme"', 'desktop', [capture(old.map((l, i) => color(l, `rgb(${i}, 0, 0)`)), old)], capture([], next));
	assert.equal(failures.length, 1);
	assert.equal(failures[0]!.check, 'click button "Theme": motion of link "Docs" (main>link/a) and 2 more elements alike');
});

test('two transitions on one element and one keyframe animation of the same properties and timing are the same motion', () => {
	const [o, n] = [el(1), el(2)];
	const t = (p: string): MotionRecord => ({ kind: 'transition', name: p, properties: [p], duration: 150, delay: 0, easing: 'cubic-bezier(0, 0, 0.2, 1)', iterations: 1, element: o });
	const enter: MotionRecord = { kind: 'animation', name: 'enter-left', properties: ['opacity', 'transform'], duration: 150, delay: 0, easing: 'cubic-bezier(0, 0, 0.2, 1)', iterations: 1, element: n };
	assert.deepEqual(compareMotion('/', 'x', 'desktop', [capture([t('opacity'), t('transform')], [o])], capture([enter], [n])), []);
	const [half] = compareMotion('/', 'x', 'desktop', [capture([t('opacity'), t('transform')], [o])], capture([{ ...enter, properties: ['opacity'] }], [n]));
	assert.equal(half?.actual, 'new jumps: list (complementary>navigation>list/ul) has no transition or animation of transform');
});

test('the same motion on the wrapper of the element that moved on the old page is the same motion', () => {
	const panel = (id: number, chain: string): ElementSnapshot => ({ ...el(id, 'body/div'), role: 'generic', tag: 'div', chain });
	const fade = (element: ElementSnapshot): MotionRecord => ({ kind: 'transition', name: 'opacity', properties: ['opacity'], duration: 150, delay: 0, easing: 'ease', iterations: 1, element });
	const [o, n, wrapper] = [panel(1, 'html:1>body:1>div:2>div:1'), panel(2, 'html:1>body:1>div:2>div:1'), panel(3, 'html:1>body:1>div:2')];
	assert.deepEqual(compareMotion('/', 'x', 'desktop', [capture([fade(o)], [o])], capture([fade(wrapper)], [wrapper, n])), []);
});

test('with every animation held at the same moments, an element shown on one side and hidden on the other is red at that moment, naming the animation that just ended', () => {
	const [o, n] = [el(1, 'body/div'), el(2, 'body/div')];
	const exit = (element: ElementSnapshot): MotionRecord => ({ kind: 'animation', name: 'exit', properties: ['opacity'], from: '1', to: '0', duration: 150, delay: 0, easing: 'ease', iterations: 1, element });
	const at = (element: ElementSnapshot, opacity: number, shown = true, box = element.box): PinnedElement => ({ element, shown, opacity, box });
	const frames = (element: ElementSnapshot, after: PinnedElement): PinnedFrame[] => [
		{ t: 0, elements: [at(element, 1)] },
		{ t: 75, elements: [at(element, 0.42)] },
		{ t: 149, note: 'the last frame of animation exit of div', elements: [at(element, 0)] },
		{ t: 150, note: 'just after animation exit of div ends', elements: [after] },
	];
	const pinned = (c: MotionCapture, p: PinnedFrame[]): MotionCapture => ({ ...c, pinned: p });
	const old = pinned(capture([exit(o)], [o]), frames(o, at(o, 1, false)));
	const [failure, ...rest] = compareMotion('/', 'close', 'desktop', [old], pinned(capture([exit(n)], [n]), frames(n, at(n, 1))));
	assert.equal(rest.length, 0);
	assert.equal(failure?.check, 'close: frame of list (body/div)');
	assert.equal(failure?.expected, 'old at 150 ms, just after animation exit of div ends: not shown');
	assert.equal(failure?.actual, 'new: shown at opacity 1');
	assert.match(failure!.hint, /its own animationend/);
	assert.deepEqual(compareMotion('/', 'close', 'desktop', [old], pinned(capture([exit(n)], [n]), frames(n, at(n, 0)))), [], 'transparent counts as not shown');
	const moved = frames(n, at(n, 1, false)).map((f) => (f.t === 75 ? { ...f, elements: [at(n, 0.45, true, { ...n.box, y: n.box.y + 12 })] } : f));
	const [shifted] = compareMotion('/', 'close', 'desktop', [old], pinned(capture([exit(n)], [n]), moved));
	assert.equal(shifted?.expected, 'old at 75 ms: shown at opacity 0.42, 240x96 at (0, 100)');
	assert.equal(shifted?.actual, 'new: shown at opacity 0.45, 240x96 at (0, 112)');
});

test('the held moments are a quarter, half and three quarters into the longest animation, and the last frame and the frame after the end of each', () => {
	assert.deepEqual(pinnedMoments(200, [{ end: 150, note: 'animation exit of div' }, { end: 200, note: 'animation exit of div #2' }]), [
		{ t: 0 },
		{ t: 50 },
		{ t: 100 },
		{ t: 149, note: 'the last frame of animation exit of div' },
		{ t: 150, note: 'just after animation exit of div ends' },
		{ t: 199, note: 'the last frame of animation exit of div #2' },
		{ t: 200, note: 'just after animation exit of div #2 ends' },
	]);
	assert.deepEqual(pinnedMoments(0, []), []);
});

test('each opener of a dialog, menu or popup is dismissed with Escape once per alike opener, so the exit is recorded whatever the interaction cap leaves out', () => {
	const step = (over: Partial<StepResult> = {}): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, ...over });
	const journey = (name: string, nth: number, added: string[], action: 'click' | 'press' = 'click'): RecordedJourney => ({ name, steps: [action === 'click' ? { action, target: { role: 'button', name, nth } } : { action, key: 'Enter', target: { role: 'button', name, nth } }], expected: [step({ added })] });
	const found = motionDismissals([
		journey('Add User', 0, ['- dialog "Add New User":', '- heading "Add New User" [level=2]']),
		journey('Add User', 0, ['- dialog "Add New User":'], 'press'),
		journey('Open menu', 0, ['- menu "Open menu":']),
		journey('Open menu', 1, ['- menu "Open menu":']),
		journey('Select row', 0, ['- checkbox "Select row" [checked]']),
	]);
	assert.deepEqual(found.map((j) => j.name), ['Add User, then press Escape', 'Open menu, then press Escape']);
});

test('easings compare by value', () => {
	assert.ok(sameEasing('ease', 'cubic-bezier(0.25, 0.1, 0.25, 1)'));
	assert.ok(sameEasing('cubic-bezier(0.08,0.52,0.52,1)', 'cubic-bezier(0.08, 0.52, 0.52, 1)'));
	assert.ok(!sameEasing('ease-in', 'ease-out'));
});

test('journeys that lead to another page or could not be used are not recorded', () => {
	const step = (over: Partial<StepResult> = {}): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, ...over });
	const journey = (name: string, expected: StepResult[]): RecordedJourney => ({ name, steps: [{ action: 'click', target: { role: 'button', name, nth: 0 } }], expected });
	const { take, skipped } = motionJourneys([journey('a', [step()]), journey('b', [step({ navigated: true })]), journey('c', [step({ failed: 'gone' })])]);
	assert.deepEqual(take.map((j) => j.name), ['a']);
	assert.deepEqual(skipped, ['b: it leads to another page', 'c: it could not be used on the old page']);
});

test('each use of a control after its journey that stays on the page is recorded on its own (a disclosure closing on its second use), up to a reload', () => {
	const step = (over: Partial<StepResult> = {}): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, ...over });
	const target = { role: 'button', name: 'FAQ', nth: 0 };
	const toggle: RecordedJourney = { name: 'click button "FAQ"', steps: [{ action: 'click', target }], cycle: ['again', 'again', 'reload', 'again'], expected: [step(), step(), step(), step(), step()] };
	const leaves: RecordedJourney = { name: 'click button "Next"', steps: [{ action: 'click', target }], cycle: ['again'], expected: [step(), step({ navigated: true })] };
	const cycles = motionCycles([toggle, leaves]);
	assert.deepEqual(cycles.map((j) => j.name), ['click button "FAQ" (step 2 of 5: use 2)', 'click button "FAQ" (step 3 of 5: use 3)']);
	assert.deepEqual(cycles.map((j) => (j as { act?: number }).act), [0, 1]);
});

test('an interaction whose write was held back is not compared for motion: each app animates its own answer to the empty reply the checker gives instead of the server', () => {
	const step = (over: Partial<StepResult> = {}): StepResult => ({ url: '/', added: [], removed: [], requests: [], errors: [], announcements: [], focus: 'body', navigated: false, ...over });
	const journey = (name: string, expected: StepResult[]): RecordedJourney => ({ name, steps: [{ action: 'click', target: { role: 'button', name, nth: 0 } }], expected });
	const held = { line: 'would POST /api/articles/a/favorite {}', reason: 'POST request', sent: false };
	const { take, skipped } = motionJourneys([journey('Favorite Article (0)', [step({ writes: [held] })]), journey('Sent', [step({ writes: [{ ...held, line: 'POST /api/x {}', sent: true }] })])]);
	assert.deepEqual(take.map((j) => j.name), ['Sent'], 'a write that was sent (staging, this machine) is compared as usual');
	assert.match(skipped[0]!, /^Favorite Article \(0\): its write was held back \(would POST \/api\/articles\/a\/favorite \{\}\), so what follows is each app's answer to the checker's empty reply/);
});

test('the old rules that make something move are those with a transition or animation, outside reduced motion', () => {
	const rule = (selector: string, property: string, value: string, conditions: { kind: 'media'; text: string }[] = []) => ({ selector, file: 'a.css', line: 1, column: 1, order: 0, specificity: [0, 1, 0] as const, conditions, declarations: [{ property, value, important: false }] });
	const found = motionRules([rule('.items', 'transition', 'height 250ms ease-in-out'), rule('.items', 'transition', 'none', [{ kind: 'media', text: '(prefers-reduced-motion: reduce)' }]), rule('.x', 'transition-duration', '0s'), rule('.spin', 'animation', 'spin 1s linear infinite'), rule('.y', 'color', 'red')]);
	assert.deepEqual(found.map((r) => r.selector), ['.items', '.spin']);
});
