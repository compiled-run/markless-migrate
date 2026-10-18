// An imported SVG file is a component (the site's SVGR plugin): the file optimized by SVGO with the plugin's own
// config (ids prefixed per file), with the props as attributes on the <svg> and an optional <title>.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { h, render } from './h.mjs';
import { parseHtml } from './html.mjs';
import { website, siteRequire } from './site.mjs';

const pluginRequire = createRequire(join(website, '../packages/docusaurus-plugin-svgr/package.json'));
const svgoRequire = createRequire(pluginRequire.resolve('@svgr/plugin-svgo'));
const { optimize } = svgoRequire('svgo');
const { simpleHash } = siteRequire('@docusaurus/utils');

const file = new URL(import.meta.url).searchParams.get('file');
const prefix = `svg-${simpleHash(relative(website, file).split('\\').join('/'), 6)}-`;
const { data } = optimize(readFileSync(file, 'utf8'), {
	path: file,
	plugins: [
		{ name: 'preset-default', params: { overrides: { removeTitle: false, removeViewBox: false } } },
		{ name: 'prefixIds', params: { delim: '', prefix: () => prefix, prefixClassNames: false } },
	],
});
const [root] = parseHtml(data).filter((n) => typeof n !== 'string');
export default function Svg({ children, title, titleId, ...props }) {
	const extra = render(h('svg', props))[0].attrs;
	const merged = new Map(root.attrs);
	for (const [name, value] of extra) merged.set(name, value);
	return { tag: 'svg', attrs: [...merged, ...(title && titleId ? [['aria-labelledby', titleId]] : [])], children: [...(title ? [{ tag: 'title', attrs: titleId ? [['id', titleId]] : [], children: [title] }] : []), ...root.children] };
}
export const ReactComponent = Svg;
