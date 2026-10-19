import { readOverrides, rulesOff } from '../overrides.ts';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join, resolve } from 'node:path';
import * as z from 'zod';
import { ACCEPTED_FILE, readAccepted } from '../check/accepted.ts';
import { readAuthFile } from '../check/auth.ts';
import { bypassOptions } from '../check/blocked.ts';
import { DATA_DIR } from '../check/data.ts';
import { runCheck, writeReport } from '../check/run.ts';
import { loadSourceFacts } from '../check/source-facts.ts';
import { summarize } from '../check/summary.ts';
import { writeStarterAuth } from '../plan/auth.ts';
import { plan, summarizeInventory, writeInventory } from '../plan/inventory.ts';
import { readInventory, recordResults, STATE_DIR, status, summarizeStatus } from '../status.ts';
import { plannedRoutes } from '../plan/inventory.ts';
import { readSwitched, switchRoute } from '../switch/state.ts';
import { VERSION } from '../version.ts';
import { LIBRARIES_FILE, planLibraries, readLibraries, summarizeParity, writeParity } from '../library/index.ts';
import { guardPages, readAllowances, scanBuild, summarizeBuild } from '../client/index.ts';
import { implementations, planUsage, readUsage, readUsageMap, routeBrief, summarizeUsage } from '../usage/index.ts';

const INSTRUCTIONS = `markless-migrate proves that a route moved to Markless still matches the old app.
Loop: call plan once with the old app's origin and source, convert one route (for its libraries: render the @markless/ui family plan maps, keep framework-agnostic ones as-is, call parity for each one that needs a port), run the new app, call check_route with both origins,
fix every failure it lists, check again until green, then use status to pick the next route. Never edit the old app to make a check pass. Never carry the old framework's runtime markers (hydration flags such as data-has-hydrated, data-reactroot or data-server-rendered, head-manager attributes such as data-rh, data scripts such as __NEXT_DATA__, Astro's component wrapper elements, its generator meta) into the port: give any rule or script that keys off one the port's own condition. Never name anything "islands".
Port every route of the old site: plan lists them all, and a migration that drops routes is not a migration. For a content-driven site (docs, blog, marketing pages from markdown, MDX or a CMS) build the pages from the original content source with one rule-based importer per template, never by hand page by page, and never stop at a sample. check_route checks one route (a partial run); the migration is proven by markless-migrate check without --route, which reports routes ported N of M and lists every missing route.
Implement in Markless every behaviour plan's usage inventory lists for a route (the usage tool), never load or copy another framework's runtime (React, Vue, htmx, Alpine, _hyperscript, jQuery), keep JavaScript-only libraries (Chart.js, Leaflet, Monaco) as they are, and copy the old static assets (CSS, fonts, images, SVG, media) byte for byte; the guard tool checks both.
Never ask the person anything or wait for an approval: every choice has a default (plan decides each library that draws its own UI, check accepts provably harmless differences on its own). A route you cannot make green stays red; go on with the next and list it in your final report.`;

function text(value: string) {
	return { content: [{ type: 'text' as const, text: value }] };
}

