// Recorded demo uses on Markless state (convert's ScenePlan) and their playback (parts/scene.ts).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseFragment } from 'parse5';
import { chromium } from 'playwright';
import ts from 'typescript';
import type { Element } from '../src/convert/dom.ts';
import { ScenePlan, type SceneData } from '../src/convert/scene-plan.ts';
import { TYPED, type Scene, type SceneNode } from '../src/convert/scenes.ts';
import { emitElement } from '../src/convert/tsrx.ts';

const ROOT = join(import.meta.dirname, '..');
const el = (id: number, tag: string, attrs: Record<string, string>, ...kids: SceneNode[]): SceneNode => ({ id, tag, attrs: Object.entries(attrs), kids });
const text = (id: number, t: string): SceneNode => ({ id, text: t });
const html = (n: SceneNode): string => ('text' in n ? n.text : `<${n.tag}${n.attrs.map(([k, v]) => ` ${k}="${v}"`).join('')}>${n.kids.map(html).join('')}</${n.tag}>`);

function planned(scene: Scene, listed = 'button'): { out: string; data: SceneData; plan: ScenePlan } {
	const region = parseFragment(html(scene.states[0]!)).childNodes[0] as unknown as Element;
	const plan = new ScenePlan();
	assert.ok(plan.add(scene, region, listed), plan.refused.join('\n'));
	const out = emitElement(region, { bind: (e) => plan.bind(e) });
	const data = JSON.parse(JSON.parse(/data-mm-scene=\{("(?:[^"\\]|\\.)*")\}/.exec(out)![1]!) as string) as SceneData;
	return { out, data, plan };
}

// "Show more": the button's text and aria-expanded and the content's class change in place.
const flip = (open: boolean) => el(1, 'div', { 'data-slot': 'preview' }, el(2, 'p', { class: open ? 'open' : 'max-h-64' }, text(3, 'code')), el(4, 'button', { 'aria-expanded': String(open) }, text(5, open ? 'Show less' : 'Show more')));
const FLIP: Scene = {
	sig: 'div|preview|',
	nth: 0,
	states: [flip(false), flip(true)],
	edges: [
		{ from: 0, control: 'button||Show more#0', to: 1, frames: [{ t: 16, tree: flip(true) }] },
		{ from: 1, control: 'button||Show less#0', to: 0, frames: [{ t: 16, tree: flip(false) }] },
	],
	skipped: [],
};

test('a control that only changes values in place is played on keyed elements, with no arm', () => {
	const { out, data } = planned(FLIP);
	assert.doesNotMatch(out, /@if/);
	assert.match(out, /<p class="max-h-64" data-mm-k="2">/);
	assert.match(out, /<button aria-expanded="false" data-mm-k="4">Show more<\/button>/);
	assert.deepEqual(data.rest, [0, 1]);
	assert.deepEqual(
		data.entries.map(([k, kind, which]) => `${k}:${kind}:${which}`),
		['2:a:class', '4:a:aria-expanded', '4:t:0'],
	);
	assert.deepEqual(data.changes[1], [[0, 'open'], [1, 'true'], [2, 'Show less']]);
	assert.deepEqual(data.edges.map((e) => e.slice(0, 4)), [[0, 'button||Show more#0', 1, 1], [1, 'button||Show less#0', 2, 2]]);
});

// Send: a row is added and its reply streams in, then a row that only showed while waiting goes.
const chat = (rows: SceneNode[]) => el(1, 'div', { 'data-slot': 'preview' }, el(2, 'div', { role: 'log' }, el(3, 'p', {}, text(4, 'Hi')), ...rows), el(9, 'button', {}, text(10, 'Send')));
const SEND: Scene = {
	sig: 'div|preview|',
	nth: 0,
	states: [chat([]), chat([el(6, 'p', {}, text(7, 'Hello there'))])],
	edges: [
		{
			from: 0,
			control: 'button||Send#0',
			to: 1,
			frames: [
				{ t: 20, tree: chat([el(5, 'p', { 'data-typing': '' }, text(8, '…'))]) },
				{ t: 500, tree: chat([el(6, 'p', {}, text(7, 'Hel'))]) },
				{ t: 520, tree: chat([el(6, 'p', {}, text(7, 'Hello'))]) },
				{ t: 540, tree: chat([el(6, 'p', {}, text(7, 'Hello there'))]) },
			],
		},
	],
	skipped: [],
};

test('a row that comes and goes is an arm over the frames it shows in, and its streamed text is a prefix of the longest', () => {
	const { out, data } = planned(SEND);
	assert.match(out, /@if \(sc0 === 1\) \{ <><p data-typing="">…<\/p><\/> \}/);
	assert.match(out, /@if \(\(sc0 >= 2 && sc0 <= 4\)\) \{ <><p data-mm-k="6">Hel<\/p><\/> \}/);
	assert.match(out, /^<div data-slot="preview" data-mm-scene=/);
	assert.match(out, /onClick=\{\(event\) => playScene\(event, \(frame\) => \{ sc0 = frame; \}\)\}/);
	const i = data.entries.findIndex(([k, kind]) => k === 6 && kind === 't');
	assert.equal(data.entries[i]![3], 'Hello there');
	assert.deepEqual([2, 3, 4].map((f) => data.changes[f]?.find(([e]) => e === i)?.[1]), [3, 5, 11]);
	assert.deepEqual(data.edges[0]![4], [20, 500, 520, 540]);
});

// Replay: React drops the code and streams new nodes back to the same thing.
const block = (ids: readonly [number, number, number], lines: string[]) => el(1, 'div', { 'data-slot': 'preview' }, el(2, 'pre', {}, ...lines.map((l, i) => el(ids[i]!, 'span', {}, text(ids[i]! * 10, l)))), el(9, 'button', {}, text(90, 'Replay')));
const REPLAY: Scene = {
	sig: 'div|preview|',
	nth: 0,
	states: [block([3, 4, 5], ['a', 'b', 'c'])],
	edges: [
		{
			from: 0,
			control: 'button||Replay#0',
			to: 0,
			frames: [
				{ t: 16, tree: block([13, 14, 15], []) },
				{ t: 32, tree: block([13, 14, 15], ['a']) },
				{ t: 48, tree: block([13, 14, 15], ['a', 'b']) },
				{ t: 64, tree: block([13, 14, 15], ['a', 'b', 'c']) },
			],
		},
	],
	skipped: [],
};

test('a use that ends where it started ends on the nodes the page loaded with: one arm per line, frame 0 among its frames', () => {
	const { out } = planned(REPLAY);
	assert.equal((out.match(/@if/g) ?? []).length, 3);
	assert.match(out, /@if \(sc0 === 0 \|\| \(sc0 >= 2 && sc0 <= 4\)\) \{ <><span>a<\/span><\/> \}/);
	assert.match(out, /@if \(sc0 === 0 \|\| sc0 === 4\) \{ <><span>c<\/span><\/> \}/);
});

test('the scene part plays a use at its recorded times and a second control from the state it reached', async () => {
	const { data } = planned(FLIP);
	const part = ts.transpileModule(await readFile(join(ROOT, 'parts/scene.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const files: Record<string, string> = { '/scene.js': part };
		await page.route('http://app.test/**', (route) => {
			const body = files[new URL(route.request().url()).pathname];
			return body !== undefined ? route.fulfill({ contentType: 'text/javascript', body }) : route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
		});
		await page.goto('http://app.test/');
		const frames = await page.evaluate(
			async ([data]) => {
				const { playScene } = (await import('/scene.js' as string)) as typeof import('../parts/scene.ts');
				document.body.innerHTML = '<div data-slot="preview"><p class="max-h-64" data-mm-k="2">code</p><button aria-expanded="false" data-mm-k="4">Show more</button></div>';
				const region = document.querySelector('[data-slot="preview"]')!;
				region.setAttribute('data-mm-scene', JSON.stringify(data));
				const seen: number[] = [];
				region.addEventListener('click', (event) => playScene(event, (f) => seen.push(f)));
				const button = region.querySelector('button')!;
				const read = () => `${region.querySelector('p')!.className}|${button.getAttribute('aria-expanded')}|${button.textContent}`;
				button.click();
				const before = read();
				await new Promise((r) => setTimeout(r, 60));
				const opened = read();
				button.click();
				await new Promise((r) => setTimeout(r, 60));
				return { before, opened, closed: read(), seen };
			},
			[data] as const,
		);
		assert.deepEqual(frames, { before: 'max-h-64|false|Show more', opened: 'open|true|Show less', closed: 'max-h-64|false|Show more', seen: [1, 1, 2, 0] });
	} finally {
		await browser.close();
	}
});

test("a streamed use keeps its recorded gaps after the page stalls: frames come one gap apart, not all at once", async () => {
	const at = (t: number, lines: string[]) => ({ t, tree: block([13, 14, 15], lines) });
	const { data } = planned({ ...REPLAY, edges: [{ ...REPLAY.edges[0]!, frames: [at(10, []), at(60, ['a']), at(110, ['a', 'b']), at(160, ['a', 'b', 'c'])] }] });
	const part = ts.transpileModule(await readFile(join(ROOT, 'parts/scene.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.route('http://app.test/**', (route) => (new URL(route.request().url()).pathname === '/scene.js' ? route.fulfill({ contentType: 'text/javascript', body: part }) : route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' })));
		await page.goto('http://app.test/');
		const gaps = await page.evaluate(
			async ([data]) => {
				const { playScene } = (await import('/scene.js' as string)) as typeof import('../parts/scene.ts');
				document.body.innerHTML = '<div data-slot="preview"><button>Replay</button></div>';
				const region = document.querySelector('[data-slot="preview"]')!;
				region.setAttribute('data-mm-scene', JSON.stringify(data));
				const times: number[] = [];
				region.addEventListener('click', (event) => playScene(event, () => times.push(performance.now())));
				region.querySelector('button')!.click();
				// The page is busy past every frame's time.
				const until = performance.now() + 250;
				while (performance.now() < until);
				await new Promise((r) => setTimeout(r, 400));
				return times.slice(1).map((t, i) => Math.round(t - times[i]!));
			},
			[data] as const,
		);
		// The last set is the use settling, with its last frame.
		assert.equal(gaps.length, 4, String(gaps));
		for (const gap of gaps.slice(0, 3)) assert.ok(gap >= 40, `gaps ${gaps.join(', ')}`);
	} finally {
		await browser.close();
	}
});

// A prompt input: typing enables Send; Enter puts the text in the thread, empties the field and a reply streams in.
const prompt = (value: string, sent: string, reply: string, disabled: boolean) => el(1, 'div', { 'data-slot': 'preview' }, el(2, 'p', { class: 'you' }, text(3, sent)), el(4, 'p', { class: 'reply' }, text(5, reply)), el(6, 'textarea', { placeholder: 'Ask', '.value': value }), el(7, 'button', disabled ? { disabled: '' } : {}, text(8, 'Send')));
const FIELD_CONTROL = 'textarea||Ask#0';
const PROMPT: Scene = {
	sig: 'div|preview|',
	nth: 0,
	states: [prompt('', '-', '-', true), prompt(TYPED, '-', '-', false), prompt('', TYPED, 'Sure thing.', true)],
	edges: [
		{ from: 0, control: `${FIELD_CONTROL}|fill`, to: 1, frames: [{ t: 2, tree: prompt(TYPED, '-', '-', false) }] },
		{ from: 1, control: `${FIELD_CONTROL}|clear`, to: 0, frames: [{ t: 2, tree: prompt('', '-', '-', true) }] },
		{
			from: 1,
			control: `${FIELD_CONTROL}|enter`,
			to: 2,
			frames: [
				{ t: 2, tree: prompt('', TYPED, '-', true) },
				{ t: 40, tree: prompt('', TYPED, 'Sure', true) },
				{ t: 80, tree: prompt('', TYPED, 'Sure thing.', true) },
			],
		},
	],
	skipped: [],
};

test("a listed field's uses are played from its input and its Enter, the text the capture typed written by the part", () => {
	const { out, data } = planned(PROMPT, 'textarea');
	assert.equal(data.typed, TYPED);
	assert.match(out, /onInput=\{\(event\) => playScene\(event, /);
	assert.match(out, /onKeyDown=\{\(event\) => playScene\(event, /);
	assert.ok(data.entries.some(([k, kind]) => k === 2 && kind === 't'), 'the sent text is an entry, so the visitor\'s own text replaces it');
	assert.ok(data.entries.some(([k, kind, which]) => k === 6 && kind === 'a' && which === '.value'));
	assert.deepEqual(data.edges.map((e) => e[1]), [`${FIELD_CONTROL}|fill`, `${FIELD_CONTROL}|clear`, `${FIELD_CONTROL}|enter`]);
});

test('typing plays the fill use without touching what the visitor typed; Enter shows their text where the capture showed its own, empties the field and streams the reply', async () => {
	const { data } = planned(PROMPT, 'textarea');
	const part = ts.transpileModule(await readFile(join(ROOT, 'parts/scene.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.route('http://app.test/**', (route) => (new URL(route.request().url()).pathname === '/scene.js' ? route.fulfill({ contentType: 'text/javascript', body: part }) : route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' })));
		await page.goto('http://app.test/');
		await page.evaluate(async ([data]) => {
			const { playScene } = (await import('/scene.js' as string)) as typeof import('../parts/scene.ts');
			document.body.innerHTML = '<div data-slot="preview"><p class="you" data-mm-k="2">-</p><p class="reply" data-mm-k="4">-</p><textarea placeholder="Ask" data-mm-k="6"></textarea><button data-mm-k="7" disabled>Send</button></div>';
			const region = document.querySelector('[data-slot="preview"]')!;
			region.setAttribute('data-mm-scene', JSON.stringify(data));
			for (const type of ['click', 'input', 'keydown']) region.addEventListener(type, (event) => playScene(event, () => {}));
		}, [data] as const);
		await page.locator('textarea').pressSequentially('hello there');
		const typed = await page.evaluate(() => ({ value: document.querySelector('textarea')!.value, disabled: document.querySelector('button')!.disabled }));
		assert.deepEqual(typed, { value: 'hello there', disabled: false });
		await page.keyboard.press('Enter');
		await page.waitForTimeout(200);
		const sent = await page.evaluate(() => ({ you: document.querySelector('.you')!.textContent, reply: document.querySelector('.reply')!.textContent, value: document.querySelector('textarea')!.value, disabled: document.querySelector('button')!.disabled }));
		assert.deepEqual(sent, { you: 'hello there', reply: 'Sure thing.', value: '', disabled: true });
	} finally {
		await browser.close();
	}
});

// A transcript that only exists once a message is sent, holding a typing row, then the reply that replaces it.
const thread = (rows: SceneNode[] | null) => el(1, 'div', { 'data-slot': 'preview' }, ...(rows ? [el(2, 'div', { 'data-slot': 'message-scroller' }, ...rows)] : []), el(9, 'button', {}, text(10, 'Send')));
const GROWING: Scene = {
	sig: 'div|preview|',
	nth: 0,
	states: [thread(null), thread([el(6, 'p', {}, text(7, 'Hello there'))])],
	edges: [
		{
			from: 0,
			control: 'button||Send#0',
			to: 1,
			frames: [
				{ t: 20, tree: thread([el(5, 'p', { 'data-typing': '' }, text(8, '…'))]) },
				{ t: 500, tree: thread([el(6, 'p', {}, text(7, 'Hel'))]) },
				{ t: 540, tree: thread([el(6, 'p', {}, text(7, 'Hello there'))]) },
			],
		},
	],
	skipped: [],
};

test('a node that shows different children by turns is one arm over all of them, so it is never mounted again between them', () => {
	const { out, data } = planned(GROWING);
	assert.equal((out.match(/data-slot="message-scroller"/g) ?? []).length, 1, 'the transcript is rendered once');
	assert.match(out, /@if \(\(sc0 >= 1 && sc0 <= 3\)\) \{ <><div data-slot="message-scroller"/);
	assert.deepEqual(data.entries.filter(([, kind]) => kind === 'h').map(([k]) => k).sort(), [5, 6]);
});

test('a demo whose uses would replace an element another plan puts on Markless state is not played', () => {
	const region = parseFragment(html(REPLAY.states[0]!)).childNodes[0] as unknown as Element;
	const plan = new ScenePlan((e) => e.tagName === 'span');
	assert.equal(plan.add(REPLAY, region, 'button'), false);
	assert.match(plan.refused[0]!, /<span> is on Markless state already/);
	assert.equal(plan.bind(region), undefined);
});
