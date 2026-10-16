import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const CLI = new URL('../src/cli.ts', import.meta.url).pathname;

export async function connect(cwd: string): Promise<Client> {
	const client = new Client({ name: 'test', version: '0' });
	await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd, stderr: 'pipe' }));
	return client;
}

export function firstText(result: unknown): string {
	return ((result as { content: { text: string }[] }).content[0]?.text) ?? '';
}
