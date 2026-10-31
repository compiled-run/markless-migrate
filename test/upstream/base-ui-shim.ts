// What Base UI's test files import (vitest, #test-utils, @mui/internal-test-utils), for a test file bundled to run in
// the page of its render (base-ui-run.ts). render() is the page itself: the converter replaced the test's own call with
// __render(<id>), and the bundle runs on that render's page, on the library's build and on the port alike. Testing
// Library's queries, user-event and jest-dom act on the page as they do in Base UI's own browser runs.
import { JestAsymmetricMatchers, JestChaiExpect, JestExtend, getState, setState } from '@vitest/expect';
import * as chai from 'chai';
import { fn, spyOn } from '@vitest/spy';
import * as dom from '@testing-library/dom';
import * as userEventModule from '@testing-library/user-event';
import * as matchers from '@testing-library/jest-dom/matchers';

type Fn = () => unknown;
interface Block {
	readonly title: string;
	readonly parent?: Block;
	readonly before: Fn[];
	readonly after: Fn[];
	readonly tests: Map<string, Fn>;
	readonly blocks: Map<string, Block>;
}

chai.use(JestExtend);
chai.use(JestChaiExpect);
chai.use(JestAsymmetricMatchers);
const expect = ((value: unknown, message?: string) => {
	setState({ assertionCalls: (getState(expect as never) as { assertionCalls: number }).assertionCalls + 1 }, expect as never);
	return chai.expect(value, message);
}) as unknown as Record<string, unknown> & ((value: unknown, message?: string) => unknown);
Object.assign(expect, chai.expect);
(expect as { extend: (m: object) => void }).extend = (m: object) => (chai.expect as unknown as { extend: (e: unknown, m: object) => void }).extend(expect, m);
setState({ assertionCalls: 0, isExpectingAssertions: false, isExpectingAssertionsError: null, expectedAssertionsNumber: null, expectedAssertionsNumberErrorGen: null, testPath: '', currentTestName: '' }, expect as never);
(expect as { extend: (m: object) => void }).extend(matchers);

// The package is CommonJS: the bundle's interop puts its export on default, once or twice.
const userEvent = ((m: any) => (m.setup ? m : m.default?.setup ? m.default : m.default.default))(userEventModule) as { setup: () => unknown };

const unsupported = (what: string) => () => {
	throw new Error(`the upstream adapter does not run ${what}`);
};

const root: Block = { title: '', before: [], after: [], tests: new Map(), blocks: new Map() };
let at = root;
function describe(title: string, body: Fn): void {
	const block = at.blocks.get(title) ?? { title, parent: at, before: [], after: [], tests: new Map(), blocks: new Map() };
	at.blocks.set(title, block);
	const outer = at;
	at = block;
	try {
		body();
	} finally {
		at = outer;
	}
}
const skipped = () => {};
const it = (title: string, body: Fn) => void at.tests.set(title, body);
const withModifiers = <T extends (title: string, body: Fn) => void>(f: T) =>
	Object.assign(f, { skip: skipped, todo: skipped, only: f, skipIf: (c: unknown) => (c ? skipped : f), runIf: (c: unknown) => (c ? f : skipped), each: () => skipped, for: () => skipped, concurrent: f, sequential: f });

const vi = { fn, spyOn, useFakeTimers: unsupported('fake timers'), useRealTimers: () => {}, advanceTimersByTime: unsupported('fake timers'), runAllTimers: unsupported('fake timers'), resetAllMocks: () => {}, restoreAllMocks: () => {}, clearAllMocks: () => {}, waitFor: dom.waitFor, stubGlobal: unsupported('stubbed globals') };

const page = () => document.getElementById('root') ?? document.body;
function rendered(id: string | null) {
	if (!id || document.title !== id) throw new Error(`this test's render has no page of its own (${id ?? 'it renders more than once or names its own variables'})`);
	const user = userEvent.setup();
	return { user, container: page(), unmount: unsupported('unmount'), rerender: unsupported('rerender'), setProps: unsupported('setProps'), forceUpdate: unsupported('forceUpdate'), ...dom.within(document.body) };
}

const g = globalThis as Record<string, unknown>;
g.__render = async (id: string | null) => rendered(id);
g.describe = withModifiers(describe);
g.it = withModifiers(it);
g.test = g.it;
g.beforeEach = (f: Fn) => void at.before.push(f);
g.afterEach = (f: Fn) => void at.after.push(f);
g.beforeAll = (f: Fn) => void at.before.push(f);
g.afterAll = skipped;
g.expect = expect;
g.vi = vi;

export const vitest = { expect, vi, describe: g.describe, it: g.it, test: g.it, beforeEach: g.beforeEach, afterEach: g.afterEach, beforeAll: g.beforeAll, afterAll: g.afterAll };
export const testUtils = {
	createRenderer: () => ({ render: (_: unknown) => rendered(null), renderToString: unsupported('server rendering'), clock: { tick: unsupported('fake timers'), runToLast: unsupported('fake timers'), withFakeTimers: skipped, restore: skipped } }),
	describeConformance: skipped,
	popupConformanceTests: skipped,
	isJSDOM: false,
	act: async (f: Fn) => f(),
	flushMicrotasks: () => new Promise<void>((done) => setTimeout(done)),
	wait: (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
	waitSingleFrame: () => new Promise<void>((done) => requestAnimationFrame(() => done())),
	...dom,
	screen: dom.screen,
	fireEvent: dom.fireEvent,
};

/** Runs the test at this title path: the before hooks of each block from the outside in, the test, its after hooks. */
async function run(path: readonly string[]): Promise<{ state: 'passed' | 'failed'; error?: string }> {
	let block = root;
	const chain: Block[] = [root];
	for (const title of path.slice(0, -1)) {
		const next = block.blocks.get(title);
		if (!next) return { state: 'failed', error: `no describe "${title}"` };
		chain.push((block = next));
	}
	const test = block.tests.get(path.at(-1)!);
	if (!test) return { state: 'failed', error: `no test "${path.at(-1)}"` };
	try {
		for (const b of chain) for (const f of b.before) await f();
		await test();
		return { state: 'passed' };
	} catch (error) {
		return { state: 'failed', error: String((error as Error)?.stack ?? error).split('\n').slice(0, 12).join('\n') };
	} finally {
		for (const b of [...chain].reverse()) for (const f of b.after) await Promise.resolve(f()).catch(() => {});
	}
}
g.__upstream = { run };
