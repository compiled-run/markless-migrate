// An imported SVG file is a component (SVGR): the file's markup, with the props as attributes on the <svg>.
import { readFileSync } from 'node:fs';
import { h, render } from './h.mjs';
import { parseHtml } from './html.mjs';
const file = new URL(import.meta.url).searchParams.get('file');
const [root] = parseHtml(readFileSync(file, 'utf8').replace(/<\?xml[^>]*\?>/, '')).filter((n) => typeof n !== 'string');
function rename(attrs) {
	return attrs;
}
export default function Svg({ children, title, ...props }) {
	const extra = render(h('svg', props))[0].attrs;
	const merged = new Map(rename(root.attrs));
	for (const [name, value] of extra) merged.set(name, value);
	return { tag: 'svg', attrs: [...merged], children: [...(title ? [{ tag: 'title', attrs: [], children: [title] }] : []), ...root.children] };
}
export const ReactComponent = Svg;
