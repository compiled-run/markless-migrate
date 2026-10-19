import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { LibraryUsage } from '../src/library/types.ts';
import { readFamilies } from '../src/upgrade/families.ts';
import { overlap } from '../src/upgrade/headless.ts';
import { acceptUpgrade, summarizeUpgrade, writeUpgrade, type UpgradeReport } from '../src/upgrade/index.ts';

// A @markless/ui as the package ships it: the API manifest and each family's source.
async function fakeUi(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mm-ui-'));
	await mkdir(join(dir, 'api'), { recursive: true });
	await mkdir(join(dir, 'src', 'modal'), { recursive: true });
	await mkdir(join(dir, 'src', 'tabs'), { recursive: true });
	await writeFile(join(dir, 'api', 'manifest.json'), JSON.stringify({
		modal: { parts: ['root', 'trigger', 'content', 'title', 'description', 'close', 'backdrop'].map((part) => ({ part, props: part === 'root' ? [{ name: 'open' }, { name: 'onChange' }] : [] })) },
		tabs: { parts: [{ part: 'root', props: [{ name: 'value' }, { name: 'onChange' }] }, { part: 'list', props: [] }, { part: 'trigger', props: [{ name: 'value' }] }, { part: 'content', props: [{ name: 'value' }] }] },
	}));
	await writeFile(join(dir, 'src', 'modal', 'modal.tsrx'), `export function ModalTrigger() @{ <button aria-haspopup="dialog" aria-expanded={o} aria-controls={id} /> }
export function ModalBackdrop() @{ <div ui-open={o} ui-closed={!o} onDismiss={() => focusBackToOpener()} /> }
export function ModalContent() @{ <div role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={t} aria-describedby={d} /> }`);
	await writeFile(join(dir, 'src', 'modal', 'modal.browser.ts'), `press('Escape'); press('Home');`);
	await writeFile(join(dir, 'src', 'tabs', 'tabs.tsrx'), `const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
export function TabsTrigger() @{ <button role="tab" aria-selected={s} ui-selected={s} /> }
export function TabsList() @{ <div role="tablist" /> }
export function TabsContent() @{ <div role="tabpanel" /> }`);
	return dir;
}

const site = (file: string, line: number) => ({ file, line, kind: 'element' as const });
const exported = (name: string, props: string[], file = 'src/components/ui/dialog.tsx') => ({ name, kind: 'component' as const, imports: [{ file, line: 1 }], sites: [site(file, 10)], props: Object.fromEntries(props.map((p) => [p, { values: [], dynamic: 0, sites: 1 }])), options: {}, reads: [], members: {} });
const radix = (name: string, exports: ReturnType<typeof exported>[], styled: { token: string; sites: { file: string; line: number }[] }[], injected: string[]): LibraryUsage => ({ name, framework: 'react', class: 'markless-ui', reason: '', exports, css: { imports: [], injected, styled }, surface: { used: exports.length, total: null, members: 0 }, sites: exports.length });

test('a @markless/ui family is read from its manifest and its own code, not from its tests', async () => {
	const families = await readFamilies(await fakeUi());
	const modal = families.get('modal')!;
	assert.deepEqual([...modal.parts.keys()].sort(), ['backdrop', 'close', 'content', 'description', 'root', 'title', 'trigger']);
	assert.ok(modal.keys.has('Escape'), 'it closes on the dismiss behaviour\'s Escape report');
	assert.ok(!modal.keys.has('Home'), 'a key named only in a browser test is not a key the family answers');
	assert.ok(modal.aria.has('role=dialog') && modal.aria.has('role=alertdialog') && modal.aria.has('aria-modal'));
	assert.deepEqual([...modal.behaviours].sort(), ['focus-containment', 'focus-return', 'outside-press']);
	assert.ok(families.get('tabs')!.keys.has('Home'));
});

