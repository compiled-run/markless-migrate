// node test/upstream/day-picker-run.ts <react-day-picker checkout> <origin> <out.json> [repeat]
import { runShim } from './day-picker-shim.ts';

const [checkout, origin, out, repeat] = process.argv.slice(2);
if (!checkout || !origin || !out) throw new Error('usage: day-picker-run.ts <checkout> <origin> <out.json> [repeat]');
await runShim(checkout, origin, out, Number(repeat ?? 1));
