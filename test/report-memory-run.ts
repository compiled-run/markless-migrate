// node --expose-gc test/report-memory-run.ts <routes> <dir>: writes the report of a synthetic large run and prints its sizes and how much more heap writing it took.
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeReport } from '../src/check/run.ts';
import { DIMENSIONS, type Failure, type Report, type RouteResult } from '../src/check/types.ts';

const [count, dir] = [Number(process.argv[2]), process.argv[3]!];
// Each failure carries a long text, as a step that swaps a whole page does; a run of hundreds of such routes is what large sites give.
const text = (i: number, side: string) => `${side} ${i}: ${Array.from({ length: 120 }, (_, k) => `- link "Item ${k} of route ${i}": | - /url: /docs/${i}/${k}`).join(' | ')}`;
const route = (i: number): RouteResult => {
	const failures: Failure[] = Array.from({ length: 30 }, (_, k) => ({ route: `/docs/${i}`, dimension: 'behaviour', check: `click button "B${k}"`, expected: text(i * 100 + k, 'old'), actual: text(i * 100 + k, 'new'), hint: 'Port the handler.' }));
	return { route: `/docs/${i}`, ok: false, dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, d === 'behaviour' ? 'fail' : 'pass'])) as RouteResult['dimensions'], failures, weight: { old: { downloaded: 1, source: 1, executed: 1 }, new: { downloaded: 1, source: 1, executed: 1 } }, visualDiffs: [], shots: [] } as unknown as RouteResult;
};
const report = { version: 1, old: 'http://old', new: 'http://new', startedAt: '2026-10-24T00:00:00.000Z', ok: false, routes: Array.from({ length: count }, (_, i) => route(i)) } as unknown as Report;
const gc = (globalThis as { gc?: () => void }).gc!;
gc();
const before = process.memoryUsage().heapUsed;
let peak = before;
// Writing awaits the disk between pieces, so the sampler (after a full GC) sees what is still held while each is written.
const sampler = setInterval(() => {
	gc();
	peak = Math.max(peak, process.memoryUsage().heapUsed);
}, 10);
await writeReport(report, dir);
clearInterval(sampler);
const [json, html] = await Promise.all([stat(join(dir, 'report.json')), stat(join(dir, 'report.html'))]);
console.log(JSON.stringify({ json: json.size, html: html.size, report: before, extra: peak - before }));
