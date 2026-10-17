import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { scanSource } from '../src/source/index.ts';
import { view } from './source/view.ts';

test('a proxy exporting NextAuth(config).auth is a guard on the paths its authorized callback tests, denied to pages.signIn', async () => {
	const facts = view(await scanSource(join(import.meta.dirname, 'source-fixtures', 'next-authjs')));
	assert.deepEqual(facts.guards, ['signed-in NextAuth callbacks.authorized (auth.config.ts:7) routes=/dashboard login=/login proxy.ts:4']);
});
