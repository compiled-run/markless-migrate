// The parity port of lucide-react and @radix-ui/react-icons: each icon the ported routes use, rendered
// once by the old app's own React so the SVG is byte-for-byte what it drew, written as a .tsrx component.
// Usage: node scripts/port-icons.mjs <old app> <route>...
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const [oldArg, ...routes] = process.argv.slice(2);
const oldApp = (await import('node:path')).resolve(oldArg);
const app = join(import.meta.dirname, '..');
const require = createRequire(join(oldApp, 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const libraries = JSON.parse(await readFile(join(app, '.migrate/libraries.json'), 'utf8'));
const onRoutes = (s) => !routes.length || (s.routes ?? []).some((r) => routes.includes(r));

const PACKS = [
	{ library: 'lucide-react', dir: 'lucide-react', base: (name) => true },
	{ library: '@radix-ui/react-icons', dir: 'radix-ui-react-icons', base: () => false },
];

const attrName = (a) => a;
for (const pack of PACKS) {
	const lib = libraries.libraries.find((l) => l.name === pack.library);
	if (!lib) continue;
	const mod = require(pack.library);
	const names = lib.exports.filter((e) => e.sites.some(onRoutes)).map((e) => e.name).filter((n) => typeof mod[n] === 'object' || typeof mod[n] === 'function').sort();
	const out = [`// Parity port of ${pack.library} for ${routes.join(', ') || 'every route'}: the ${names.length} icons those routes render, as the old app drew them.`, "import { computed } from '@markless/core';", '', 'export type IconProps = {', '\treadonly class?: string;', ...(pack.library === 'lucide-react' ? ['\treadonly size?: number;', "\treadonly 'aria-hidden'?: boolean | 'true' | 'false';"] : []), '};', ''];
	for (const name of names) {
		const svg = renderToStaticMarkup(React.createElement(mod[name], { className: '__CLS__', ...(pack.library === 'lucide-react' ? { size: 7777 } : {}) }));
		const base = /class="([^"]*?)\s*__CLS__"/.exec(svg)?.[1] ?? '';
		let body = svg
			.replace(/class="[^"]*__CLS__"/, `class={${name}Class}`)
			.replace(/width="7777"/, `width={${name}Size}`)
			.replace(/height="7777"/, `height={${name}Size}`)
			.replace(/<(path|circle|rect|line|polyline|polygon|ellipse)([^>]*)><\/\1>/g, '<$1$2 />');
		out.push(`export function ${name}({ class: klass${pack.library === 'lucide-react' ? ', size' : ''} }: IconProps) @{`);
		// One name per icon: computed values that share a name across components of one file collide in Markless 0.4.0.
		out.push(base ? `\tconst ${name}Class = computed(() => (klass ? ${JSON.stringify(`${base} `)} + klass : ${JSON.stringify(base)}));` : `\tconst ${name}Class = computed(() => klass);`);
		if (pack.library === 'lucide-react') out.push(`\tconst ${name}Size = computed(() => size ?? 24);`);
		out.push(`\t${body}`);
		out.push('}', '');
	}
	await mkdir(join(app, 'lib/parity', pack.dir), { recursive: true });
	await writeFile(join(app, 'lib/parity', pack.dir, 'components.tsrx'), out.join('\n'));
	await writeFile(join(app, 'lib/parity', pack.dir, 'index.ts'), `export * from './components.tsrx';\n`);
	process.stdout.write(`${pack.library}: ${names.length} icons -> lib/parity/${pack.dir}/components.tsrx\n`);
}
