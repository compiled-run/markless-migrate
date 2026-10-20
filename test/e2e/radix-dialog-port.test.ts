// Certifies the Markless port of @radix-ui/react-dialog (src/library/ports/radix-ui-react-dialog) against the real
// library: the same page is built with both (fixtures/radix-dialog-react, fixtures/radix-dialog-markless) and driven
// through generated action sequences, comparing what each shows at fixed moments. DIALOG_SEQUENCES sets how many.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import fc from 'fast-check';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { openSide, reset, runStep, triggerCenters, type Snapshot, type Step } from '../ports/dialog-oracle.ts';
import { compareSequence, describeSteps, openPair, sequences, type Pair } from '../ports/dialog-sequences.ts';
import { buildFixture, ROOT, run, startNitro, startStatic, type App } from '../ports/servers.ts';

const REACT = join(ROOT, 'fixtures/radix-dialog-react');
const MARKLESS = join(ROOT, 'fixtures/radix-dialog-markless');
const ENGINE = 'src/library/ports/radix-ui-react-dialog/engine.ts';
const RUNS = Number(process.env.DIALOG_SEQUENCES ?? 100);

// The shadcn-admin parity port's flicker, put back into the shared port: the backdrop leaves when the dialog's own exit
// animation ends, not its own.
const FLICKER = [
	{ find: "if (event.target !== el || !animationName(el).includes(CSS.escape(event.animationName))) return;", replace: "if (!(event.target instanceof HTMLElement && event.target.getAttribute('role') === 'dialog') || !animationName(el).includes(CSS.escape(event.animationName))) return;" },
	{ find: "el.addEventListener('animationend', ended);", replace: "document.addEventListener('animationend', ended);" },
];

async function buildFlickerMutant(): Promise<string> {
	const dir = join(ROOT, '.mutants', 'radix-dialog-flicker');
	await rm(dir, { recursive: true, force: true });
	await mkdir(join(dir, 'src/library'), { recursive: true });
	await cp(join(ROOT, 'src/library/ports'), join(dir, 'src/library/ports'), { recursive: true });
	const app = join(dir, 'fixtures/radix-dialog-markless');
	await cp(MARKLESS, app, { recursive: true, filter: (path) => !/\/(node_modules|\.output)(\/|$)/.test(path.slice(MARKLESS.length)) });
	await symlink(join(MARKLESS, 'node_modules'), join(app, 'node_modules'));
	let engine = await readFile(join(dir, ENGINE), 'utf8');
	for (const edit of FLICKER) {
		assert.ok(engine.includes(edit.find), `${edit.find} is not in ${ENGINE}`);
		engine = engine.replace(edit.find, edit.replace);
	}
	await writeFile(join(dir, ENGINE), engine);
	await run(join(app, 'node_modules/.bin/vp'), ['build'], app);
	return app;
}

const open = (dialog: 'a' | 'b'): Step => ({ command: { kind: 'click-trigger', dialog }, wait: 811 });
const closeThenWatch: Step = { command: { kind: 'key', key: 'Escape' }, wait: 811 };

async function pinned(context: BrowserContext, origin: string, steps: readonly Step[]): Promise<Snapshot[]> {
	const side = await openSide(context, origin);
	await reset(side, origin);
	const triggers = await triggerCenters(side.page);
	const out: Snapshot[] = [];
	for (const [i, step] of steps.entries()) out.push(...(await runStep(side, step, i, triggers)));
	await side.page.close();
	return out;
}

const frame = (snaps: readonly Snapshot[], label: string) => {
	const found = snaps.find((s) => s.label.endsWith(label));
	assert.ok(found, `no snapshot "${label}" among:\n${snaps.map((s) => s.label).join('\n')}`);
	return found;
};

