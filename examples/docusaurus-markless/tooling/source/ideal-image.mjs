// What `require('./image.png')` is in the site's components and MDX JSX: the ideal-image plugin's module (a
// responsive image set and a blurred placeholder), made by the plugin's own loaders, with its files copied too.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { website } from './site.mjs';
import { emitted } from './assets.mjs';

const cache = join(import.meta.dirname, '../.cache/ideal-img');
export const idealFiles = new Map();
let options = { quality: 70, max: 1030, min: 640, steps: 2 };
export function setIdealImageOptions(next) {
	options = next;
}

export function idealImage(path) {
	const key = createHash('sha1').update(readFileSync(path)).update(JSON.stringify(options)).digest('hex');
	const file = join(cache, `${key}.json`);
	if (!existsSync(file)) {
		mkdirSync(cache, { recursive: true });
		const out = execFileSync(process.execPath, [join(import.meta.dirname, 'ideal-image-run.mjs'), path, join(website, '../packages'), JSON.stringify(options)], { cwd: website, maxBuffer: 1 << 28 });
		writeFileSync(file, out);
	}
	const { module, emitted: files } = JSON.parse(readFileSync(file, 'utf8'));
	for (const [name, base64] of Object.entries(files)) idealFiles.set(`/${name}`, base64);
	const mod = { exports: {} };
	new Function('module', '__webpack_public_path__', '__webpack_require__', module)(mod, '/', { p: '/' });
	void emitted;
	return mod.exports;
}
