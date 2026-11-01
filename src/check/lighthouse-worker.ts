// Lighthouse's trace engine never clears its per-trace cache (StackTraceForEvent), so each run lives in its own worker.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import lighthouse from 'lighthouse';
import { throttling } from 'lighthouse/core/config/constants.js';
import { cpuMultiplier, type LighthouseJob } from './load.ts';

async function run({ url, port, blocked, cpu, throttle }: LighthouseJob): Promise<unknown> {
	const flags = { port, output: 'json' as const, onlyCategories: ['performance'], logLevel: 'error' as const, blockedUrlPatterns: [...blocked] };
	if (cpu !== 'calibrated') {
		// Throttled for real, not simulated: on a loopback load the fonts and images race the first paint, and the simulation adds
		// each one that won to the paint it predicts, so the same page's first paint landed at 2.0, 2.4, 2.6, 2.9 or 3.0 s by chance.
		const result = await lighthouse(url, { ...flags, throttlingMethod: throttle === 'applied' ? 'devtools' : 'simulate', throttling: { ...throttling.mobileSlow4G, cpuSlowdownMultiplier: cpu } });
		if (!result) throw new Error('Lighthouse returned no result');
		return result.lhr;
	}
	// The simulation runs when the artifacts are audited, so the load is gathered once and simulated at the slowdown its own benchmarkIndex calls for.
	const dir = await mkdtemp(join(tmpdir(), 'markless-migrate-lhr-'));
	try {
		await lighthouse(url, { ...flags, gatherMode: dir });
		const file = join(dir, 'artifacts.json');
		const artifacts = JSON.parse(await readFile(file, 'utf8')) as { BenchmarkIndex?: number; settings?: { throttlingMethod?: string; throttling?: Record<string, number> } };
		const multiplier = artifacts.BenchmarkIndex ? cpuMultiplier(artifacts.BenchmarkIndex) : throttling.mobileSlow4G.cpuSlowdownMultiplier;
		// With simulated throttling the gather never slows the CPU, so the saved settings may name the slowdown the audit simulates.
		if (artifacts.settings?.throttlingMethod !== 'simulate') throw new Error(`Lighthouse gathered with ${artifacts.settings?.throttlingMethod} throttling; a calibrated run needs simulate`);
		artifacts.settings.throttling = { ...artifacts.settings.throttling, cpuSlowdownMultiplier: multiplier };
		await writeFile(file, JSON.stringify(artifacts));
		const result = await lighthouse(url, { ...flags, auditMode: dir, throttling: { ...throttling.mobileSlow4G, cpuSlowdownMultiplier: multiplier } });
		if (!result) throw new Error('Lighthouse returned no result');
		return result.lhr;
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

parentPort!.postMessage(await run(workerData as LighthouseJob).then((lhr) => ({ lhr }), (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })));
