// The pipeline's dead-controls job: prints the convert report's dead controls as the job summary, and fails when there are
// any (or when the convert did not look). Build, check and deploy do not wait on it: the run is red, the port still ships.
//   node scripts/dead-controls.ts <convert report.json>
import { readFile } from 'node:fs/promises';
import { discoveryMarkdown, type DiscoveryReport } from '../src/discover/report.ts';

const [file] = process.argv.slice(2);
if (!file) throw new Error('usage: dead-controls.ts <convert report.json>');
const report = await readFile(file, 'utf8').then((t) => (JSON.parse(t) as { deadControls?: DiscoveryReport }).deadControls, () => undefined);
const { text, failed } = discoveryMarkdown(report);
process.stdout.write(text);
process.exitCode = failed ? 1 : 0;
