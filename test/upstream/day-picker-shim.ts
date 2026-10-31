// Runs react-day-picker's Jest tests (day-picker-pages.ts TESTS) unchanged in a real browser: render() opens the page
// day-picker-pages.ts built for that render, and screen queries, user-event and jest-dom matchers act on that page
// through Playwright. The same shim runs on the library's pages and on the port's, so a test the shim cannot express
// fails on the library too and is never admitted.
//   node test/upstream/day-picker-run.ts <checkout> <origin> <out.json> [repeat]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import ts from 'typescript';
import { RENDERS, TESTS } from './day-picker-pages.ts';

type Fn = () => unknown;
interface Block {
	readonly title: string;
	readonly parent?: Block;
	readonly beforeAll: Fn[];
	readonly afterAll: Fn[];
	readonly beforeEach: Fn[];
	readonly children: (Block | { readonly title: string; readonly fn: Fn; readonly parent: Block })[];
}

/** What a query names: resolved on the page when an action or an assertion uses it. */
export interface Handle {
	readonly describe: string;
	readonly resolve: (page: Page) => Locator;
	readonly focus: () => Promise<void>;
}

let page: Page | undefined;
let context: BrowserContext | undefined;
let origin = '';
let now: Date | undefined;
const pending: (() => Promise<void>)[] = [];
// Testing Library acts synchronously; here each act on the page runs after the one before, and a step waits for all.
let chain: Promise<unknown> = Promise.resolve();
const queue = <T>(op: () => Promise<T>): Promise<T> => {
	const next = chain.then(op);
	chain = next.catch(() => {});
	inflight.push(next);
	return next;
};
const inflight: Promise<unknown>[] = [];
const on = () => {
	if (!page) throw new Error('nothing is rendered');
	return page;
};

const handle = (describe: string, resolve: (page: Page) => Locator): Handle => ({ describe, resolve, focus: () => queue(() => resolve(on()).focus()) });
const role = (name: string, options: { name?: string | RegExp; hidden?: boolean } = {}) =>
	handle(`${name} ${String(options.name ?? '')}`, (p) => p.getByRole(name as Parameters<Page['getByRole']>[0], { ...(options.name !== undefined ? { name: options.name, exact: typeof options.name === 'string' } : {}), ...(options.hidden ? { includeHidden: true } : {}) }));

let format: (date: Date, pattern: string) => string;

export const elements = {
	app: () => role('application'),
	previousButton: () => role('button', { name: 'Go to the Previous Month' }),
	nextButton: () => role('button', { name: 'Go to the Next Month' }),
	grid: (name?: string | RegExp) => role('grid', name !== undefined ? { name } : {}),
	nav: () => role('navigation'),
	// labelDayButton with no modifiers: the date in "PPPP".
	dateButton: (date: Date) => role('button', { name: new RegExp(format(date, 'PPPP'), 's') }),
	gridcell: (date: Date) => role('gridcell', { name: format(date, 'PPPP') }),
	columnheader: (name?: string | RegExp) => role('columnheader', { ...(name !== undefined ? { name } : {}), hidden: true }),
	rowheader: (name?: string | RegExp) => role('rowheader', name !== undefined ? { name } : {}),
	activeElement: () => handle('the focused element', (p) => p.locator('*:focus')),
};

const render = (element: { readonly type: { readonly example: string }; readonly props: Record<string, unknown> }) => queue(() => mount(element));
async function mount(element: { readonly type: { readonly example: string }; readonly props: Record<string, unknown> }): Promise<void> {
	const props = JSON.stringify(Object.fromEntries(Object.entries(element.props).sort(([a], [b]) => a.localeCompare(b))));
	const found = RENDERS.find((r) => r.example === element.type.example && JSON.stringify(Object.fromEntries(Object.entries(r.props).sort(([a], [b]) => a.localeCompare(b)))) === props);
	if (!found) throw new Error(`no page renders <${element.type.example} ${props}>`);
	await page?.close();
	page = await context!.newPage();
	if (now) await page.clock.setFixedTime(now);
	await page.goto(new URL(found.path, origin).href, { waitUntil: 'load' });
	await page.waitForLoadState('networkidle');
}

