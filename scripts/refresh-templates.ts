// One-off for the 2026-10-31 shadcn deploy: brings a converted app's two template files (head.ts and server/routing.ts) to
// this checkout's converter without a new emit, because the old site its captures name has been rebuilt since. Each file
// is first proven to be the template the converted app was made with, so nothing else in it can change.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HEAD_HELPER } from '../src/convert/document.ts';

const [app, oldHead] = process.argv.slice(2);
if (!app || !oldHead) throw new Error('usage: refresh-templates.ts <app> <the old converter HEAD_HELPER file>');
const head = join(app, 'head.ts');
if ((await readFile(head, 'utf8')) !== (await readFile(oldHead, 'utf8'))) throw new Error('head.ts is not the old converter\'s HEAD_HELPER');
await writeFile(head, HEAD_HELPER);

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
