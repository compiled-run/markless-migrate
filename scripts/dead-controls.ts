// The dead-controls job's summary: exit 1 on dead controls or a route not looked at in full, 2 when the report is missing.
//   node scripts/dead-controls.ts <convert report.json> [run that made it]
import { readFile } from 'node:fs/promises';
import { discoveryMarkdown, type DiscoveryReport } from '../src/discover/report.ts';

// A crash is a broken job, never a finding: exit 2 fails pull-request runs too.
process.on('uncaughtException', (error) => {
	process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
	process.exit(2);
});
const [file, from] = process.argv.slice(2);
if (!file) throw new Error('usage: dead-controls.ts <convert report.json> [run that made it]');
const read: unknown = await readFile(file, 'utf8').then((t) => JSON.parse(t) as unknown, () => undefined);
const section = typeof read === 'object' && read !== null && 'deadControls' in read ? read.deadControls : undefined;
// A report of another shape is a broken convert, not a run with no findings: it fails every run, as a missing one does.
const isReport = (x: unknown): x is DiscoveryReport => typeof x === 'object' && x !== null && 'routes' in x && typeof x.routes === 'object' && x.routes !== null && 'count' in x && typeof x.count === 'number' && Object.values(x.routes).every((r: unknown) => typeof r === 'object' && r !== null && 'dead' in r && Array.isArray(r.dead) && 'unknown' in r && Array.isArray(r.unknown) && 'excluded' in r);
if (section !== undefined && !isReport(section)) {
	process.stdout.write('### Dead controls: unknown\n\nThe convert report has a dead-controls section of another shape: this run cannot say.\n');
	process.exit(2);
}
const report = section && from ? { ...section, from: `run ${from}` } : section;
const { text, failed, missing } = discoveryMarkdown(report);
process.stdout.write(text);
process.exitCode = missing ? 2 : failed ? 1 : 0;