export function createServer(cwd: string): McpServer {
	const server = new McpServer({ name: 'markless-migrate', version: VERSION }, { instructions: INSTRUCTIONS });

	server.registerTool(
		'plan',
		{
			title: 'Inventory the old app',
			description: 'Discover the old app\'s routes (sitemap, robots.txt, crawl of same-origin links and hreflang alternates) with their SEO tags, assets and locales, and write .migrate/inventory.json. With source, also inventory every library the old app imports in .migrate/libraries.json: the exact surface used and every usage site, each classified as maps to @markless/ui, use as-is, draws its own UI, or port with the parity tool. For a library that draws its own UI plan decides, from measured rules, whether to port the parts the app uses or use it directly from Markless code, loaded when needed; a framework wrapper is always ported.',
			inputSchema: { old: z.string().url().describe('Origin of the running old app, e.g. http://localhost:3000'), source: z.string().optional().describe('Path to the old app source, to list file routes'), limit: z.number().int().positive().optional().describe('Maximum routes to visit (default 100)'), header: z.array(z.string()).optional().describe('name:value headers sent only to the old app, for example a bot-protection bypass token'), cookie: z.array(z.string()).optional(), userAgent: z.string().optional() },
		},
		async ({ old, source, limit, header, cookie, userAgent }) => {
			const inventory = await plan({ origin: old, source, limit, ...bypassOptions(header, cookie), ...(userAgent ? { userAgent } : {}) });
			const path = await writeInventory(inventory, join(cwd, STATE_DIR));
			const authPath = join(cwd, STATE_DIR, 'auth.json');
			const wroteAuth = inventory.auth ? await writeStarterAuth(authPath, inventory.auth) : false;
			const libraries = inventory.source ? await planLibraries(inventory.source, join(cwd, STATE_DIR), cwd) : undefined;
			const usage = await planUsage({ inventory, stateDir: join(cwd, STATE_DIR), newSource: cwd, ...(libraries ? { libraries: libraries.file } : {}), ...(bypassOptions(header, cookie).headers ? { headers: bypassOptions(header, cookie).headers! } : {}) });
			return text(`${summarizeInventory(inventory)}Wrote ${path}${wroteAuth ? `\nWrote ${authPath}: a starter auth file for check_route's auth argument; the credentials it names must be set in the environment.` : ''}${libraries ? `\n${libraries.text}Wrote ${libraries.path}` : ''}\n${usage.text}Wrote ${usage.paths.usage} and ${usage.paths.obligations}`);
		},
	);

	server.registerTool(
		'check_route',
		{
			title: 'Check one route, old vs new',
			description: 'Load the route on both origins in Chromium (desktop and mobile), with a fixed clock, seeded randomness, a fixed timezone and locale and ad/analytics hosts blocked, and compare HTTP, accessibility tree and text, screenshots, SEO, assets, computed CSS in every state the old CSS styles (with the old rule that set it), fonts, accessibility (axe, focus order, keyboard, landmarks, motion), internationalisation per locale, every replayed interaction, motion (the transitions and animations each interaction, hover and focus starts: element, properties, duration, delay and easing, with motion allowed and with reduced motion, and a filmstrip of each that differs), the network contract (each request the page makes in the browser and, when the server runs the request recorder, while the server renders it: method, URL, body shape, how often, and which response fields the page shows), JavaScript weight, old-framework runtime markers the new page must not carry (hydration flags such as data-has-hydrated, data scripts such as __NEXT_DATA__, the old generator meta), and responsiveness (the first use of each control on a fresh load and the next page of each internal link, old vs new, at desktop speed and with the CPU slowed 4x on a phone-sized page: within max(16 ms, 10%) of old, under 200 ms at 4x, no code fetched on an interaction). Writes (form posts, non-GET requests) are sent only when both origins are on this machine or marked staging; otherwise they are held back and compared as "would POST ...". Writes .migrate/report.html with old/new/diff images. Returns every failure with expected, actual and a likely fix. Differences the evidence proves harmless (the old framework\'s scripts no longer loaded, its own markup such as a route announcer, live content in a third-party embed) are accepted automatically and labelled so; nothing else can be accepted from here.',
			inputSchema: {
				old: z.string().url(),
				new: z.string().url(),
				route: z.string().startsWith('/'),
				staging: z.boolean().optional().describe('Both origins are staging apps with test data, so writes may be sent to them'),
				data: z.enum(['record', 'replay']).optional().describe('record: save what the old app fetched for this route in .migrate/data/; replay: serve that recording to both apps so both see the same data'),
				source: z.string().optional().describe("Path to the old app's source, to find what varies between loads and which handlers write, and the old file and line behind each failing element"),
				new_source: z.string().optional().describe("Path to the new Markless app's source, to name the .tsrx file and line behind each failing element"),
				auth: z.string().optional().describe('Auth file naming roles (login script or storage state each), as plan writes to .migrate/auth.json; the route is checked once per role and once anonymous'),
				header: z.array(z.string()).optional().describe('name:value headers sent only to both apps, for example a bot-protection bypass token'),
				cookie: z.array(z.string()).optional().describe('name=value cookies set on both apps, for example a bot-protection bypass cookie'),
				userAgent: z.string().optional(),
				responsiveness: z.boolean().optional().describe('Time the first use of each control and each internal link (default true); false leaves it out'),
				motion: z.boolean().optional().describe('Compare the transitions and animations each interaction, hover and focus starts, with motion allowed and with reduced motion (default true); false leaves it out'),
			},
		},
		async (args) => {
			const source = args.source ? (await loadSourceFacts(args.source)).facts : undefined;
			const auth = args.auth ? await readAuthFile(args.auth) : undefined;
			const inventory = await readInventory(cwd);
			const report = await runCheck({
				oldOrigin: args.old,
				newOrigin: args.new,
				routes: [args.route],
				...(args.staging ? { staging: { old: true, new: true } } : {}),
				...(args.data ? { data: { mode: args.data, dir: join(cwd, STATE_DIR, DATA_DIR) } } : {}),
				...(source ? { source } : {}),
				...(args.source || args.new_source ? { sourceDirs: { ...(args.source ? { old: resolve(args.source) } : {}), ...(args.new_source ? { new: resolve(args.new_source) } : {}) } } : {}),
				...bypassOptions(args.header, args.cookie),
				...(args.userAgent ? { userAgent: args.userAgent } : {}),
				...(auth ? { auth, authStateDir: join(cwd, STATE_DIR, 'auth') } : {}),
				accepted: await readAccepted(join(cwd, STATE_DIR, ACCEPTED_FILE)),
				automaticOff: rulesOff(await readOverrides(join(cwd, STATE_DIR))),
				...(args.responsiveness === false ? {} : { responsiveness: {} }),
				...(args.motion === false ? {} : { motion: {} }),
				switched: (await readSwitched(cwd)).routes.map((r) => r.route),
				partial: { total: inventory ? plannedRoutes(inventory).length : null },
			});
			await recordResults(cwd, report);
			await writeReport(report, join(cwd, STATE_DIR), await status(cwd));
			const failures = [...report.routes.flatMap((r) => r.failures), ...(report.logins ?? []).flatMap((l) => l.failures)].filter((f) => !f.accepted);
			const blocked = report.routes.flatMap((r) => (r.blocked ? [{ ...(r.role ? { role: r.role } : {}), message: r.blocked.message }] : []));
			const infrastructure = report.routes.flatMap((r) => (r.infrastructure ? [{ route: r.route, ...(r.role ? { role: r.role } : {}), message: r.infrastructure.message }] : []));
			return { ...text(summarize(report)), structuredContent: { ok: report.checkedOk ?? report.ok, failures, ...(blocked.length ? { blocked } : {}), ...(infrastructure.length ? { infrastructure } : {}) } };
		},
	);

	server.registerTool(
		'parity',
		{
			title: 'Scaffold a parity port of one library',
			description: 'For a library plan says needs a port (or a @markless/ui mapping the installed version lacks), write lib/parity/<library>/ in the new app: a skeleton exposing exactly the used surface (same names, props, options and fields read), and behaviour.md/behaviour.json listing what every usage site must do and the recorded journeys that exercise it. Port only that surface, prefer @markless/ui families, never embed React, Vue or Svelte. Existing port files are kept.',
			inputSchema: { library: z.string().describe('The library name as plan lists it, e.g. recharts or @tanstack/react-table'), route: z.array(z.string()).optional().describe('Narrow the port to what these routes render'), new_source: z.string().optional().describe('The Markless app (default: the working directory)') },
		},
		async ({ library, route, new_source }) => {
			const libraries = await readLibraries(join(cwd, STATE_DIR));
			if (!libraries) return text(`No ${join(STATE_DIR, LIBRARIES_FILE)} yet: call plan with source first.`);
			const result = await writeParity(libraries, library, { newApp: resolve(new_source ?? cwd), ...(route?.length ? { routes: route } : {}), journeysDir: join(cwd, STATE_DIR, 'journeys') });
			return { ...text(summarizeParity(result)), structuredContent: { ...result } };
		},
	);

	server.registerTool(
		'usage',
		{
			title: 'What the old site uses in the browser',
			description: 'From plan\'s usage inventory (.migrate/usage.json): every behaviour the old pages use (htmx attributes, Alpine directives, _hyperscript, theme features such as the colour-mode toggle, library components and their props, what each plain script does), whether the new app implements it (declared in .migrate/usage-map.json as { "<behaviour id>": { "by": "<file or @markless/ui family>" } }), and the checks each must pass. With route, only that route\'s behaviours and their checks.',
			inputSchema: { route: z.string().startsWith('/').optional(), new_source: z.string().optional() },
		},
		async ({ route, new_source }) => {
			const usage = await readUsage(join(cwd, STATE_DIR));
			if (!usage) return text('No .migrate/usage.json yet: call plan first.');
			const implemented = await implementations(usage.behaviours, await readUsageMap(join(cwd, STATE_DIR)), resolve(new_source ?? cwd));
			return text(route ? (routeBrief(usage, implemented, route, 60) ?? `Route ${route} uses nothing in the browser that the inventory lists.`) : summarizeUsage(usage, implemented, 20));
		},
	);

	server.registerTool(
		'guard',
		{
			title: 'Static assets byte for byte, no foreign runtime',
			description: 'On a route: every static asset the old page loads (CSS, fonts, images, SVG, media) must load on the new page with the same bytes, every <style> the old page is served with must be kept, inline style attributes must be the same, and every frame and sized element must keep its box within 1 px; the new page may run no other framework\'s runtime. With build, also the new app\'s build output (.output or .vercel/output) is read for another framework\'s or library\'s runtime. What differs between two loads of the old page is left out.',
			inputSchema: { old: z.string().url(), new: z.string().url(), route: z.string().startsWith('/'), build: z.string().optional().describe('Path of the build output to scan, for example .output') },
		},
		async ({ old, new: next, route, build }) => {
			const page = await guardPages({ old, new: next, routes: [route], stateDir: join(cwd, STATE_DIR), allow: await readAllowances(join(cwd, STATE_DIR)) });
			const built = build ? await scanBuild(resolve(cwd, build)) : undefined;
			return { ...text(`${page.text}${built ? summarizeBuild(build!, built) : ''}`), structuredContent: { ok: page.ok && !built?.hits.length, findings: page.findings, ...(built ? { build: built.hits } : {}) } };
		},
	);

	server.registerTool(
		'status',
		{
			title: 'Migration status',
			description: 'List every inventoried route as green, red (with the failing dimensions) or not checked yet.',
			inputSchema: {},
		},
		async () => {
			const s = await status(cwd);
			return { ...text(summarizeStatus(s)), structuredContent: { ...s } };
		},
	);

	server.registerTool(
		'switch_route',
		{
			title: 'Serve a green route from the new app',
			description: 'Add the route to .migrate/switched.json so the proxy and the deploy config serve it from the new app. Refused unless its last check, for every role, is green; a route that is not stays on the old app.',
			inputSchema: { route: z.string().startsWith('/') },
		},
		async ({ route }) => {
			const outcome = await switchRoute(cwd, route);
			return { ...text(outcome.ok ? `Switched ${route} to the new app.` : outcome.reason), structuredContent: { ok: outcome.ok } };
		},
	);

	return server;
}

export async function serveStdio(cwd: string): Promise<void> {
	await createServer(cwd).connect(new StdioServerTransport());
}
