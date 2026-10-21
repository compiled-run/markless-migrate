import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { MAX_PORT_SURFACE, PORT_BYTES_PER_NAME, surfaceSize } from '../library/decide.ts';
import { drawsPixels, installedPackage } from '../library/package.ts';
import type { LibrariesFile, LibraryUsage } from '../library/types.ts';
import { newAppImports } from '../usage/implement.ts';
import type { UsageInventory } from '../usage/types.ts';
import { readFamilies } from './families.ts';
import { HEADLESS, overlap, type HeadlessCandidate } from './headless.ts';
import { describePreload, findLateFont, measurePreload, preloadTag, type FontPreloadMeasure, type LateFont } from './fonts.ts';
import type { LoadOptions } from '../check/load.ts';
import { attributor, findControls, firstInteraction, measureLoad, pageButtons, type Interaction, type RouteMeasure, type Subject, type SubjectCost } from './measure.ts';

export { findUi } from './families.ts';

export const UPGRADE_FILE = 'upgrade.json';
export const UPGRADES_DIR = 'upgrades';

export interface Measured {
	/** Summed over the measured routes. */
	readonly bytes: number;
	readonly executed: number;
	readonly cpuMs: number;
	/** Routes where it loads at all. */
	readonly routes: string[];
	/** Slowest first use of one of its own controls at 4x CPU, with the route and the control. */
	readonly latency?: { readonly ms: number | null; readonly route: string; readonly control: string; readonly executed: number; readonly bytes: number };
	readonly scripts: string[];
	/** Not loaded with the page: `latency` is the first use of the page's control that loads it. */
	readonly onDemand?: boolean;
}

export interface Suggestion {
	readonly id: string;
	readonly kind: 'port kept library' | 'swap to @markless/ui' | 'preload LCP font';
	readonly subject: string;
	readonly measured: Measured;
	/** What the site uses of it: exports, members and options from the new app's code, and behaviours from the usage inventory. */
	readonly uses: string[];
	readonly saving: { readonly bytes: number; readonly executed: number; readonly cpuMs: number; readonly basis: string; readonly lcpMs?: number };
	readonly risk: 'low' | 'medium' | 'high';
	readonly riskReason: string;
	readonly size: string;
	readonly verdict: 'suggested' | 'not yet' | 'keep';
	readonly overlap?: HeadlessCandidate;
	/** For a font preload: the font, where it was found late, the tag to add and what Lighthouse measured with and without it. */
	readonly font?: LateFont & { readonly tag: string; readonly routes: readonly string[]; readonly measure: string };
	readonly rank?: number;
}

export interface UpgradeReport {
	readonly version: 1;
	readonly generatedAt: string;
	readonly origin: string;
	readonly routes: readonly string[];
	readonly suggestions: Suggestion[];
	readonly limits: string[];
}

export interface UpgradeOptions {
	readonly origin: string;
	readonly routes: readonly string[];
	readonly newSource: string;
	readonly buildDir: string;
	/** The new app's library scan (scanLibraries on its source): what it imports of each kept library. */
	readonly newLibraries: LibrariesFile;
	/** The old app's library scan (`plan --source`): what the old site used of each headless library. */
	readonly oldLibraries?: LibrariesFile;
	readonly usage?: UsageInventory;
	readonly uiDir?: string;
	readonly browser?: Browser;
	readonly progress?: (line: string) => void;
	/** Look for LCP text whose web font is found late and measure a preload of it with Lighthouse; false leaves it out. */
	readonly fonts?: LoadOptions | false;
	/** Measures one preload; tests replace Lighthouse here. */
	readonly measurePreload?: typeof measurePreload;
}

const SKIP = /^@markless\/|^(nitro|vite|vite-plus|typescript|@types\/.*)$/;

function keptLibraries(file: LibrariesFile): LibraryUsage[] {
	return file.libraries.filter((l) => !SKIP.test(l.name) && !HEADLESS.test(l.name) && l.class !== 'framework' && l.class !== 'drop' && !l.local && !l.name.startsWith('.'));
}

