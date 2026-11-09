// `pnpm test`: every unit and fixture suite in one run, longest first; file arguments run just those.
import { globSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';

// Files of 90 s or more on an 18-core Mac (2026-11-09), longest first, so none starts near the end; a stale order costs only wall time.
const LONGEST = [
	'e2e/next-app', 'e2e/corpus', 'e2e/vite-site', 'e2e/page-load', 'checker-noise', 'e2e/judge-offline', 'cycles', 'e2e/control-parity', 'e2e/slow-network', 'interaction-quality', 'e2e/original-dataset', 'coverage',
	'e2e/journey-slices', 'e2e/motion', 'e2e/nav-parity', 'e2e/embeds', 'interim-views', 'slow-click', 'memory', 'rapid-journeys', 'dead-controls', 'probes', 'dependent-content', 'keyboard-patterns',
	'e2e/radix-dialog-port', 'e2e/waste', 'journey-cap-revealed', 'journey-keyboard-budget', 'route-coverage', 'unreachable', 'e2e/scroll-and-dialogs', 'state-probe', 'e2e/responsiveness', 'e2e/busy-cpu',
].map((f) => `test/${f}.test.ts`);
const all = [...globSync('test/e2e/*.test.ts').sort(), ...globSync('test/*.test.ts').sort()];
const files = process.argv.length > 2 ? process.argv.slice(2) : [...LONGEST.filter((f) => all.includes(f)), ...all.filter((f) => !LONGEST.includes(f))];
// Half the cores, plus two for the mutation suites that each hold a slot for most of the run while the other files mostly wait on pages.
const concurrency = Number(process.env.TEST_CONCURRENCY) || Math.floor(availableParallelism() / 2) + 2;

const stop = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => stop.abort());

const stream = run({ files, concurrency, signal: stop.signal });
stream.on('test:fail', (event) => {
	if (event.todo === undefined || event.todo === false) process.exitCode = 1;
});
stream.compose(spec).pipe(process.stdout);
