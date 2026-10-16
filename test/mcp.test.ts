import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { connect } from './mcp-client.ts';

test('the MCP server lists plan, check_route and status, with instructions for the agent', async () => {
	const client = await connect(await mkdtemp(join(tmpdir(), 'mm-mcp-')));
	try {
		const { tools } = await client.listTools();
		assert.deepEqual(tools.map((t) => t.name).sort(), ['check_route', 'plan', 'status', 'switch_route']);
		assert.deepEqual(Object.keys(tools.find((t) => t.name === 'check_route')!.inputSchema.properties ?? {}).sort(), ['auth', 'cookie', 'data', 'header', 'new', 'new_source', 'old', 'route', 'source', 'staging', 'userAgent']);
		assert.match(client.getInstructions() ?? '', /check_route/);
	} finally {
		await client.close();
	}
});

test('status reports no inventory, then lists inventoried and checked routes', async () => {
	const cwd = await mkdtemp(join(tmpdir(), 'mm-mcp-'));
	const client = await connect(cwd);
	try {
		const empty = await client.callTool({ name: 'status', arguments: {} });
		assert.match((empty.content as { text: string }[])[0]!.text, /No inventory yet/);
		await mkdir(join(cwd, '.migrate'));
		await writeFile(join(cwd, '.migrate', 'inventory.json'), JSON.stringify({ routes: [{ route: '/' }, { route: '/about' }] }));
		await writeFile(join(cwd, '.migrate', 'results.json'), JSON.stringify({ '/about': { route: '/about', ok: false, red: ['seo'], checkedAt: 'x' } }));
		const listed = await client.callTool({ name: 'status', arguments: {} });
		const text = (listed.content as { text: string }[])[0]!.text;
		assert.match(text, /0 green, 1 red, 1 not checked/);
		assert.match(text, /red +\/about +\[seo\]/);
		assert.match(text, /unchecked +\//);
		const refused = await client.callTool({ name: 'switch_route', arguments: { route: '/about' } });
		assert.deepEqual(refused.structuredContent, { ok: false });
		assert.match((refused.content as { text: string }[])[0]!.text, /last check is not green \(\/about: red \[seo\]\)/);
	} finally {
		await client.close();
	}
});

test('check_route rejects a route that is not a path', async () => {
	const client = await connect(await mkdtemp(join(tmpdir(), 'mm-mcp-')));
	try {
		const result = await client.callTool({ name: 'check_route', arguments: { old: 'http://127.0.0.1:1', new: 'http://127.0.0.1:2', route: 'about' } });
		assert.equal(result.isError, true);
	} finally {
		await client.close();
	}
});
