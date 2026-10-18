// The old build's one stylesheet (copied into public/ as is), and the hashed names its CSS modules got there.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { website } from './site.mjs';

const dir = join(website, 'build/assets/css');
export const stylesheetName = readdirSync(dir).find((file) => /^styles\.[0-9a-f]+\.css$/.test(file));
export const stylesheet = readFileSync(join(dir, stylesheetName), 'utf8');

const minify = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
const built = minify(stylesheet);

// Each local class of a CSS module file is the built class `<local>_<4 chars>`. When several modules use the same
// local name, the candidate is the one whose rules match the module's, else the one built next to the module's
// other classes (a module's rules stay together in the bundle).
const sortedRules = (css, name) =>
	[...css.matchAll(new RegExp(`\\.${name.replace(/-/g, '\\-')}(?![\\w-])[^{}]*\\{([^{}]*)\\}`, 'g'))]
		.map((m) => m[1].split(';').map((d) => d.replace(/\s+/g, '').toLowerCase().replace(/(^|[^\d.])0\.(\d)/g, '$1.$2')).filter(Boolean).sort().join(';'))
		.filter((rule, i, all) => all.indexOf(rule) === i)
		.sort()
		.join('|');
export function cssModuleMap(file) {
	const source = minify(readFileSync(file, 'utf8'));
	const locals = [...new Set([...source.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]))];
	const candidatesOf = (local) => [...new Set([...built.matchAll(new RegExp(`\\.${local.replace(/-/g, '\\-')}_([\\w-]{4})(?![\\w-])`, 'g'))].map((m) => `${local}_${m[1]}`))];
	const map = {};
	const anchors = [];
	const ambiguous = [];
	for (const local of locals) {
		const candidates = candidatesOf(local);
		if (candidates.length === 0) continue;
		if (candidates.length === 1) {
			map[local] = candidates[0];
			anchors.push(built.indexOf(`.${candidates[0]}`));
			continue;
		}
		const wanted = sortedRules(source, local);
		const matching = candidates.filter((name) => sortedRules(built, name) === wanted);
		if (matching.length === 1) {
			map[local] = matching[0];
			anchors.push(built.indexOf(`.${matching[0]}`));
		} else ambiguous.push([local, matching.length ? matching : candidates]);
	}
	for (const [local, candidates] of ambiguous) {
		const center = anchors.length ? anchors.sort((a, b) => a - b)[Math.floor(anchors.length / 2)] : 0;
		map[local] = candidates.map((name) => [name, Math.abs(built.indexOf(`.${name}`) - center)]).sort((a, b) => a[1] - b[1])[0][0];
	}
	for (const local of locals) map[local] ??= local;
	return map;
}
