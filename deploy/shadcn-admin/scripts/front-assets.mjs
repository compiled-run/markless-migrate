// Adds the new app's assets to the front door's vercel.json. `config --vercel` keeps an asset on the old app when
// the old app answers it, and this old app is an SPA that answers every path with index.html (200 text/html), so
// it kept /build/*.js and the stylesheet there (T6 in examples/shadcn-admin-LOG.md). An asset counts as the new
// app's when the new app serves it as something other than HTML and the old app only has its fallback page.
// Usage: node front-assets.mjs <vercel.json> <old origin> <new origin> <page>...
import { readFile, writeFile } from 'node:fs/promises';
import { assetSources, pageAssets } from '../../../src/switch/deploy.ts';

const [file, oldOrigin, newOrigin, ...pages] = process.argv.slice(2);
const type = async (origin, path) => {
	const response = await fetch(new URL(path, origin)).catch(() => undefined);
	await response?.body?.cancel();
	return response?.ok ? (response.headers.get('content-type') ?? '') : undefined;
};
const fallback = (t) => t === undefined || t.startsWith('text/html');
const found = [];
for (const path of await pageAssets(newOrigin, pages)) {
	const [mine, theirs] = await Promise.all([type(newOrigin, path), type(oldOrigin, path)]);
	if (mine !== undefined && !mine.startsWith('text/html') && fallback(theirs)) found.push(path);
}
const oldAssets = (await pageAssets(oldOrigin, pages)).filter((p) => !found.includes(p));
const config = JSON.parse(await readFile(file, 'utf8'));
const next = newOrigin.replace(/\/+$/, '');
const have = new Set(config.rewrites.map((r) => r.source));
const added = assetSources(found, oldAssets)
	.map((s) => (s.endsWith('/**') ? `${s.slice(0, -3)}/:path*` : s))
	.filter((s) => !have.has(s))
	.map((source) => ({ source, destination: `${next}${source}` }));
const at = config.rewrites.findIndex((r) => r.destination.startsWith(oldOrigin.replace(/\/+$/, '')));
config.rewrites.splice(at < 0 ? config.rewrites.length : at, 0, ...added);
await writeFile(file, `${JSON.stringify(config, null, '\t')}\n`);
process.stdout.write(`${added.length} asset rewrites to the new app: ${added.map((r) => r.source).join(', ')}\n`);
