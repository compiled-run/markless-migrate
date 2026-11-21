// The pipeline's check selection, run in the port's folder: `check-select.ts <targets.json> <old> <new> <reuse dir>
// <closures.json> <out dir> [<routes file>]` (with a routes file, only the targets among the converted routes) keys every route as `check --reuse` does (src/check/ship-key.ts) and writes <out>/targets.json,
// the targets with only the routes to check, and <out>/check-reused/report.json, the results the rest reuse. One runner
// does this over plain requests, so check's shards start only for routes whose shipped HTML or code changed.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defaultEnv } from '../src/check/browser.ts';
import { checkArgValues } from '../src/check/check-options.ts';
import { routeRoles } from '../src/check/checked-as.ts';
import { parseLayoutSurvey } from '../src/check/layout-survey.ts';
import { readClosures, selectReusable, shipVersions } from '../src/check/ship-key.ts';
import { readInventory } from '../src/status.ts';

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
// The command line check.yml's shards run check with (CHECK_ARGS), as far as it changes what is checked: in every route's key.
const checkArgs = (process.env.CHECK_ARGS ?? '').split(/\s+/).filter(Boolean);
const versions = await shipVersions(process.cwd(), checkArgs);
// Template groups and layout owners as the shards make them from the same options: what each route is checked as is in its key.
const given = checkArgValues(checkArgs);
const site = given['site-targets'] ? (JSON.parse(await readFile(given['site-targets'], 'utf8')) as Targets).routes : targets.routes;
const survey = given['layout-survey'] ? parseLayoutSurvey(await readFile(given['layout-survey'], 'utf8'), given['layout-survey']) : undefined;
const inventory = await readInventory(process.cwd());
const checkedAs = await routeRoles({ old: defaultEnv(oldOrigin), site, templates: given['every-dimension'] ? false : { patterns: inventory?.source?.routes.map((r) => r.path) ?? [], site }, ...(survey ? { survey } : {}) });
const closures = closuresFile ? await readFile(closuresFile, 'utf8').then(readClosures, () => undefined) : undefined;
const selection = versions && closures ? await selectReusable({ routes: targets.routes, newOrigin, oldOrigin, closures, versions, dir: resolve(reuseDir), checkedAs }) : undefined;
const check = selection?.check ?? targets.routes;
const reused = selection?.reused ?? [];
await mkdir(join(out, 'check-reused'), { recursive: true });
await writeFile(join(out, 'targets.json'), `${JSON.stringify({ ...targets, routes: check })}\n`);
await writeFile(join(out, 'check-reused', 'report.json'), `${JSON.stringify({ ok: reused.every((r) => r.ok), routes: reused })}\n`);
const why = !versions ? 'the port names no Markless packages' : !closures ? `no closures at ${closuresFile || '(none found)'}` : '';
const reasons = new Map<string, number>();
for (const reason of selection?.unkeyed.values() ?? []) reasons.set(reason.replace(/^\S+ /, ''), (reasons.get(reason.replace(/^\S+ /, '')) ?? 0) + 1);
console.error([...reasons].map(([why, n]) => `no reuse key: ${n} ${why}`).join('\n'));
console.log(JSON.stringify({ routes: targets.routes.length, reused: reused.length, check: check.length, other: (targets.endpoints?.length ?? 0) + (targets.redirects?.length ?? 0), unkeyed: selection?.unkeyed.size ?? targets.routes.length, ...(why ? { why } : {}) }));
