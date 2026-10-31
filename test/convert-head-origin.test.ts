import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { HEAD_HELPER } from '../src/convert/document.ts';

const heads = `export const TAGS = [{ tag: 'meta', attrs: { property: 'og:url', content: 'http://localhost:4000/docs' }, self: { content: '/docs' } }];
export const ROUTES = { '/docs': { html: {}, body: {}, tags: [0] } };
`;

async function headOf(appUrl: string | undefined) {
	const dir = await mkdtemp(join(tmpdir(), 'mm-head-'));
	await writeFile(join(dir, 'heads.ts'), heads);
	await writeFile(join(dir, 'head.ts'), HEAD_HELPER.replace('import.meta.env.VITE_APP_URL', JSON.stringify(appUrl ?? '')));
	const module = (await import(join(dir, 'head.ts'))) as { headOf: (page: { href: string }) => { tags: { a: Record<string, string> }[] } };
	await rm(dir, { recursive: true, force: true });
	return module.headOf;
}

test("a page's own URLs in its head name the site's public origin, not the prerender server's", async () => {
	const built = await headOf('https://ui.example.dev');
	assert.equal(built({ href: 'http://127.0.0.1:33639/docs' }).tags[0]!.a.content, 'https://ui.example.dev/docs');
	const local = await headOf(undefined);
	assert.equal(local({ href: 'http://localhost:3000/docs' }).tags[0]!.a.content, 'http://localhost:3000/docs', 'without one, the request origin');
});
