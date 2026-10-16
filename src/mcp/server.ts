import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join } from 'node:path';
import * as z from 'zod';
import { runCheck, writeReport } from '../check/run.ts';
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
			description: 'Load the route on both origins in Chromium (desktop and mobile) and compare HTTP, accessibility tree and text, screenshots, SEO, assets, computed CSS and JavaScript weight. Returns every failure with expected, actual and a likely fix.',
			inputSchema: { old: z.string().url(), new: z.string().url(), route: z.string().startsWith('/') },
		},
		async (args) => {
			const report = await runCheck({ oldOrigin: args.old, newOrigin: args.new, routes: [args.route] });
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
