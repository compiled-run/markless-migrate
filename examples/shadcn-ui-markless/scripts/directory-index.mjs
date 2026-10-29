// Writes lib/site/directory/: index.json (each registry's name, homepage and description, in registry/directory.json's
// order) and logos/<slug>.svg (each logo as a <symbol id="logo"> an inline <svg><use> draws, so the page's colour
// variables still reach it). Usage: node scripts/directory-index.mjs <old app dir>
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [old = '../../deploy/shadcn-ui/old/apps/v4'] = process.argv.slice(2);
const out = new URL('../lib/site/directory/', import.meta.url).pathname;
const directory = JSON.parse(readFileSync(join(old, 'registry/directory.json'), 'utf8'));
rmSync(join(out, 'logos'), { recursive: true, force: true });
mkdirSync(join(out, 'logos'), { recursive: true });
export const slug = (name) => name.replace(/^@/, '').replace(/[^\w-]+/g, '-');
const index = directory.map(({ name, homepage, description, logo }) => {
	// A blank logo (one entry has a space) draws nothing, as an empty dangerouslySetInnerHTML does.
	if (!logo.trim()) return { name, homepage, description, logo: '', viewBox: '' };
	const open = /^<svg\b([^>]*)>/.exec(logo.trim());
	if (!open) throw new Error(`${name}: the logo is no <svg>`);
	const attrs = open[1];
	const viewBox = /\bviewBox=(['"])([^'"]*)\1/.exec(attrs)?.[2] ?? `0 0 ${/\bwidth=(['"])(\d+)/.exec(attrs)?.[2] ?? 24} ${/\bheight=(['"])(\d+)/.exec(attrs)?.[2] ?? 24}`;
	// What the root's own attributes set for its children (fill, stroke...) moves to a group inside the symbol; the
	// page's fill-foreground class on the drawing <svg> still wins over a fill attribute, as it does inline.
	const inherited = [...attrs.matchAll(/\b(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|fill-rule|clip-rule|style|color)=(['"])([^'"]*)\2/g)].filter(([, n]) => n !== 'fill').map(([all]) => all).join(' ');
	const body = logo.trim().slice(open[0].length).replace(/<\/svg>\s*$/, '');
	writeFileSync(join(out, 'logos', `${slug(name)}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><symbol id="logo" viewBox="${viewBox}"><g ${inherited}>${body}</g></symbol></svg>\n`);
	return { name, homepage, description, logo: slug(name), viewBox };
});
writeFileSync(join(out, 'index.json'), JSON.stringify(index) + '\n');
console.log(`${index.length} registries`);
