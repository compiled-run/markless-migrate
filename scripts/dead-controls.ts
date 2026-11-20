// The dead-controls job's summary: exit 1 on dead controls or a route not looked at in full, 2 when the report is missing.
//   node scripts/dead-controls.ts <convert report.json> [run that made it]
import { readFile } from 'node:fs/promises';
import { discoveryMarkdown, type DiscoveryReport } from '../src/discover/report.ts';

const [file, from] = process.argv.slice(2);
if (!file) throw new Error('usage: dead-controls.ts <convert report.json> [run that made it]');
const read: unknown = await readFile(file, 'utf8').then((t) => JSON.parse(t) as unknown, () => undefined);
const section = typeof read === 'object' && read !== null && 'deadControls' in read ? (read as { deadControls: DiscoveryReport }).deadControls : undefined;
const report = section && from ? { ...section, from: `run ${from}` } : section;
const { text, failed, missing } = discoveryMarkdown(report);
process.stdout.write(text);
process.exitCode = missing ? 2 : failed ? 1 : 0;
