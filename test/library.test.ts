import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { markupTags, narrowLibrary, packageName, readLibraries, scanLibraries, summarizeLibraries, writeLibraries, writeParity, type ExportUsage, type LibrariesFile } from '../src/library/index.ts';

const fixtures = join(import.meta.dirname, 'library-fixtures');
const react = join(fixtures, 'react-app');
const vue = join(fixtures, 'vue-app');
const CLI = new URL('../src/cli.ts', import.meta.url).pathname;

/** A new Markless app whose installed @markless/ui ships tabs but not menu. */
async function newApp(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mm-parity-'));
	const ui = join(dir, 'node_modules/@markless/ui');
	await mkdir(join(ui, 'api'), { recursive: true });
	await writeFile(join(ui, 'package.json'), JSON.stringify({ name: '@markless/ui', version: '0.4.0' }));
	await writeFile(join(ui, 'api/manifest.json'), JSON.stringify({ tabs: { parts: ['root', 'list', 'trigger', 'content'].map((part) => ({ part })) }, modal: { parts: [{ part: 'root' }] } }));
	return dir;
}

const lib = (file: LibrariesFile, name: string) => {
	const found = file.libraries.find((l) => l.name === name);
	assert.ok(found, `${name} in ${file.libraries.map((l) => l.name).join(', ')}`);
	return found;
};
const exp = (file: LibrariesFile, library: string, name: string): ExportUsage => {
	const found = lib(file, library).exports.find((e) => e.name === name);
	assert.ok(found, `${library} ${name}`);
	return found;
};

test('import specifiers name their package; paths, builtins and virtual modules name none', () => {
	assert.equal(packageName('@tanstack/react-table'), '@tanstack/react-table');
	assert.equal(packageName('@hookform/resolvers/zod'), '@hookform/resolvers');
	assert.equal(packageName('date-fns/format'), 'date-fns');
	assert.equal(packageName('./x'), undefined);
	assert.equal(packageName('node:fs'), undefined);
	assert.equal(packageName('path'), undefined);
	assert.equal(packageName('virtual:icons'), undefined);
	assert.equal(packageName('./logo.svg?url'), undefined);
});

test('template tags keep their attributes as written, bound or literal, and the text after them', () => {
	const tags = markupTags('<Menu as="div">\n  <MenuButton :disabled="busy" class=\'btn\' @click="open()">Options</MenuButton>\n  <Dialog.Root open={isOpen} modal>{x}</Dialog.Root>\n</Menu>');
	assert.deepEqual(tags.map((t) => t.name), ['Menu', 'MenuButton', 'Dialog.Root']);
	assert.deepEqual(tags[1]!.attrs, [[':disabled', 'busy'], ['class', 'btn'], ['@click', 'open()']]);
	assert.equal(tags[1]!.text, 'Options');
	assert.deepEqual(tags[2]!.attrs, [['open', '{isOpen}'], ['modal', '']]);
});

test('React: shadcn/ui and Radix map to @markless/ui families, with only the variants the app passes', async () => {
	const app = await newApp();
	const file = await scanLibraries(react, { newApp: app });
	assert.equal(file.markless_ui, '0.4.0');
	const kit = lib(file, 'shadcn/ui');
	assert.equal(kit.class, 'markless-ui');
	assert.equal(kit.local?.dir, 'src/components/ui');
	assert.ok(!kit.exports.some((e) => e.name === 'UnusedThing'), 'a kit export nothing renders is not part of the used surface');
	const button = exp(file, 'shadcn/ui', 'Button');
	assert.deepEqual(button.maps, { target: '<button>', available: true, note: 'a styled element with no behaviour: write the element with the same classes' });
	assert.deepEqual(button.variants?.variant?.used.sort(), ['ghost', 'outline']);
	assert.deepEqual(button.variants?.variant?.available, ['default', 'outline', 'ghost']);
	assert.equal(button.variants?.variant?.classes.outline, 'border bg-background');
	assert.deepEqual(button.variants?.size?.used, ['icon']);
	assert.deepEqual(button.sites.map((s) => [s.text, s.routes]), [['Download', ['/']], ['Next', ['/users']], ['Sign in', ['/sign-in']]]);
	const trigger = exp(file, 'shadcn/ui', 'TabsTrigger');
	assert.deepEqual(trigger.maps, { target: 'tabs.trigger', available: true });
	assert.deepEqual(trigger.props.value?.values, ['overview', 'analytics', 'reports']);
	assert.deepEqual(trigger.props.disabled, { values: [true], dynamic: 0, sites: 1 });
	assert.match(kit.css.classes?.TabsTrigger ?? '', /data-\[state=active\]:bg-background/);
	const radix = lib(file, '@radix-ui/react-tabs');
	assert.equal(radix.via, 'shadcn/ui');
	assert.deepEqual(radix.exports.map((e) => [e.name, e.maps?.target]).sort(), [['Content', 'tabs.content'], ['List', 'tabs.list'], ['Root', 'tabs.root'], ['Trigger', 'tabs.trigger']]);
	assert.deepEqual(radix.css.styled.find((s) => s.token === 'data-state')?.sites, [{ file: 'src/components/ui/tabs.tsx', line: 13 }]);
	assert.equal(lib(file, '@radix-ui/react-slot').class, 'drop');
});

