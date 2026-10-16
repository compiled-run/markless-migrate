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
import { recordResults, STATE_DIR, status, summarizeStatus } from '../status.ts';
import { switchRoute } from '../switch/state.ts';
import { VERSION } from '../version.ts';

const INSTRUCTIONS = `markless-migrate proves that a route moved to Markless still matches the old app.
Loop: call plan once with the old app's origin, convert one route, run the new app, call check_route with both origins,
fix every failure it lists, check again until green, then use status to pick the next route. Never edit the old app to make a check pass.`;

function text(value: string) {
	return { content: [{ type: 'text' as const, text: value }] };
}

export function createServer(cwd: string): McpServer {
	const server = new McpServer({ name: 'markless-migrate', version: VERSION }, { instructions: INSTRUCTIONS });

	server.registerTool(
		'plan',
		{
			title: 'Inventory the old app',
			description: 'Discover the old app\'s routes (sitemap, robots.txt, crawl of same-origin links and hreflang alternates) with their SEO tags, assets and locales, and write .migrate/inventory.json.',
			inputSchema: { old: z.string().url().describe('Origin of the running old app, e.g. http://localhost:3000'), source: z.string().optional().describe('Path to the old app source, to list file routes'), limit: z.number().int().positive().optional().describe('Maximum routes to visit (default 100)'), header: z.array(z.string()).optional().describe('name:value headers sent only to the old app, for example a bot-protection bypass token'), cookie: z.array(z.string()).optional(), userAgent: z.string().optional() },
		},
		async ({ old, source, limit, header, cookie, userAgent }) => {
			const inventory = await plan({ origin: old, source, limit, ...bypassOptions(header, cookie), ...(userAgent ? { userAgent } : {}) });
			const path = await writeInventory(inventory, join(cwd, STATE_DIR));
			const authPath = join(cwd, STATE_DIR, 'auth.json');
			const wroteAuth = inventory.auth ? await writeStarterAuth(authPath, inventory.auth) : false;
			return text(`${summarizeInventory(inventory)}Wrote ${path}${wroteAuth ? `\nWrote ${authPath}: a starter auth file for check_route's auth argument; the credentials it names must be set in the environment.` : ''}`);
		},
	);

	server.registerTool(
		'check_route',
		{
			title: 'Check one route, old vs new',
			description: 'Load the route on both origins in Chromium (desktop and mobile), with a fixed clock, seeded randomness, a fixed timezone and locale and ad/analytics hosts blocked, and compare HTTP, accessibility tree and text, screenshots, SEO, assets, computed CSS in every state the old CSS styles (with the old rule that set it), fonts, accessibility (axe, focus order, keyboard, landmarks, motion), internationalisation per locale, every replayed interaction, the network contract (each request the page makes in the browser and, when the server runs the request recorder, while the server renders it: method, URL, body shape, how often, and which response fields the page shows), and JavaScript weight. Writes (form posts, non-GET requests) are sent only when both origins are on this machine or marked staging; otherwise they are held back and compared as "would POST ...". Writes .migrate/report.html with old/new/diff images. Returns every failure with expected, actual and a likely fix.',
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
			},
		},
		async (args) => {
			const source = args.source ? (await loadSourceFacts(args.source)).facts : undefined;
			const auth = args.auth ? await readAuthFile(args.auth) : undefined;
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
			});
			await writeReport(report, join(cwd, STATE_DIR));
			await recordResults(cwd, report);
			const failures = [...report.routes.flatMap((r) => r.failures), ...(report.logins ?? []).flatMap((l) => l.failures)].filter((f) => !f.accepted);
			const blocked = report.routes.flatMap((r) => (r.blocked ? [{ ...(r.role ? { role: r.role } : {}), message: r.blocked.message }] : []));
			return { ...text(summarize(report)), structuredContent: { ok: report.ok, failures, ...(blocked.length ? { blocked } : {}) } };
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
			description: 'Add the route to .migrate/switched.json so the proxy and the deploy config serve it from the new app. Refused unless its last check, for every role, is green; only a human may force a route that is not.',
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