describe('the Markless port of @radix-ui/react-dialog', () => {
	let browser: Browser;
	let context: BrowserContext;
	let radix: App;
	let port: App;
	let flicker: App;
	let pair: Pair;

	before(async () => {
		await Promise.all([buildFixture(REACT, 'dist/index.html', ['vite', 'build']), buildFixture(MARKLESS, '.output/server/index.mjs', ['vp', 'build'])]);
		[radix, port, flicker] = await Promise.all([startStatic(join(REACT, 'dist')), startNitro(MARKLESS), buildFlickerMutant().then(startNitro)]);
		browser = await chromium.launch();
		context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
		pair = await openPair(context, radix.origin, port.origin);
	});

	after(async () => {
		await browser?.close();
		await Promise.all([radix?.stop(), port?.stop(), flicker?.stop()]);
	});

	test(`shows what Radix shows at every compared moment of ${RUNS} generated action sequences`, { timeout: 60_000 + RUNS * 6_000 }, async () => {
		await fc.assert(
			fc.asyncProperty(sequences, async (steps) => {
				const found = await compareSequence(pair, steps);
				assert.deepEqual(found, [], `after:\n  ${describeSteps(steps)}\n${found.slice(0, 20).join('\n')}`);
			}),
			{ numRuns: RUNS, ...(process.env.DIALOG_SEED ? { seed: Number(process.env.DIALOG_SEED) } : {}) },
		);
	});

	test('the backdrop is gone in the first frame after its own fade ends, while the dialog is still fading', async () => {
		const snaps = await pinned(context, port.origin, [open('a'), closeThenWatch]);
		const after = frame(snaps, 'first frame after a-overlay exit ended');
		assert.equal(after.elements['a-overlay']?.shown, false, 'the backdrop is still shown after its 150 ms fade ended');
		const content = after.elements['a-content']!;
		assert.ok(content.shown && content.opacity! > 0 && content.opacity! < 1, `the dialog should still be mid-fade, at ${content.opacity}`);
		assert.equal(frame(snaps, 'first frame after a-content exit ended').elements['a-content']?.shown, false);
	});

	test('a backdrop slower than its dialog keeps fading after the dialog has gone', async () => {
		const snaps = await pinned(context, port.origin, [open('b'), closeThenWatch]);
		const after = frame(snaps, 'first frame after b-content exit ended');
		assert.equal(after.elements['b-content']?.shown, false);
		const overlay = after.elements['b-overlay']!;
		assert.ok(overlay.shown && overlay.opacity! > 0 && overlay.opacity! < 1, `the backdrop should still be mid-fade, at ${overlay.opacity}`);
		assert.equal(frame(snaps, 'first frame after b-overlay exit ended').elements['b-overlay']?.shown, false);
	});

	test('a closed dialog\'s parts carry no inline style, at load and after an open and a close, as Radix\'s unmounted parts carry none', async () => {
		const side = await openSide(context, port.origin);
		await reset(side, port.origin);
		const styled = () => side.page.evaluate(() => [...document.querySelectorAll('[data-testid$="-overlay"],[data-testid$="-content"]')].filter((el) => el.closest('[hidden]') && el.hasAttribute('style')).map((el) => `${(el as HTMLElement).dataset.testid} style="${el.getAttribute('style')}"`));
		assert.deepEqual(await styled(), []);
		const triggers = await triggerCenters(side.page);
		for (const [i, step] of [open('a'), closeThenWatch].entries()) await runStep(side, step, i, triggers);
		assert.deepEqual(await styled(), []);
		await side.page.close();
	});

	test('catches the shadcn parity port flicker: a backdrop that leaves when the dialog does is back at full opacity after its own fade', async () => {
		const mutant = await openPair(context, radix.origin, flicker.origin);
		const found = await compareSequence(mutant, [open('a'), closeThenWatch]);
		await Promise.all([mutant.radix.page.close(), mutant.port.page.close()]);
		assert.ok(
			found.some((d) => d.includes('first frame after a-overlay exit ended') && /a-overlay: Radix shows nothing there, the port shows it \(opacity 1\)/.test(d)),
			`expected the backdrop flash, found:\n${found.join('\n')}`,
		);
	});
});
