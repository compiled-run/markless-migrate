import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import { defineConfig, type Plugin } from 'vite-plus';

// The shadcn-ui port's /create designer (examples/shadcn-ui-markless/lib/site), built alone: its lib/parts, which convert
// copies from the repository's parts (and git ignores), is the repository's parts here.
const APP_PARTS = fileURLToPath(new URL('../../examples/shadcn-ui-markless/lib/parts/', import.meta.url));
const PARTS = fileURLToPath(new URL('../../parts/', import.meta.url));

const repositoryParts = (): Plugin => ({
	name: 'repository-parts',
	enforce: 'pre',
	resolveId(source, importer) {
		if (!importer || !source.startsWith('.')) return null;
		const path = resolve(dirname(importer.split('?')[0]!), source);
		return path.startsWith(APP_PARTS) ? PARTS + path.slice(APP_PARTS.length) : null;
	},
});

export default defineConfig({
	plugins: [repositoryParts(), markless(), router({ prefetch: false })],
});
