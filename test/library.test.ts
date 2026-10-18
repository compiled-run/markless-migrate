import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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

	await rm(join(app, 'lib/parity/recharts'), { recursive: true });
	await mkdir(join(app, 'lib/parity/recharts'), { recursive: true });
	await writeFile(join(app, 'lib/parity/recharts/charts.tsrx'), 'export function OverviewChart() @{ <svg /> }\n');
	const ported = await writeParity(file, 'recharts', { newApp: app });
	assert.deepEqual(ported.kept, ['lib/parity/recharts/charts.tsrx'], 'a port under its own file names owns the code');
	assert.deepEqual(ported.written.sort(), ['lib/parity/recharts/behaviour.json', 'lib/parity/recharts/behaviour.md']);
	assert.deepEqual((await readdir(join(app, 'lib/parity/recharts'))).sort(), ['behaviour.json', 'behaviour.md', 'charts.tsrx']);

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

/** A throwaway app: each entry is a file path and its text. */
async function project(files: Record<string, string>): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mm-lib-'));
	for (const [path, text] of Object.entries(files)) {
		await mkdir(join(dir, path, '..'), { recursive: true });
		await writeFile(join(dir, path), text);
	}
	return dir;
}

test('parity skeletons for default exports declare a named binding and export it as default', async () => {
	const dir = await project({
		'package.json': JSON.stringify({ dependencies: { react: '19.0.0', '@microlink/react-json-view': '1.27.0', 'pretty-bytes': '6.0.0', 'kit-lib': '1.0.0' } }),
		'src/App.tsx': "import ReactJson from '@microlink/react-json-view';\nimport prettyBytes from 'pretty-bytes';\nimport Kit from 'kit-lib';\nexport function App() { return <div><ReactJson src={{}} collapsed={2} /><Kit.Item>x</Kit.Item>{prettyBytes(1)}</div>; }\n",
	});
	const app = await newApp();
	const file = await scanLibraries(dir, { newApp: app });
	const { parse } = await import('yuku-tsrx');
	const { parseSync } = await import('oxc-parser');
	for (const name of ['@microlink/react-json-view', 'pretty-bytes', 'kit-lib']) await writeParity(file, name, { newApp: app });
	const json = await readFile(join(app, 'lib/parity/microlink-react-json-view/components.tsrx'), 'utf8');
	assert.match(json, /^function ReactJsonView\(_props: ReactJsonViewProps\) @\{/m);
	assert.match(json, /^export default ReactJsonView;$/m);
	assert.match(await readFile(join(app, 'lib/parity/microlink-react-json-view/index.ts'), 'utf8'), /export \{ default \} from '\.\/components\.tsrx';/);
	assert.match(await readFile(join(app, 'lib/parity/kit-lib/components.tsrx'), 'utf8'), /const KitLib = \{ Item: default_Item \};\nexport default KitLib;/);
	for (const path of ['microlink-react-json-view/components.tsrx', 'kit-lib/components.tsrx']) assert.deepEqual(parse(await readFile(join(app, 'lib/parity', path), 'utf8'), { lang: 'tsx' }).diagnostics.filter((d) => d.severity === 'error'), [], path);
	const bytes = await readFile(join(app, 'lib/parity/pretty-bytes/index.ts'), 'utf8');
	assert.match(bytes, /^function prettyBytes\(/m);
	assert.match(bytes, /^export default prettyBytes;$/m);
	assert.deepEqual(parseSync('index.ts', bytes).errors, []);
});

test('bare imports count: a font package adds its stylesheet, an unknown module is imported for its side effects', async () => {
	const dir = await project({
		'package.json': JSON.stringify({ dependencies: { react: '19.0.0', '@fontsource-variable/roboto': '5.2.8', 'css-only': '1.0.0', 'polyfill-x': '1.0.0' } }),
		'node_modules/@fontsource-variable/roboto/package.json': JSON.stringify({ name: '@fontsource-variable/roboto', version: '5.2.8', main: 'index.css', exports: { '.': { sass: './index.css', default: './index.css' } } }),
		'node_modules/css-only/package.json': JSON.stringify({ name: 'css-only', version: '1.0.0', style: 'dist/css-only.css' }),
		'src/index.tsx': "import '@fontsource-variable/roboto';\nimport 'css-only';\nimport 'polyfill-x';\nexport function App() { return <p>hi</p>; }\n",
	});
	const file = await scanLibraries(dir);
	assert.deepEqual(lib(file, '@fontsource-variable/roboto').css.imports, [{ file: 'src/index.tsx', line: 1 }]);
	assert.equal(lib(file, '@fontsource-variable/roboto').class, 'as-is');
	assert.deepEqual(lib(file, 'css-only').css.imports, [{ file: 'src/index.tsx', line: 2 }]);
	assert.deepEqual(exp(file, 'polyfill-x', '(side effects)').sites.map((s) => [s.file, s.line, s.kind]), [['src/index.tsx', 3, 'reference']]);
	const app = await newApp();
	const result = await writeParity(file, 'polyfill-x', { newApp: app });
	assert.match(result.notes.join('\n'), /imported for what it does on load \(src\/index\.tsx:3\)/);
	assert.ok(!result.written.some((f) => f.endsWith('index.ts')));
});

test('a framework-agnostic library that renders UI is never as-is: catalogued or found writing DOM, it needs a port or a DOM-island decision', async () => {
	const builds = Array.from({ length: 12 }, (_, i) => `const c${i} = document.createElement('div'); root.appendChild(c${i});`).join('\n');
	const dir = await project({
		'package.json': JSON.stringify({ dependencies: { react: '19.0.0', 'ag-grid-community': '34.2.0', 'ag-grid-react': '34.2.0', 'tiny-grid': '1.0.0', 'tiny-util': '1.0.0' } }),
		'node_modules/tiny-grid/package.json': JSON.stringify({ name: 'tiny-grid', version: '1.0.0', main: 'index.js' }),
		'node_modules/tiny-grid/index.js': `export function mount(root) {\n${builds}\n}\n`,
		'node_modules/tiny-util/package.json': JSON.stringify({ name: 'tiny-util', version: '1.0.0', main: 'index.js' }),
		'node_modules/tiny-util/index.js': 'export const sum = (a, b) => a + b;\n',
		'src/App.tsx': "import { AgGridReact } from 'ag-grid-react';\nimport { themeQuartz } from 'ag-grid-community';\nimport { mount } from 'tiny-grid';\nimport { sum } from 'tiny-util';\nexport function App() { mount(document.body); return <AgGridReact theme={themeQuartz} rowData={[sum(1, 2)]} />; }\n",
	});
	const file = await scanLibraries(dir);
	assert.deepEqual(['ag-grid-community', 'ag-grid-react', 'tiny-grid', 'tiny-util'].map((n) => [n, lib(file, n).class]), [['ag-grid-community', 'dom'], ['ag-grid-react', 'dom'], ['tiny-grid', 'dom'], ['tiny-util', 'as-is']]);
	assert.match(lib(file, 'tiny-grid').reason, /builds DOM/);
	assert.match(summarizeLibraries(file), /Renders its own UI: port the used surface, or a person decides on a DOM island \(never as-is\): 3/);
	const app = await newApp();
	const grid = await writeParity(file, 'ag-grid-community', { newApp: app });
	assert.match(grid.notes.join('\n'), /renders its own UI into the page\. Before writing code, ask the owner/);
	assert.ok(grid.written.includes('lib/parity/ag-grid-community/index.ts'), 'the port skeleton is written for the port option');
});

test('the used surface includes what is passed as data: column definitions, the props a custom component is given, and calls through a ref or an instance', async () => {
	const dir = await project({
		'package.json': JSON.stringify({ dependencies: { react: '19.0.0', 'ag-grid-react': '34.2.0', 'ag-grid-community': '34.2.0', 'chart.js': '4.0.0' } }),
		'src/Filter.tsx': 'export default function Filter({ model, onModelChange }) {\n  return <button onClick={() => onModelChange(model.next)}>x</button>;\n}\n',
		'src/Grid.tsx': `import { useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { createGrid } from 'ag-grid-community';
import { Chart } from 'chart.js';
import Filter from './Filter';
const base = { sortable: true };
export function Grid({ rows, id }) {
  const gridRef = useRef(null);
  const columnDefs = useMemo(() => [
    { headerName: 'No.', field: 'serialNumber', width: 55 },
    { field: 'direction', filter: { component: Filter }, cellRenderer: (params) => params.data.direction },
    { field: 'args', filter: 'agTextColumnFilter', flex: 3 },
  ], []);
  const go = () => {
    gridRef.current.api.ensureIndexVisible(3, 'bottom');
    const node = gridRef.current.api.getRowNode(id);
    node.setSelected(true);
  };
  const api = createGrid(document.body, { rowData: rows, columnDefs: [{ field: 'a' }] });
  api.setGridOption('rowData', rows);
  const chart = new Chart(document.body, { type: 'bar', data: { labels: ['a'], datasets: [{ label: 'n', data: [1] }] } });
  chart.update();
  return <AgGridReact ref={gridRef} rowData={rows} columnDefs={columnDefs} defaultColDef={{ ...base, resizable: true }} onRowClicked={(e) => go(e.data)} />;
}
`,
	});
	const file = await scanLibraries(dir);
	const grid = exp(file, 'ag-grid-react', 'AgGridReact');
	assert.deepEqual(Object.fromEntries(Object.entries(grid.data ?? {}).map(([k, v]) => [k, v.values])), {
		'columnDefs[].headerName': ['No.'],
		'columnDefs[].field': ['serialNumber', 'direction', 'args'],
		'columnDefs[].width': [55],
		'columnDefs[].filter.component': [],
		'columnDefs[].cellRenderer': [],
		'columnDefs[].filter': ['agTextColumnFilter'],
		'columnDefs[].flex': [3],
		'defaultColDef.sortable': [true],
		'defaultColDef.resizable': [true],
	});
	assert.deepEqual(grid.members['columnDefs[].filter.component'], ['model', 'model.next', 'onModelChange']);
	assert.deepEqual(grid.members['columnDefs[].cellRenderer'], ['data.direction']);
	assert.deepEqual(grid.members.ref, ['api.ensureIndexVisible()', 'api.getRowNode()', 'api.getRowNode().setSelected()']);
	assert.deepEqual(grid.members.onRowClicked, ['data']);
	const vanilla = exp(file, 'ag-grid-community', 'createGrid');
	assert.deepEqual(vanilla.reads, ['setGridOption()']);
	assert.deepEqual(Object.keys(vanilla.options), ['rowData', 'columnDefs']);
	assert.deepEqual(vanilla.data?.['columnDefs[].field']?.values, ['a']);
	const chart = exp(file, 'chart.js', 'Chart');
	assert.equal(chart.kind, 'function');
	assert.deepEqual(chart.reads, ['update()']);
	assert.deepEqual(chart.data?.['data.datasets[].label']?.values, ['n']);
	const app = await newApp();
	await writeParity(file, 'ag-grid-react', { newApp: app });
	const tsrx = await readFile(join(app, 'lib/parity/ag-grid-react/components.tsrx'), 'utf8');
	assert.match(tsrx, /readonly ref: \{ current: \{\n\t\tapi: \{\n\t\t\tensureIndexVisible\(\.\.\.args: unknown\[\]\): unknown;/);
	assert.match(tsrx, /readonly columnDefs: readonly \(\{\n\t\treadonly headerName\?: string;\n\t\treadonly field\?: string;/);
	assert.match(tsrx, /readonly filter\?: string \| \{\n\t\t\treadonly component\?: \(\(value: \{/);
	assert.match(await readFile(join(app, 'lib/parity/ag-grid-react/behaviour.md'), 'utf8'), /Members read on ref: api\.ensureIndexVisible\(\), api\.getRowNode\(\), api\.getRowNode\(\)\.setSelected\(\)/);
});

test('parity --route / finds a webpack app\'s libraries: the page is linked to the entry that renders the app', async () => {
	const file = await scanLibraries(new URL('./source-fixtures/webpack', import.meta.url).pathname);
	assert.deepEqual(exp(file, 'ag-grid-react', 'AgGridReact').sites.map((s) => s.routes), [['/', '/admin/']]);
	const app = await newApp();
	const result = await writeParity(file, 'ag-grid-react', { newApp: app, routes: ['/'] });
	assert.equal(result.sites, 1);
	await assert.rejects(writeParity(file, 'ag-grid-react', { newApp: app, routes: ['/panel.html'] }), /is not used on \/panel\.html/);
});
