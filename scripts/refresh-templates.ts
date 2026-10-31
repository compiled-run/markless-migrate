// One-off for the 2026-10-31 shadcn deploy: brings a converted app's two template files (head.ts and server/routing.ts) to
// this checkout's converter without a new emit, because the old site its captures name has been rebuilt since. Each file
// is first proven to be the template the converted app was made with, so nothing else in it can change.
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The two HEAD_HELPER files are written from src/convert/document.ts at each converter, so this runs before any install.
const [app, oldHead, newHead] = process.argv.slice(2);
if (!app || !oldHead || !newHead) throw new Error('usage: refresh-templates.ts <app> <old HEAD_HELPER file> <new HEAD_HELPER file>');
const head = join(app, 'head.ts');
if ((await readFile(head, 'utf8')) !== (await readFile(oldHead, 'utf8'))) throw new Error('head.ts is not the old converter\'s HEAD_HELPER');
await writeFile(head, await readFile(newHead, 'utf8'));

const routing = join(app, 'server', 'routing.ts');
let text = await readFile(routing, 'utf8');
const imports = [...text.matchAll(/^import \* as (handler\d+) from ("[^"]+");$/gm)];
if (!imports.length) throw new Error('routing.ts imports no handlers');
const first = imports[0]!.index!;
const block = imports.map((m) => m[0]).join('\n');
if (text.slice(first, first + block.length) !== block) throw new Error('the handler imports are not one block');
text = text.slice(0, first) + `// Each handler is imported on its first request: a Worker that imported them all would load every one as it starts.\n${imports.map((m) => `const ${m[1]} = () => import(${m[2]});`).join('\n')}` + text.slice(first + block.length);
const handlersType = 'const HANDLERS: readonly { pattern: string; module: Record<string, unknown> }[] = [';
if (text.split(handlersType).length !== 2) throw new Error('no single HANDLERS table');
const line = text.slice(text.indexOf(handlersType), text.indexOf('\n', text.indexOf(handlersType)));
const next = line.replace(handlersType, 'const HANDLERS: readonly { pattern: string; load: () => Promise<Record<string, unknown>> }[] = [').replace(/, module: (handler\d+) \}/g, ', load: $1 }');
if ((next.match(/load: handler\d+/g) ?? []).length !== imports.length) throw new Error('HANDLERS entries do not match the imports');
text = text.replace(line, next);
const run = 'const run = m && (h.module[request.method] as';
if (text.split(run).length !== 2) throw new Error('no single handler call');
text = text.replace(run, 'const run = m && ((await h.load())[request.method] as');
await writeFile(routing, text);
console.log(`head.ts and server/routing.ts (${imports.length} handlers) brought to this converter`);

// Served layers (#497): each /_converted/layers/<hash>.html becomes the directory index /_converted/layers/<hash>/.
const layersDir = join(app, 'public', '_converted', 'layers');
const LAYER = /\/_converted\/layers\/([0-9a-f]{16})\.html/g;
const files = (await readdir(app, { recursive: true, withFileTypes: true }))
	.filter((e) => e.isFile() && /\.(tsrx|ts|js|mjs|json|html|css)$/.test(e.name))
	.map((e) => join(e.parentPath, e.name))
	.filter((f) => !/\/(node_modules|\.migrate|\.output|\.vercel)\//.test(f) && !f.startsWith(`${layersDir}/`));
const named = new Set<string>();
for (const file of files) {
	const before = await readFile(file, 'utf8');
	const after = before.replace(LAYER, (_, hash: string) => (named.add(hash), `/_converted/layers/${hash}/`));
	if (after !== before) await writeFile(file, after);
}
const served = (await readdir(layersDir).catch(() => [] as string[])).filter((n) => n.endsWith('.html'));
for (const name of served) {
	const hash = name.slice(0, -'.html'.length);
	await mkdir(join(layersDir, hash), { recursive: true });
	await rename(join(layersDir, name), join(layersDir, hash, 'index.html'));
}
const missing = [...named].filter((h) => !served.includes(`${h}.html`));
if (missing.length) throw new Error(`layers named but not served: ${missing.join(', ')}`);
console.log(`${served.length} served layers moved to directory indexes, ${named.size} distinct named`);