function usesOf(lib: LibraryUsage, usage: UsageInventory | undefined): string[] {
	const out = lib.exports.filter((e) => e.kind !== 'type').map((e) => `${e.name}${e.reads.length ? ` (${e.reads.slice(0, 4).join(', ')})` : ''}${Object.keys(e.options).length ? ` options ${Object.keys(e.options).slice(0, 4).join(', ')}` : ''}`);
	for (const b of usage?.behaviours ?? []) if (b.library === lib.name || b.library === `script → ${lib.name}`) out.push(`old site: ${b.summary}`);
	return out;
}

const sum = (list: readonly SubjectCost[]) => ({ bytes: list.reduce((n, c) => n + c.bytes, 0), executed: list.reduce((n, c) => n + c.executed, 0), cpuMs: list.reduce((n, c) => n + c.cpuMs, 0) });

/** Measures every kept library and every ported headless library on the migrated site, and ranks what would be worth porting or swapping. Nothing is applied. */
export async function upgrade(options: UpgradeOptions): Promise<UpgradeReport> {
	const say = options.progress ?? (() => {});
	const limits: string[] = [];
	const kept = keptLibraries(options.newLibraries);
	const imports = await newAppImports(options.newSource);
	const families = options.uiDir ? await readFamilies(options.uiDir) : new Map();
	if (!options.uiDir) limits.push('@markless/ui not found (pass --ui <dir> or install it in the new app): no swaps were compared');
	const candidates: HeadlessCandidate[] = [];
	for (const lib of options.oldLibraries?.libraries ?? []) {
		if (!HEADLESS.test(lib.name) || lib.class === 'drop' || !families.size) continue;
		candidates.push(await overlap(lib, families, { newSource: options.newSource, oldSource: options.oldLibraries!.source, imports }));
	}
	if (!options.oldLibraries) limits.push('no .migrate/libraries.json from plan --source: headless libraries the old site used were not compared');
	const subjects: Subject[] = [
		...kept.map((l) => ({ id: l.name, kind: 'kept library' as const, package: l.name })),
		...candidates.filter((c) => c.status === 'ported').map((c) => ({ id: c.library, kind: 'ported headless' as const, port: c.port!, ...(c.control ? { control: c.control } : {}) })),
	];
	const attribute = await attributor(options.newSource, subjects, options.buildDir);
	const browser = options.browser ?? (await chromium.launch());
	const measures: RouteMeasure[] = [];
	const onDemand = new Map<string, { route: string; control: string } & Interaction>();
	const fontMeasures: { measure: FontPreloadMeasure; routes: string[] }[] = [];
	try {
		for (const route of options.routes) {
			say(`measuring ${route} at 4x CPU`);
			const costs = await measureLoad(browser, options.origin, route, subjects, attribute).catch((error: Error) => {
				limits.push(`${route}: not measured (${error.message.split('\n')[0]})`);
				return undefined;
			});
			if (!costs) continue;
			const latency: Record<string, ({ control: string } & Interaction) | undefined> = {};
			for (const s of subjects) {
				if (!costs[s.id]?.scripts.length) continue;
				const controls = await findControls(browser, options.origin, route, s, attribute).catch(() => []);
				for (const control of controls) {
					const used = await firstInteraction(browser, options.origin, route, control, attribute).catch(() => undefined);
					if (!used) continue;
					const mine = used.cost.get(s.id) ?? { executed: 0, bytes: 0 };
					if (!latency[s.id] || (used.ms ?? 0) > (latency[s.id]!.ms ?? 0)) latency[s.id] = { control, ms: used.ms, ...mine };
				}
			}
			// A kept library the page does not load at once: the first control whose use loads it, and what that use costs.
			const waiting = subjects.filter((s) => s.kind === 'kept library' && !costs[s.id]?.scripts.length && !onDemand.has(s.id));
			if (waiting.length) {
				for (const control of await pageButtons(browser, options.origin, route).catch(() => [])) {
					const used = await firstInteraction(browser, options.origin, route, control, attribute).catch(() => undefined);
					for (const s of waiting) {
						const mine = used?.cost.get(s.id);
						if (!used || !mine || (!mine.bytes && !mine.executed) || onDemand.has(s.id)) continue;
						onDemand.set(s.id, { route, control, ms: used.ms, ...mine });
					}
					if (waiting.every((s) => onDemand.has(s.id))) break;
				}
			}
			measures.push({ route, costs, latency });
		}
		if (options.fonts !== false) {
			const seen = new Map<string, { font: LateFont; routes: string[] }>();
			for (const route of options.routes) {
				const found = await findLateFont(browser, options.origin, route).catch((error: Error) => ({ none: `not loaded (${error.message.split('\n')[0]})` }));
				if ('none' in found) {
					limits.push(`${route}: no font preload to suggest: ${found.none}`);
					continue;
				}
				const known = seen.get(found.late.href);
				if (known) known.routes.push(route);
				else seen.set(found.late.href, { font: found.late, routes: [route] });
			}
			for (const { font, routes } of seen.values()) {
				say(`measuring a preload of ${font.href} on ${font.route} with Lighthouse`);
				fontMeasures.push({ measure: await (options.measurePreload ?? measurePreload)(options.origin, font, options.fonts ?? {}), routes });
			}
		}
	} finally {
		if (!options.browser) await browser.close();
	}
	const measuredOf = (id: string): Measured => {
		const here = measures.filter((m) => m.costs[id]?.scripts.length);
		const total = sum(here.map((m) => m.costs[id]!));
		const slow = here.map((m) => (m.latency[id] ? { ...m.latency[id]!, route: m.route } : undefined)).filter((x) => x).sort((a, b) => (b!.ms ?? 0) - (a!.ms ?? 0))[0] ?? onDemand.get(id);
		return { ...total, routes: here.map((m) => m.route), ...(slow ? { latency: slow } : {}), ...(onDemand.has(id) ? { onDemand: true } : {}), scripts: [...new Set(here.flatMap((m) => m.costs[id]!.scripts))] };
	};
	const suggestions: Suggestion[] = [];
	for (const lib of kept) {
		const measured = measuredOf(lib.name);
		const names = Math.max(surfaceSize(lib), lib.exports.filter((e) => e.kind !== 'type').length);
		const port = names * PORT_BYTES_PER_NAME;
		const pkg = await installedPackage(options.newSource, lib.name);
		const draws = pkg ? await drawsPixels(pkg) : undefined;
		const cost = measured.bytes + (measured.onDemand ? (measured.latency?.bytes ?? 0) : 0);
		const ratio = cost ? Math.max(0, 1 - port / cost) : 0;
		const risk: Suggestion['risk'] = draws ? 'high' : names > MAX_PORT_SURFACE ? 'high' : names > 30 ? 'medium' : 'low';
		const riskReason = draws ? `it draws into ${draws === 'webgl' ? 'WebGL' : 'a canvas'}: check compares only its pixels, so a port is hard to prove` : names > MAX_PORT_SURFACE ? `the app uses ${names} of its names, more than a faithful port covers (${MAX_PORT_SURFACE})` : `the app uses ${names} of its names`;
		const loaded = measured.routes.length > 0 || Boolean(measured.onDemand);
		suggestions.push({
			id: `port:${lib.name}`,
			kind: 'port kept library',
			subject: lib.name,
			measured,
			uses: usesOf(lib, options.usage),
			saving: { bytes: Math.max(0, cost - port), executed: Math.round((measured.executed + (measured.latency?.executed ?? 0)) * ratio), cpuMs: Math.round(measured.cpuMs * ratio * 10) / 10, basis: `a port of the ${names} used names at about ${PORT_BYTES_PER_NAME} bytes each (${Math.round(port / 1024)} KB), against what the library costs now` },
			risk,
			riskReason,
			size: `${names} used names, about ${Math.round(port / 1024)} KB of Markless code`,
			verdict: loaded && cost > port ? 'suggested' : 'keep',
		});
	}
	for (const c of candidates) if (c.status === 'markless-ui' && c.missing.length) limits.push(`${c.library}: already on @markless/ui ${c.family}, which lacks what the site used: ${c.missing.join('; ')}`);
	for (const c of candidates) if (c.verdict === 'no family' && c.status === 'ported') limits.push(`${c.library} (${c.port}): no @markless/ui family does its job, so there is no swap to compare`);
	for (const c of candidates) {
		if (c.status !== 'ported' || c.verdict === 'no family') continue;
		const measured = measuredOf(c.library);
		const familyBytes = c.familySourceBytes ?? 0;
		suggestions.push({
			id: `swap:${c.library}`,
			kind: 'swap to @markless/ui',
			subject: `${c.library} (${c.port}) -> @markless/ui ${c.family}`,
			measured,
			uses: c.rows.map((r) => `${r.kind} ${r.used}`),
			saving: { bytes: Math.max(0, measured.bytes - familyBytes), executed: 0, cpuMs: 0, basis: `the port as measured, against the family's whole source (${Math.round(familyBytes / 1024)} KB, an upper bound; less once minified, nothing more when the app already loads the family); load-time JS and latency are measured for the port only` },
			risk: c.missing.length ? 'high' : 'low',
			riskReason: c.missing.length ? `the family lacks ${c.missing.length} feature(s) the site uses` : 'every feature the site uses is covered; the family has its own conformance and screen-reader suites',
			size: `replace ${c.port} with ${c.rows.filter((r) => r.kind === 'part').length} @markless/ui ${c.family} parts`,
			verdict: c.verdict === 'swap' ? 'suggested' : 'not yet',
			overlap: c,
		});
	}
	for (const { measure: m, routes } of fontMeasures) {
		const f = m.font;
		const helps = m.significant && m.lcpSavingMs > 0 && !m.fcpWorse;
		suggestions.push({
			id: `preload-font:${f.href}`,
			kind: 'preload LCP font',
			subject: `preload ${f.family} (${f.href}), the font of the largest text on ${routes.join(', ')}`,
			measured: { bytes: 0, executed: 0, cpuMs: 0, routes, scripts: [] },
			uses: [`${f.element} paints with ${f.family} (font-display: ${f.display}); the page asks for ${f.href} at ${f.requestedAt} ms, after ${f.stylesheet} arrived at ${f.stylesheetAt} ms, and nothing preloads it`],
			saving: { bytes: 0, executed: 0, cpuMs: 0, lcpMs: m.lcpSavingMs, basis: describePreload(m) },
			risk: 'low',
			riskReason: 'the same font file, requested earlier: nothing a visitor sees changes but when the text paints',
			size: `one <link> in the head of the document that renders ${routes.length === 1 ? 'this page' : 'these pages'}`,
			verdict: helps ? 'suggested' : 'keep',
			font: { ...f, tag: preloadTag(f), routes, measure: describePreload(m) },
		});
		if (!helps) limits.push(`${f.href}: not suggested: ${m.fcpWorse ? 'the preload delays the first paint' : `a preload did not paint ${f.element} sooner beyond noise`} (${describePreload(m)})`);
	}
	const ranked = suggestions.filter((s) => s.verdict === 'suggested').sort((a, b) => (b.saving.lcpMs ?? 0) - (a.saving.lcpMs ?? 0) || b.saving.executed - a.saving.executed || b.saving.bytes - a.saving.bytes || (b.measured.latency?.ms ?? 0) - (a.measured.latency?.ms ?? 0));
	const order = new Map(ranked.map((s, i) => [s.id, i + 1]));
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		origin: options.origin,
		routes: options.routes,
		suggestions: suggestions.map((s) => (order.has(s.id) ? { ...s, rank: order.get(s.id)! } : s)).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.id.localeCompare(b.id)),
		limits,
	};
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
const ms = (n: number | null | undefined) => (n === null ? 'under 16 ms' : n === undefined ? '-' : `${Math.round(n)} ms`);

