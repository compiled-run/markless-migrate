// The pipeline's check selection, run in the port's folder: `check-select.ts <targets.json> <old> <new> <reuse dir>
// <closures.json> <out dir> [<routes file>]` (with a routes file, only the targets among the converted routes) keys every route as `check --reuse` does (src/check/ship-key.ts) and writes <out>/targets.json,
// the targets with only the routes to check, and <out>/check-reused/report.json, the results the rest reuse. One runner
// does this over plain requests, so check's shards start only for routes whose shipped HTML or code changed.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { git } from '../src/check/changed.ts';
import { readClosures, selectReusable, shipVersions } from '../src/check/ship-key.ts';

interface Targets {
	readonly routes: string[];
	readonly endpoints?: string[];
	readonly redirects?: string[];
	readonly unchecked?: unknown[];
}

const [targetsFile, oldOrigin, newOrigin, reuseDir, closuresFile, out, routesFile] = process.argv.slice(2);
if (!targetsFile || !oldOrigin || !newOrigin || !reuseDir || !out) {
	console.error('usage: check-select.ts <targets.json> <old origin> <new origin> <reuse dir> <closures.json> <out dir>');
	process.exit(2);
}
const all = JSON.parse(await readFile(targetsFile, 'utf8')) as Targets;
const converted = routesFile ? new Set((await readFile(routesFile, 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean)) : undefined;
const targets: Targets = converted ? { ...all, routes: all.routes.filter((r) => converted.has(r)) } : all;
const versions = await shipVersions(process.cwd(), (args) => git(resolve(import.meta.dirname, '..'), args));
const closures = closuresFile ? await readFile(closuresFile, 'utf8').then(readClosures, () => undefined) : undefined;
const selection = versions && closures ? await selectReusable({ routes: targets.routes, newOrigin, oldOrigin, closures, versions, dir: resolve(reuseDir) }) : undefined;
const check = selection?.check ?? targets.routes;
const reused = selection?.reused ?? [];
await mkdir(join(out, 'check-reused'), { recursive: true });
await writeFile(join(out, 'targets.json'), `${JSON.stringify({ ...targets, routes: check })}\n`);
await writeFile(join(out, 'check-reused', 'report.json'), `${JSON.stringify({ ok: reused.every((r) => r.ok), routes: reused })}\n`);
const why = !versions ? 'the checker has uncommitted changes or the port names no Markless packages' : !closures ? `no closures at ${closuresFile || '(none found)'}` : '';
const reasons = new Map<string, number>();
for (const reason of selection?.unkeyed.values() ?? []) reasons.set(reason.replace(/^\S+ /, ''), (reasons.get(reason.replace(/^\S+ /, '')) ?? 0) + 1);
console.error([...reasons].map(([why, n]) => `no reuse key: ${n} ${why}`).join('\n'));
console.log(JSON.stringify({ routes: targets.routes.length, reused: reused.length, check: check.length, other: (targets.endpoints?.length ?? 0) + (targets.redirects?.length ?? 0), unkeyed: selection?.unkeyed.size ?? targets.routes.length, ...(why ? { why } : {}) }));