// user-event's keyboard syntax: {key} presses, {key>} holds until the call ends or {/key}, other characters type.
async function keys(text: string): Promise<void> {
	const p = on();
	const held: string[] = [];
	const name = (k: string) => ({ arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', pageup: 'PageUp', pagedown: 'PageDown', home: 'Home', end: 'End', enter: 'Enter', escape: 'Escape', esc: 'Escape', tab: 'Tab', shift: 'Shift', control: 'Control', alt: 'Alt', meta: 'Meta', space: ' ', ' ': ' ' })[k.toLowerCase()] ?? k;
	for (const [, braced, plain] of text.matchAll(/\{([^}]+)\}|(.)/gs)) {
		if (plain !== undefined) await p.keyboard.type(plain);
		else if (braced!.startsWith('/')) await p.keyboard.up(name(braced!.slice(1)));
		else if (braced!.endsWith('>')) {
			held.push(name(braced!.slice(0, -1)));
			await p.keyboard.down(held.at(-1)!);
		} else await p.keyboard.press(name(braced!));
	}
	for (const k of held.reverse()) await p.keyboard.up(k);
}

export const user = {
	click: (target: Handle) => queue(() => target.resolve(on()).click()),
	type: (target: Handle, text: string) =>
		queue(async () => {
			await target.resolve(on()).click();
			await keys(text);
		}),
	keyboard: (text: string) => queue(() => keys(text)),
};

const settled = () => on().evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done))));

async function poll(check: () => Promise<boolean>, what: () => string): Promise<void> {
	const deadline = Date.now() + 1000;
	for (;;) {
		if (await check().catch(() => false)) return;
		if (Date.now() > deadline) throw new Error(what());
		await new Promise((done) => setTimeout(done, 50));
	}
}

const focused = (l: Locator) => l.evaluate((el) => el === document.activeElement);
function matchers(target: Handle, negate: boolean) {
	const check = (name: string, test: () => Promise<boolean>) => pending.push(() => poll(async () => (await test()) !== negate, () => `expected ${target.describe} ${negate ? 'not ' : ''}${name}`));
	return {
		toBeInTheDocument: () => check('to be in the document', async () => (await target.resolve(on()).count()) === 1),
		toHaveFocus: () => check('to have focus', () => focused(target.resolve(on()))),
		toBe: (other: Handle) => check(`to be ${other.describe}`, async () => {
			const el = await other.resolve(on()).elementHandle({ timeout: 500 });
			return target.resolve(on()).evaluate((a, b) => a === b, el);
		}),
	};
}
const expect = (target: Handle) => ({ ...matchers(target, false), not: matchers(target, true) });

function collect(): { root: Block; globals: Record<string, unknown> } {
	const root: Block = { title: '', beforeAll: [], afterAll: [], beforeEach: [], children: [] };
	let at = root;
	const describe = (title: string, body: Fn) => {
		const block: Block = { title, parent: at, beforeAll: [], afterAll: [], beforeEach: [], children: [] };
		at.children.push(block);
		const outer = at;
		at = block;
		body();
		at = outer;
	};
	const each = (rows: readonly unknown[]) => (title: string, body: (...args: unknown[]) => void) => {
		for (const row of rows) describe(title.replace('%s', String(row)), () => body(...(Array.isArray(row) ? row : [row])));
	};
	const test = (title: string, fn: Fn) => at.children.push({ title, fn, parent: at });
	return {
		root,
		globals: {
			describe: Object.assign(describe, { each }),
			test,
			it: test,
			beforeAll: (fn: Fn) => at.beforeAll.push(fn),
			afterAll: (fn: Fn) => at.afterAll.push(fn),
			beforeEach: (fn: Fn) => at.beforeEach.push(fn),
			expect,
			jest: { setSystemTime: (date: Date) => (now = date), useRealTimers: () => {}, useFakeTimers: () => {}, advanceTimersByTime: () => {} },
		},
	};
}

async function step(fn: Fn): Promise<void> {
	await fn();
	while (inflight.length) await inflight.shift();
	if (page) await settled();
	while (pending.length) await pending.shift()!();
}

export interface ShimResult {
	readonly file: string;
	readonly title: string[];
	readonly state: 'passed' | 'failed';
	readonly error?: string;
}

