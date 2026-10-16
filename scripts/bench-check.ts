// Times `check` of the Vite fixture's routes against a rebuild, one route at a time and with --concurrency: node scripts/bench-check.ts [n...]
import { availableParallelism } from 'node:os';
import { startCms } from '../fixtures/cms/server.ts';
import { runCheck } from '../src/check/run.ts';
import { buildVite, startStatic } from '../test/e2e/harness.ts';

const ROUTES = ['/', '/about/', '/fr/', '/ar/', '/old-about', '/missing', '/feed.xml', '/robots.txt', '/manifest.json', '/sitemap.xml'];
const levels = process.argv.slice(2).map(Number).filter((n) => n > 0);
const cms = await startCms();
const [a, b] = await Promise.all([buildVite('bench-old'), buildVite('bench-new')]);
const [old, next] = await Promise.all([startStatic(a, cms.origin), startStatic(b, cms.origin)]);
try {
	process.stdout.write(`${ROUTES.length} routes, ${availableParallelism()} cores\n`);
	for (const concurrency of levels.length ? levels : [1, 4]) {
		const started = performance.now();
		const report = await runCheck({ oldOrigin: old.origin, newOrigin: next.origin, routes: ROUTES, concurrency });
		process.stdout.write(`concurrency ${concurrency}: ${((performance.now() - started) / 1000).toFixed(1)} s, ${report.routes.filter((r) => r.ok).length} of ${report.routes.length} green\n`);
	}
} finally {
	await Promise.all([old.stop(), next.stop()]);
	await cms.stop();
}
