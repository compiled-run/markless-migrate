import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { routeTimeout } from '../src/check/run.ts';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;

export async function connect(cwd: string): Promise<Client> {
	const client = new Client({ name: 'test', version: '0' });
	await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd, stderr: 'pipe' }));
	// A check_route runs under the checker's own route deadline, not the SDK's 60 s default (one call took longer on a 4-vCPU CI runner).
	const call = client.callTool.bind(client);
	client.callTool = (params, schema, options) => call(params, schema, { timeout: routeTimeout({}), ...options });
	return client;
}

export function firstText(result: unknown): string {
	return ((result as { content: { text: string }[] }).content[0]?.text) ?? '';
}
