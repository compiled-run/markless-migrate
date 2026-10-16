import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join } from 'node:path';
import * as z from 'zod';
import { DATA_DIR } from '../check/data.ts';
import { runCheck, writeReport } from '../check/run.ts';
import { loadSourceFacts } from '../check/source-facts.ts';
import { summarize } from '../check/summary.ts';
import { plan, summarizeInventory, writeInventory } from '../plan/inventory.ts';
import { recordResults, STATE_DIR, status, summarizeStatus } from '../status.ts';
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
			inputSchema: { old: z.string().url().describe('Origin of the running old app, e.g. http://localhost:3000'), source: z.string().optional().describe('Path to the old app source, to list file routes'), limit: z.number().int().positive().optional().describe('Maximum routes to visit (default 100)') },
		},
		async ({ old, source, limit }) => {
			const inventory = await plan({ origin: old, source, limit });
			const path = await writeInventory(inventory, join(cwd, STATE_DIR));
			return text(`${summarizeInventory(inventory)}Wrote ${path}`);
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
				source: z.string().optional().describe("Path to the old app's source, to find what varies between loads and which handlers write"),
			},
		},
		async (args) => {
			const source = args.source ? (await loadSourceFacts(args.source)).facts : undefined;
			const report = await runCheck({
				oldOrigin: args.old,
				newOrigin: args.new,
				routes: [args.route],
				...(args.staging ? { staging: { old: true, new: true } } : {}),
				...(args.data ? { data: { mode: args.data, dir: join(cwd, STATE_DIR, DATA_DIR) } } : {}),
				...(source ? { source } : {}),
			});
			await writeReport(report, join(cwd, STATE_DIR));
			await recordResults(cwd, report);
			const failures = report.routes.flatMap((r) => r.failures);
			return { ...text(summarize(report)), structuredContent: { ok: report.ok, failures } };
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

	return server;
}

export async function serveStdio(cwd: string): Promise<void> {
	await createServer(cwd).connect(new StdioServerTransport());
}