export function summarizeUpgrade(report: UpgradeReport): string {
	const lines = [`Upgrade suggestions for ${report.origin}, measured on ${report.routes.length} route(s) at 4x CPU on a phone-sized page (font preloads with Lighthouse mobile). Nothing is applied; accept one with markless-migrate upgrade accept <id>.`];
	const block = (s: Suggestion) => {
		const m = s.measured;
		lines.push('', `${s.rank ? `#${s.rank} ` : ''}[${s.verdict}] ${s.id}: ${s.subject}`);
		if (s.font) {
			lines.push(`  found: ${s.uses[0]}`, `  measured: ${s.font.measure} (PageSpeed-equivalent, lab, calibrated)`, `  PageSpeed Insights: cannot reach the page with the preload before it is deployed; once it is, check --only load measures the saving on PageSpeed Insights`, `  add: ${s.font.tag}`, `  risk: ${s.risk} (${s.riskReason}); size: ${s.size}`);
			return;
		}
		const use = m.latency ? `${m.onDemand ? 'not loaded with the page; the first use of the control that loads it' : 'first interaction with its own control'} takes ${ms(m.latency.ms)}, running ${kb(m.latency.executed)} of its code and fetching ${kb(m.latency.bytes)} (${m.latency.route}, ${m.latency.control.slice(-60)})` : 'no control that uses it found on these routes';
		lines.push(`  measured: ${kb(m.bytes)} downloaded, ${kb(m.executed)} JS run at load, ${m.cpuMs.toFixed(1)} ms main-thread at load, on ${m.routes.length} route(s); ${use}`);
		lines.push(`  expected saving: ${kb(s.saving.bytes)} downloaded, ${kb(s.saving.executed)} run at load, ${s.saving.cpuMs} ms main-thread (${s.saving.basis})`);
		lines.push(`  risk: ${s.risk} (${s.riskReason}); size: ${s.size}`);
		if (s.overlap) {
			lines.push(`  overlap (what the site uses -> @markless/ui ${s.overlap.family}):`);
			for (const r of s.overlap.rows) lines.push(`    ${r.family ? 'covered' : 'MISSING'}  ${r.kind.padEnd(9)} ${r.used}${r.family ? ` -> ${r.family}` : ''}`);
			if (s.overlap.missing.length) lines.push(`  not yet: missing ${s.overlap.missing.join('; ')}`);
		} else if (s.uses.length) lines.push(`  uses: ${s.uses.slice(0, 8).join('; ')}${s.uses.length > 8 ? `; ${s.uses.length - 8} more` : ''}`);
	};
	for (const s of report.suggestions) block(s);
	lines.push('', 'An accepted entry runs through the same pipeline: the port or swap is checked against the pre-upgrade version of this site (markless-migrate check --old <pre-upgrade> --new <upgraded>) and must pass every check the migration passed.');
	for (const l of report.limits) lines.push(`Limit: ${l}`);
	return `${lines.join('\n')}\n`;
}

export async function writeUpgrade(report: UpgradeReport, stateDir: string): Promise<string> {
	await mkdir(stateDir, { recursive: true });
	const path = join(stateDir, UPGRADE_FILE);
	await writeFile(path, `${JSON.stringify(report, null, '\t')}\n`);
	return path;
}

/** Accepting writes the agent's task: what to build, what it must keep doing, and the check against the pre-upgrade version. It applies nothing. */
export async function acceptUpgrade(stateDir: string, id: string, baseline: string | undefined): Promise<string> {
	const report = JSON.parse(await readFile(join(stateDir, UPGRADE_FILE), 'utf8')) as UpgradeReport;
	const s = report.suggestions.find((x) => x.id === id);
	if (!s) throw new Error(`no suggestion ${id} in ${join(stateDir, UPGRADE_FILE)}; ids: ${report.suggestions.map((x) => x.id).join(', ')}`);
	if (s.verdict === 'not yet') throw new Error(`${id} is not yet possible: ${s.overlap?.missing.join('; ')}`);
	const dir = join(stateDir, UPGRADES_DIR);
	await mkdir(dir, { recursive: true });
	const file = join(dir, `${id.replace(/[^a-z0-9]+/gi, '-')}.md`);
	const old = baseline ?? '<the pre-upgrade build of this site, served as it is now>';
	const body = s.font ? fontTask(s, old) : [
		`# Upgrade task: ${s.subject}`,
		'',
		s.kind === 'swap to @markless/ui' ? `Replace ${s.overlap?.port} with the @markless/ui ${s.overlap?.family} parts, part for part:` : `Replace ${s.subject} with Markless code that does exactly what this site uses of it:`,
		'',
		...(s.overlap ? s.overlap.rows.map((r) => `- ${r.kind} \`${r.used}\` -> ${r.family}`) : s.uses.map((u) => `- ${u}`)),
		'',
		`Measured now: ${kb(s.measured.bytes)} downloaded, ${kb(s.measured.executed)} run at load, ${s.measured.cpuMs.toFixed(1)} ms main-thread at load (4x CPU), on ${s.measured.routes.join(', ') || 'no measured route'}.`,
		`Expected saving: ${kb(s.saving.bytes)} downloaded, ${kb(s.saving.executed)} run at load. Risk: ${s.risk} (${s.riskReason}).`,
		'',
		'Done means, with nothing weakened:',
		`- \`markless-migrate check --old ${old} --new <this app, upgraded> --all\` is green on every route: the upgrade changes nothing a visitor can see or do.`,
		'- `markless-migrate guard build` and `markless-migrate guard page` pass.',
		`- \`markless-migrate upgrade --new <this app, upgraded>\` measures less than the numbers above on the same routes.`,
	].join('\n');
	await writeFile(file, `${body}\n`);
	await writeFile(join(stateDir, UPGRADE_FILE), `${JSON.stringify({ ...report, accepted: [...((report as { accepted?: string[] }).accepted ?? []), id] }, null, '\t')}\n`);
	return file;
}

function fontTask(s: Suggestion, old: string): string {
	const f = s.font!;
	return [
		`# Upgrade task: ${s.subject}`,
		'',
		`The largest text on ${f.routes.join(', ')}, ${f.element}, paints with ${f.family} (font-display: ${f.display}). The page asks for ${f.href} only once ${f.stylesheet} has arrived and been parsed (${f.requestedAt} ms against ${f.stylesheetAt} ms at full speed), and nothing preloads it, so the text waits a round trip for its font.`,
		'',
		`Add this to the <head> of the document that renders ${f.routes.length === 1 ? 'that page' : 'those pages'}, as early as you can after <meta charset> (in the Markless app: the document or layout .tsrx; only on the pages listed, not on pages whose largest text uses another font):`,
		'',
		`    ${f.tag}`,
		'',
		'Keep `crossorigin`: fonts are always fetched in CORS mode, and a preload without it is fetched twice. Do not change the font file, its @font-face or its font-display.',
		'',
		`Measured now, PageSpeed-equivalent (lab, calibrated): ${f.measure}. PageSpeed Insights cannot reach the page with the preload until it is deployed: then \`check --old <this app before the change> --new <this app, upgraded> --route ${f.route} --only load\` measures it there.`,
		'',
		'Done means, with nothing weakened:',
		`- \`markless-migrate check --old ${old} --new <this app, upgraded> --all\` is green on every route that was green: the preload changes nothing a visitor can see or do.`,
		'- `markless-migrate guard build` and `markless-migrate guard page` pass.',
		`- \`markless-migrate upgrade --new <this app, upgraded> --route ${f.route}\` no longer finds ${f.href} late, and \`markless-migrate check --old <this app before the change> --new <this app, upgraded> --route ${f.route} --only load\` shows the LCP no later.`,
	].join('\n');
}