test('React: react-hook-form, TanStack Table and recharts list the options passed, fields read and members used', async () => {
	const file = await scanLibraries(react);
	const form = exp(file, 'react-hook-form', 'useForm');
	assert.equal(form.kind, 'hook');
	assert.deepEqual(Object.keys(form.options), ['resolver', 'defaultValues', 'defaultValues.email', 'defaultValues.password']);
	assert.deepEqual(form.options['defaultValues.email']?.values, ['']);
	assert.deepEqual(form.reads, ['formState.errors.email', 'handleSubmit()', 'register']);
	assert.deepEqual(form.sites.map((s) => [s.file, s.line, s.routes]), [['src/features/sign-in.tsx', 12, ['/sign-in']]]);
	assert.equal(lib(file, '@hookform/resolvers').class, 'parity');

	const table = lib(file, '@tanstack/react-table');
	assert.equal(table.class, 'parity');
	assert.equal(table.core, '@tanstack/table-core');
	const hook = exp(file, '@tanstack/react-table', 'useReactTable');
	assert.deepEqual(Object.keys(hook.options), ['data', 'columns', 'enableRowSelection', 'getCoreRowModel', 'getPaginationRowModel']);
	assert.deepEqual(hook.options.enableRowSelection?.values, [true]);
	assert.deepEqual(hook.reads, ['-> <Pager table>', 'getRowModel().rows']);
	assert.deepEqual(exp(file, '@tanstack/react-table', 'Table').members, { '': ['getCanNextPage()', 'nextPage()'] });
	assert.deepEqual(exp(file, '@tanstack/react-table', 'ColumnDef').members, { 'cell.row': ['getValue()'], 'header.column': ['toggleSorting()'] });
	assert.deepEqual(exp(file, '@tanstack/react-table', 'Table').sites.map((s) => s.routes), [['/users']]);

	const bar = exp(file, 'recharts', 'Bar');
	assert.equal(bar.kind, 'component');
	assert.deepEqual(bar.props.dataKey?.values, ['total']);
	assert.deepEqual(bar.props.radius, { values: [], dynamic: 1, sites: 1 });
	assert.deepEqual(bar.sites[0]?.props, { dataKey: '"total"', radius: '{[4, 4, 0, 0]}', className: '"fill-primary"' });
	assert.deepEqual(exp(file, 'recharts', 'XAxis').props.tickLine?.values, [false]);

	assert.equal(lib(file, 'zod').class, 'as-is');
	assert.equal(lib(file, 'clsx').class, 'as-is');
	assert.equal(lib(file, '@tanstack/react-router').replacement, '@markless/router');
	assert.ok(!file.libraries.some((l) => l.name === 'vitest'), 'libraries used only by tests are not part of the app');
	const text = summarizeLibraries(file);
	assert.match(text, /Port the used surface \(markless-migrate parity <library>\): 4/);
	assert.match(text, /useReactTable \(hook, 1\) {2}options data, columns, enableRowSelection, getCoreRowModel, getPaginationRowModel {2}reads getRowModel\(\)\.rows/);
});