async function runFile(browser: Browser, checkout: string, file: string): Promise<ShimResult[]> {
	const source = await readFile(join(checkout, file), 'utf8');
	const local = createRequire(join(checkout, 'package.json'));
	const shim = JSON.stringify(pathToFileURL(join(import.meta.dirname, 'day-picker-shim.ts')).href);
	const stubs = join(checkout, 'upstream-shim');
	await mkdir(stubs, { recursive: true });
	const stub = async (name: string, body: string) => {
		const at = join(stubs, `${name.replace(/\W/g, '_')}.mjs`);
		await writeFile(at, body);
		return JSON.stringify(pathToFileURL(at).href);
	};
	const modules: Record<string, string> = {
		react: await stub('react', `import { React, act } from ${shim};\nexport default React;\nexport { act };\n`),
		'@/test/render': await stub('render', `export { render, act } from ${shim};\n`),
		'@/test/user': await stub('user', `export { user } from ${shim};\n`),
		'@/test/elements': await stub('elements', `import { elements } from ${shim};\n${Object.keys(elements).map((k) => `export const ${k} = elements.${k};`).join('\n')}\n`),
	};
	let js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
	for (const [, names, spec] of js.matchAll(/import\s+\{([^}]*)\}\s+from\s+["'](\.\/[^"']+)["']/g)) {
		const exported = names!.split(',').map((n) => n.trim()).filter(Boolean);
		modules[spec!] = await stub(`example-${spec}`, exported.map((n) => `export const ${n} = { example: ${JSON.stringify(n)} };`).join('\n'));
	}
	js = js.replace(/from\s+["']([^"']+)["']/g, (_, spec: string) => `from ${modules[spec] ?? JSON.stringify(pathToFileURL(local.resolve(spec)).href)}`);
	const { root, globals } = collect();
	Object.assign(globalThis, globals);
	const compiled = join(checkout, `${file}.upstream-shim.mjs`);
	await writeFile(compiled, js);
	await import(`${pathToFileURL(compiled).href}?${Date.now()}`);
	const out: ShimResult[] = [];
	const chain = (block: Block | undefined): Block[] => (block ? [...chain(block.parent), block] : []);
	const walk = async (block: Block): Promise<void> => {
		for (const fn of block.beforeAll) await fn();
		for (const child of block.children) {
			if ('children' in child) {
				await walk(child);
				continue;
			}
			const blocks = chain(child.parent);
			const title = [...blocks.map((b) => b.title).filter(Boolean), child.title];
			context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
			// An action on what is not there fails as the query would, not after Playwright's 30 s.
			context.setDefaultTimeout(2000);
			try {
				for (const b of blocks) for (const fn of b.beforeEach) await step(fn);
				await step(child.fn);
				out.push({ file, title, state: 'passed' });
				process.stdout.write(`  ok ${title.join(' > ')}\n`);
			} catch (error) {
				pending.length = 0;
				await Promise.allSettled(inflight.splice(0));
				out.push({ file, title, state: 'failed', error: String((error as Error)?.message ?? error) });
				process.stdout.write(`  FAIL ${title.join(' > ')}: ${String((error as Error)?.message ?? error).split('\n')[0]}\n`);
			} finally {
				await context.close();
				page = undefined;
			}
		}
		for (const fn of block.afterAll) await fn();
	};
	await walk(root);
	return out;
}

// Run from day-picker-run.ts: the stubs the test file imports import this module, which must have finished evaluating.
export async function runShim(checkout: string, at: string, outFile: string, repeat = 1): Promise<void> {
	origin = at;
	format = (createRequire(join(checkout, 'package.json'))('date-fns') as { format: typeof format }).format;
	const browser = await chromium.launch();
	const results: ShimResult[] = [];
	try {
		for (let i = 0; i < repeat; i++) for (const file of TESTS) results.push(...(await runFile(browser, checkout, file)));
	} finally {
		await browser.close();
	}
	await writeFile(outFile, JSON.stringify(results));
}

export { render };
export const act = (fn: Fn) => queue(async () => {}).then(() => fn());
export const React = { createElement: (type: unknown, props: Record<string, unknown> | null) => ({ type, props: props ?? {} }) };
