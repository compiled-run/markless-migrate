import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { applyAllowances, type Allowance } from './allow.ts';
import { capturePage, comparePages, summarizePageFindings, type PageFinding } from './page.ts';

export { ALLOW_FILE, applyAllowances, readAllowances, type Allowance } from './allow.ts';

export { classifyScript, RUNTIME_NAMES, type Runtime } from './classify.ts';
export { foreignRuntimeGuard, scanBuild, summarizeBuild, type RuntimeHit } from './guard.ts';
export { capturePage, comparePages, summarizePageFindings, type PageCapture, type PageFinding } from './page.ts';

export const GUARD_FILE = 'guard.json';

export interface PageGuardResult {
	readonly ok: boolean;
	readonly findings: PageFinding[];
	readonly varied: string[];
	readonly text: string;
}

/** The page guard on each route: the old page loaded twice (what varies between the two is left out), the new page once. */
export async function guardPages(options: { readonly old: string; readonly new: string; readonly routes: readonly string[]; readonly browser?: Browser; readonly headers?: Readonly<Record<string, string>>; readonly stateDir?: string; readonly allow?: readonly Allowance[] }): Promise<PageGuardResult> {
	const browser = options.browser ?? (await chromium.launch());
	let findings: PageFinding[] = [];
	const varied: string[] = [];
	try {
		for (const route of options.routes) {
			const capture = (origin: string) => capturePage(browser, origin, route, options.headers ? { headers: options.headers } : {});
			const old = await capture(options.old);
			const again = await capture(options.old);
			const next = await capture(options.new);
			const result = comparePages(old, again, next);
			findings.push(...result.findings);
			varied.push(...result.varied.map((v) => `${route} ${v}`));
		}
	} finally {
		if (!options.browser) await browser.close();
	}
	findings = applyAllowances(findings, options.allow ?? []);
	if (options.stateDir) {
		await mkdir(options.stateDir, { recursive: true });
		await writeFile(join(options.stateDir, GUARD_FILE), `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), old: options.old, new: options.new, routes: options.routes, findings, varied }, null, '\t')}\n`);
	}
	return { ok: !findings.some((f) => f.red), findings, varied, text: summarizePageFindings(findings, varied) };
}