test('Vue: Headless UI maps to @markless/ui menu, VueUse needs a port, Vuetify tags count without an import', async () => {
	const app = await newApp();
	const file = await scanLibraries(vue, { newApp: app });
	const button = exp(file, '@headlessui/vue', 'MenuButton');
	assert.deepEqual(button.maps, { target: 'menu.trigger', available: false });
	assert.equal(button.sites[0]?.text, 'Options');
	assert.deepEqual(button.props.class?.values, ['btn']);
	assert.deepEqual(exp(file, '@headlessui/vue', 'MenuItems').props.unmount?.values, [false]);
	const mouse = exp(file, '@vueuse/core', 'useMouse');
	assert.equal(lib(file, '@vueuse/core').class, 'parity');
	assert.deepEqual(mouse.options.type?.values, ['client']);
	assert.deepEqual(mouse.reads, ['x', 'y']);
	assert.equal(lib(file, 'pinia').class, 'parity');
	const btn = exp(file, 'vuetify', 'VBtn');
	assert.deepEqual(btn.props.color?.values, ['primary']);
	assert.equal(btn.sites[0]?.text, 'Add');
	assert.equal(btn.maps?.target, 'base.button');
});

test('parity writes a skeleton of exactly the used surface and a behaviour spec per usage site', async () => {
	const app = await newApp();
	const file = await scanLibraries(react, { newApp: app });
	const charts = await writeParity(file, 'recharts', { newApp: app });
	assert.deepEqual(charts.written.sort(), ['lib/parity/recharts/behaviour.json', 'lib/parity/recharts/behaviour.md', 'lib/parity/recharts/components.tsrx', 'lib/parity/recharts/index.ts']);
	const tsrx = await readFile(join(app, 'lib/parity/recharts/components.tsrx'), 'utf8');
	assert.match(tsrx, /export type BarProps = \{\n\t\/\*\* Written: "total"\. \*\/\n\treadonly dataKey: "total";/);
	assert.match(tsrx, /readonly class: "fill-primary";/);
	assert.match(tsrx, /export function Bar\(_props: BarProps\) @\{/);
	assert.match(tsrx, /export function ResponsiveContainer\(\{ children \}: ResponsiveContainerProps\) @\{/);
	assert.ok(!/LineChart|Tooltip/.test(tsrx), 'nothing the app does not use');
	assert.match(await readFile(join(app, 'lib/parity/recharts/behaviour.md'), 'utf8'), /- src\/features\/chart\.tsx:10 on \/\n {2}- must: renders with dataKey="total" radius=\{\[4, 4, 0, 0\]\} className="fill-primary"/);

	const forms = await writeParity(file, 'react-hook-form', { newApp: app, routes: ['/sign-in'] });
	const index = await readFile(join(app, 'lib/parity/react-hook-form/index.ts'), 'utf8');
	assert.match(index, /export interface UseFormOptions \{\n\treadonly resolver: unknown;\n\treadonly defaultValues: \{\n\t\treadonly email\?: string;\n\t\treadonly password\?: string;\n\t\};\n\}/);
	assert.match(index, /export type UseFormResult = \{\n\tformState: \{\n\t\terrors: \{\n\t\t\temail: unknown;\n\t\t\};\n\t\};\n\thandleSubmit\(\.\.\.args: unknown\[\]\): unknown;\n\tregister: unknown;\n\};/);
	assert.match(index, /export function useForm\(_options: UseFormOptions\): UseFormResult \{/);
	const spec = await readFile(join(app, 'lib/parity/react-hook-form/behaviour.md'), 'utf8');
	assert.match(spec, /submitting invalid or empty input shows the schema's messages: "Please enter your email\.", "Password must be at least 7 characters long\."/);
	assert.equal(forms.exports, 1);

	await writeFile(join(app, 'lib/parity/react-hook-form/index.ts'), 'export function useForm() {}\n');
	const again = await writeParity(file, 'react-hook-form', { newApp: app, routes: ['/sign-in'] });
	assert.deepEqual(again.kept, ['lib/parity/react-hook-form/index.ts']);
	assert.equal(await readFile(join(app, 'lib/parity/react-hook-form/index.ts'), 'utf8'), 'export function useForm() {}\n');

	const zod = await writeParity(file, 'zod', { newApp: app });
	assert.match(zod.notes[0]!, /framework-agnostic: import it from the Markless app unchanged/);
	assert.ok(!zod.written.some((f) => f.endsWith('index.ts')));
	await assert.rejects(writeParity(file, 'recharts', { newApp: app, routes: ['/users'] }), /recharts is not used on \/users/);
});

test('parity types the members read on library values and names the journeys that exercise each site', async () => {
	const app = await newApp();
	const file = await scanLibraries(react, { newApp: app });
	await writeParity(file, '@tanstack/react-table', { newApp: app });
	const index = await readFile(join(app, 'lib/parity/tanstack-react-table/index.ts'), 'utf8');
	assert.match(index, /export type Table = \{\n\tgetCanNextPage\(\.\.\.args: unknown\[\]\): unknown;\n\tnextPage\(\.\.\.args: unknown\[\]\): unknown;\n\};/);
	assert.match(index, /export type ColumnDef = \{\n\treadonly header\?: \(context: \{\n\t\treadonly column: \{\n\t\t\ttoggleSorting\(\.\.\.args: unknown\[\]\): unknown;\n\t\t\};\n\t\}\) => unknown;\n\treadonly cell\?: \(context: \{\n\t\treadonly row: \{\n\t\t\tgetValue\(\.\.\.args: unknown\[\]\): unknown;\n\t\t\};\n\t\}\) => unknown;/);
	assert.match(index, /Passed on as <Pager table>\./);

	const journeys = join(app, '.migrate/journeys');
	await mkdir(journeys, { recursive: true });
	await writeFile(join(journeys, 'root.json'), JSON.stringify({ route: '/', origin: 'http://old', viewport: 'desktop', journeys: [{ name: 'click tab "Analytics"', steps: [{ action: 'click', target: { role: 'tab', name: 'Analytics', nth: 0 } }], expected: [{ url: '/', navigated: false, added: ['- tabpanel "Analytics"'], removed: ['- tabpanel "Overview"'], requests: [], errors: [], announcements: [], focus: 'tab "Analytics"' }] }] }));
	const kit = await writeParity(file, 'shadcn/ui', { newApp: app, routes: ['/'], journeysDir: journeys });
	assert.ok(!kit.written.some((f) => f.endsWith('.tsrx')), 'every used part maps to an installed family, so nothing to port');
	const spec = await readFile(join(app, 'lib/parity/shadcn-ui/behaviour.md'), 'utf8');
	assert.match(spec, /## TabsTrigger \(component, -> tabs\.trigger\)/);
	assert.match(spec, /journey "click tab "Analytics"" on \/: click -> shows tabpanel "Analytics", hides tabpanel "Overview", focus on tab "Analytics"/);
	assert.match(spec, /- src\/features\/dashboard\.tsx:11 on \/\n {2}- must: renders tab "Overview" with value="overview"\n {2}- must: the default tab is selected and its panel shows/);
	assert.match(spec, /not exercised by any recorded journey/);
	assert.ok(kit.uncovered >= 1 && kit.uncovered < kit.sites);
});

test('narrowing to routes keeps only their sites and the props, options and reads seen in their files', async () => {
	const file = await scanLibraries(react);
	const kit = narrowLibrary(lib(file, 'shadcn/ui'), ['/users']);
	assert.deepEqual(kit.exports.map((e) => e.name), ['Button']);
	assert.deepEqual(kit.exports[0]!.variants?.variant?.used, ['ghost']);
	assert.deepEqual(Object.keys(kit.exports[0]!.props).sort(), ['children', 'disabled', 'onClick', 'size', 'variant']);
});

test('plan --source writes libraries.json and parity reads it from the CLI', async () => {
	const app = await newApp();
	const file = await scanLibraries(react, { newApp: app });
	await writeLibraries(file, join(app, '.migrate'));
	assert.equal((await readLibraries(join(app, '.migrate')))?.libraries.length, file.libraries.length);
	const run = spawnSync(process.execPath, [CLI, 'parity', 'recharts'], { cwd: app, encoding: 'utf8' });
	assert.equal(run.status, 0, run.stderr);
	assert.match(run.stdout, /recharts: 4 exports to port, 4 usage sites\./);
	const missing = spawnSync(process.execPath, [CLI, 'parity', 'nope'], { cwd: app, encoding: 'utf8' });
	assert.equal(missing.status, 2);
	assert.match(missing.stderr, /no library named nope/);
});
