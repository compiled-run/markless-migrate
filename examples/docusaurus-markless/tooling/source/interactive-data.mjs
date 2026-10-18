// Data the showcase filters and the ColorGenerator need in the browser: the showcase's tag keys in the site's own
// order (src/data/users.tsx) and the CSS colour keywords the `color` package parses (its color-name table).
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { resolveSync } from './mdx.mjs';
import { website } from './site.mjs';

export async function writeInteractiveData(app) {
	const users = await import(resolveSync('@site/src/data/users', join(website, 'docusaurus.config.ts')));
	await writeFile(join(app, 'lib/showcase-tags.json'), `${JSON.stringify(users.TagList)}\n`);
	const colorRequire = createRequire(createRequire(join(website, 'package.json')).resolve('color'));
	const names = createRequire(colorRequire.resolve('color-string'))('color-name');
	await writeFile(join(app, 'lib/color-names.json'), `${JSON.stringify(Object.fromEntries(Object.entries(names).map(([name, rgb]) => [name, rgb.slice(0, 3)])))}\n`);
}