test('a swap is suggested only when every used part, prop, state, key, ARIA attribute and behaviour is covered; otherwise it lists what is missing', async () => {
	const families = await readFamilies(await fakeUi());
	const old = await mkdtemp(join(tmpdir(), 'mm-old-'));
	await mkdir(join(old, 'src', 'components', 'ui'), { recursive: true });
	await writeFile(join(old, 'src', 'components', 'ui', 'dialog.tsx'), `${'\n'.repeat(9)}<Overlay className="data-[state=open]:animate-in data-[state=closed]:fade-out" />\n`);
	await writeFile(join(old, 'src', 'components', 'ui', 'tabs.tsx'), `${'\n'.repeat(9)}<Trigger className="data-[state=active]:bg-white data-[orientation=vertical]:w-full" />\n`);
	const dialog = radix('@radix-ui/react-dialog', [exported('Root', ['open', 'onOpenChange']), exported('Trigger', ['asChild']), exported('Portal', []), exported('Overlay', ['className']), exported('Content', ['className', '...']), exported('Title', []), exported('Close', [])], [{ token: 'data-state', sites: [{ file: 'src/components/ui/dialog.tsx', line: 10 }, { file: 'src/components/ui/sidebar.tsx', line: 3 }] }], ['data-state']);
	const swap = await overlap(dialog, families, { oldSource: old });
	assert.equal(swap.verdict, 'swap', swap.missing.join('\n'));
	const row = (used: RegExp) => swap.rows.find((r) => used.test(r.used));
	assert.equal(row(/^Root onOpenChange$/)?.family, 'modal.root onChange');
	assert.equal(row(/^Portal$/)?.family, '(nothing: a plain element, or not needed)');
	assert.equal(row(/^data-state=open/)?.family, 'ui-open');
	assert.equal(row(/^Tab$/)?.family, 'Tab kept inside by the overlay behaviour (aria-modal)');
	assert.ok(!swap.rows.some((r) => r.used.includes('sidebar.tsx')), 'a styled site in a file that never renders the dialog styles something else');

	const tabs = radix('@radix-ui/react-tabs', [exported('Root', ['defaultValue', 'onValueChange'], 'src/components/ui/tabs.tsx'), exported('List', [], 'src/components/ui/tabs.tsx'), exported('Trigger', ['value'], 'src/components/ui/tabs.tsx'), exported('Content', ['value', 'forceMount'], 'src/components/ui/tabs.tsx')], [{ token: 'data-state', sites: [{ file: 'src/components/ui/tabs.tsx', line: 10 }] }, { token: 'data-orientation', sites: [{ file: 'src/components/ui/tabs.tsx', line: 10 }] }], ['data-state', 'data-orientation']);
	const notYet = await overlap(tabs, families, { oldSource: old });
	assert.equal(notYet.verdict, 'not yet');
	assert.deepEqual(notYet.missing, ['prop Content forceMount', 'state data-orientation=vertical (src/components/ui/tabs.tsx:10)', 'aria aria-controls', 'aria aria-labelledby']);
	assert.equal(notYet.rows.find((r) => r.used.startsWith('data-state=active'))?.family, 'ui-selected');
});

test('the report ranks what is worth doing, shows the overlap table, and accepting writes the agent task and applies nothing', async () => {
	const families = await readFamilies(await fakeUi());
	const dialog = await overlap(radix('@radix-ui/react-dialog', [exported('Root', ['open'])], [], ['data-state']), families, {});
	const measured = { bytes: 230_000, executed: 60_000, cpuMs: 600, routes: ['/'], scripts: ['/page-scripts/page.js (94%)'] };
	const report: UpgradeReport = {
		version: 1,
		generatedAt: '',
		origin: 'http://new.test',
		routes: ['/'],
		limits: [],
		suggestions: [
			{ id: 'port:@rive-app/canvas-lite', kind: 'port kept library', subject: '@rive-app/canvas-lite', measured, uses: ['Rive (resizeDrawingSurfaceToCanvas())'], saving: { bytes: 220_000, executed: 57_000, cpuMs: 570, basis: 'a port of the 10 used names' }, risk: 'high', riskReason: 'it draws into WebGL', size: '10 used names', verdict: 'suggested', rank: 1 },
			{ id: 'swap:@radix-ui/react-dialog', kind: 'swap to @markless/ui', subject: '@radix-ui/react-dialog -> @markless/ui modal', measured: { ...measured, bytes: 8_700, executed: 0, cpuMs: 0, latency: { ms: 24, route: '/tasks', control: 'button', executed: 1_200, bytes: 0 } }, uses: [], saving: { bytes: 0, executed: 0, cpuMs: 0, basis: 'the port against the family' }, risk: 'low', riskReason: 'every feature covered', size: '7 parts', verdict: 'suggested', overlap: dialog, rank: 2 },
		],
	};
	const text = summarizeUpgrade(report);
	assert.match(text, /#1 \[suggested\] port:@rive-app\/canvas-lite/);
	assert.match(text, /measured: 224\.6 kB downloaded, 58\.6 kB JS run at load, 600\.0 ms main-thread at load/);
	assert.match(text, /first interaction with its own control takes 24 ms, running 1\.2 kB of its code/);
	assert.match(text, /covered {2}prop {6}Root open -> modal\.root open/);
	assert.match(text, /checked against the pre-upgrade version of this site/);
	const state = await mkdtemp(join(tmpdir(), 'mm-state-'));
	await writeUpgrade(report, state);
	const task = await acceptUpgrade(state, 'swap:@radix-ui/react-dialog', 'http://pre-upgrade.test');
	const body = await readFile(task, 'utf8');
	assert.match(body, /^# Upgrade task: @radix-ui\/react-dialog -> @markless\/ui modal/);
	assert.match(body, /`markless-migrate check --old http:\/\/pre-upgrade\.test --new <this app, upgraded> --all` is green on every route/);
	assert.deepEqual(JSON.parse(await readFile(join(state, 'upgrade.json'), 'utf8')).accepted, ['swap:@radix-ui/react-dialog']);
	await assert.rejects(acceptUpgrade(state, 'port:nothing', undefined), /no suggestion port:nothing/);
});
